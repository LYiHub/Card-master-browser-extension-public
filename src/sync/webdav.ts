import { readResponseTextWithinLimit } from '../lib/response-text';
import { t } from '../localization/messages';
import { parseDavListing } from './dav-listing';
import {
  canonical,
  isRevisionId,
  SYNC_MAX_DOCUMENT_BYTES,
  SYNC_MAX_SNAPSHOT_BYTES,
  SYNC_MAX_VERSIONS,
  type SyncConnection,
  type SyncRecord,
  type SyncRemoteState,
  validateConnection,
  validateRecord,
} from './model';
import { resolveVersions, verifyRecord } from './versions';

export type RemoteSnapshot = SyncRemoteState;
const PUBLISHED_NAME = /^done-([a-f0-9]{64})$/;
const LIST_BODY =
  '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>';

export class WebDavSync {
  readonly directory: string;
  readonly diagnostics: string[] = [];
  private readonly authorization: string;
  private readonly cache = new Map<
    string,
    { record: SyncRecord; bytes: number }
  >();
  private cacheBytes = 0;

  constructor(
    connection: SyncConnection,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {
    const normalized = validateConnection(connection);
    this.directory = new URL(
      'card-master-sync/versions-v3/',
      normalized.url,
    ).href;
    const bytes = new TextEncoder().encode(
      `${normalized.username}:${normalized.password}`,
    );
    this.authorization = `Basic ${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
  }

  private note(message: string) {
    if (!this.diagnostics.includes(message)) this.diagnostics.push(message);
    if (this.diagnostics.length > 20) this.diagnostics.shift();
  }

  private async request(path: string, method: string, body?: string) {
    const label =
      {
        GET: t('cm_webdav_get_1'),
        PUT: t('cm_webdav_put_2'),
        MKCOL: t('cm_webdav_mkcol_3'),
        PROPFIND: t('cm_webdav_propfind_4'),
        DELETE: t('cm_webdav_delete_5'),
      }[method] ?? method;
    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.directory), {
        method,
        body,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: this.authorization,
          'Cache-Control': 'no-cache, no-store',
          ...(body === undefined
            ? {}
            : {
                'Content-Type':
                  method === 'PROPFIND'
                    ? 'application/xml; charset=utf-8'
                    : 'application/json',
              }),
          ...(method === 'PROPFIND' ? { Depth: '1' } : {}),
        },
      });
    } catch {
      this.note(t('cm_webdav_text_6', [String(label)]));
      throw new Error(t('cm_webdav_error_7', [String(label)]));
    }
    this.note(`${label}：HTTP ${response.status}`);
    if (response.status === 401 || response.status === 403)
      throw new Error(
        t('cm_webdav_error_8', [String(label), String(response.status)]),
      );
    if (
      !response.ok &&
      response.status !== 404 &&
      !(method === 'MKCOL' && response.status === 405)
    ) {
      const hint =
        response.status === 409
          ? t('cm_webdav_text_9')
          : t('cm_webdav_text_10');
      throw new Error(
        t('cm_webdav_error_11', [
          String(label),
          String(response.status),
          String(hint),
        ]),
      );
    }
    return response;
  }

  private async list() {
    const response = await this.request('', 'PROPFIND', LIST_BODY);
    if (response.status !== 207)
      throw new Error(t('cm_webdav_error_12', [String(response.status)]));
    const xml = await readResponseTextWithinLimit(
      response,
      8 * 1024 * 1024,
      t('cm_webdav_text_13'),
    );
    return parseDavListing(xml, new URL(this.directory));
  }

  private async readRecord(
    id: string,
    cached: boolean,
  ): Promise<{ record: SyncRecord; bytes: number }> {
    const previous = cached ? this.cache.get(id) : undefined;
    if (previous) return previous;
    if (!isRevisionId(id)) throw new Error(t('cm_webdav_error_14'));
    const response = await this.request(`rev-${id}.json`, 'GET');
    if (response.status === 404) throw new Error(t('cm_webdav_error_15'));
    const text = await readResponseTextWithinLimit(
      response,
      SYNC_MAX_SNAPSHOT_BYTES + 1024 * 1024,
      t('cm_webdav_text_16'),
    );
    let record: unknown;
    try {
      record = JSON.parse(text);
    } catch {
      throw new Error(t('cm_webdav_error_17'));
    }
    validateRecord(record);
    if (record.id !== id) throw new Error(t('cm_webdav_error_18'));
    await verifyRecord(record);
    const item = { record, bytes: new TextEncoder().encode(text).length };
    this.cacheBytes -= this.cache.get(id)?.bytes ?? 0;
    this.cache.set(id, item);
    this.cacheBytes += item.bytes;
    while (this.cacheBytes > 80 * 1024 * 1024 && this.cache.size > 1) {
      const first = this.cache.entries().next().value;
      if (!first) break;
      this.cache.delete(first[0]);
      this.cacheBytes -= first[1].bytes;
    }
    return item;
  }

  async read(knownHeads: readonly string[] = []): Promise<RemoteSnapshot> {
    const names = await this.list();
    const listed = new Set(
      names.flatMap((name) => PUBLISHED_NAME.exec(name)?.[1] ?? []),
    );
    const pending = [...new Set([...listed, ...knownHeads])];
    const records = new Map<string, SyncRecord>();
    let total = 0;
    // ponytail: retain immutable history; at 4096 versions pause instead of unsafe pruning of offline ancestors.
    for (let offset = 0; offset < pending.length; ) {
      if (pending.length > SYNC_MAX_VERSIONS)
        throw new Error(t('cm_webdav_error_19'));
      const end = Math.min(offset + 4, pending.length);
      const batch = await Promise.all(
        pending.slice(offset, end).map(async (id) => {
          if (!listed.has(id)) {
            const published = await this.request(`done-${id}`, 'GET');
            if (!published.ok) throw new Error(t('cm_webdav_error_20'));
          }
          return this.readRecord(
            id,
            listed.has(id) && names.includes(`rev-${id}.json`),
          );
        }),
      );
      offset = end;
      for (const { record, bytes } of batch) {
        if (records.has(record.id)) continue;
        total += bytes;
        if (total > SYNC_MAX_DOCUMENT_BYTES)
          throw new Error(t('cm_webdav_error_21'));
        records.set(record.id, record);
        for (const parent of record.parents)
          if (!pending.includes(parent)) pending.push(parent);
      }
    }
    return resolveVersions([...records.values()]);
  }

  async write(record: SyncRecord) {
    await verifyRecord(record);
    const path = `rev-${record.id}.json`;
    const existing = await this.request(path, 'GET');
    if (existing.status !== 404) {
      const body = await readResponseTextWithinLimit(
        existing,
        SYNC_MAX_SNAPSHOT_BYTES + 1024 * 1024,
        t('cm_webdav_text_22'),
      );
      if (body === canonical(record)) {
        await this.publish(record.id);
        return;
      }
      // The content-addressed name permits retrying precisely these bytes after an interrupted PUT.
      this.note(t('cm_webdav_text_23'));
    }
    const response = await this.request(path, 'PUT', canonical(record));
    if (!response.ok) throw new Error(t('cm_webdav_error_24'));
    const stored = await this.readRecord(record.id, false);
    if (canonical(stored.record) !== canonical(record))
      throw new Error(t('cm_webdav_error_25'));
    await this.publish(record.id);
  }

  private async publish(id: string) {
    // An empty marker is published only after the payload was read back and verified.
    // Incomplete uploads without a marker are drafts and cannot block other devices.
    const path = `done-${id}`;
    const existing = await this.request(path, 'GET');
    if (existing.ok) return;
    const response = await this.request(path, 'PUT', '');
    if (!response.ok || !(await this.request(path, 'GET')).ok)
      throw new Error(t('cm_webdav_error_26'));
  }

  async test() {
    this.diagnostics.length = 0;
    this.note(t('cm_webdav_text_27', [String(this.directory)]));
    for (const path of ['../', '']) {
      const response = await this.request(path, 'MKCOL');
      if (!response.ok && response.status !== 405)
        throw new Error(t('cm_webdav_error_28'));
    }
    const name = `probe-${crypto.randomUUID()}.json`;
    const body = JSON.stringify({ probe: crypto.randomUUID() });
    try {
      const written = await this.request(name, 'PUT', body);
      if (!written.ok) throw new Error(t('cm_webdav_error_29'));
      const response = await this.request(name, 'GET');
      if (
        !response.ok ||
        (await readResponseTextWithinLimit(
          response,
          4096,
          t('cm_webdav_text_30'),
        )) !== body
      ) {
        throw new Error(t('cm_webdav_error_31'));
      }
      this.note(
        response.headers.has('etag')
          ? t('cm_webdav_text_32')
          : t('cm_webdav_text_33'),
      );
      if (!(await this.list()).includes(name))
        throw new Error(t('cm_webdav_error_34'));
      this.note(t('cm_webdav_text_35'));
    } finally {
      await this.request(name, 'DELETE').catch(() =>
        this.note(t('cm_webdav_text_36')),
      );
    }
  }
}
