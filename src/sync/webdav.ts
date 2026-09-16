import { readResponseTextWithinLimit } from '../lib/response-text';
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
        GET: '读取文件',
        PUT: '写入文件',
        MKCOL: '创建目录',
        PROPFIND: '列举目录',
        DELETE: '清理测试文件',
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
      this.note(`${label}：请求未完成。`);
      throw new Error(
        `${label}失败：请检查网络、HTTPS 证书和最终目录地址；本机数据已保留。`,
      );
    }
    this.note(`${label}：HTTP ${response.status}`);
    if (response.status === 401 || response.status === 403)
      throw new Error(
        `${label}被拒绝（HTTP ${response.status}），请检查账号、应用密码和目录权限。`,
      );
    if (
      !response.ok &&
      response.status !== 404 &&
      !(method === 'MKCOL' && response.status === 405)
    ) {
      const hint =
        response.status === 409
          ? '父目录不存在，请先在 WebDAV 中创建父目录。'
          : '请检查服务端及反向代理是否允许该请求方法。';
      throw new Error(`${label}失败（HTTP ${response.status}）。${hint}`);
    }
    return response;
  }

  private async list() {
    const response = await this.request('', 'PROPFIND', LIST_BODY);
    if (response.status !== 207)
      throw new Error(
        `列举目录失败：返回 HTTP ${response.status}，期望 WebDAV 207。请检查最终目录地址和 PROPFIND 支持。`,
      );
    const xml = await readResponseTextWithinLimit(
      response,
      8 * 1024 * 1024,
      '目录列表超过 8 MB，已暂停同步。',
    );
    return parseDavListing(xml, new URL(this.directory));
  }

  private async readRecord(
    id: string,
    cached: boolean,
  ): Promise<{ record: SyncRecord; bytes: number }> {
    const previous = cached ? this.cache.get(id) : undefined;
    if (previous) return previous;
    if (!isRevisionId(id)) throw new Error('同步版本标识无效。');
    const response = await this.request(`rev-${id}.json`, 'GET');
    if (response.status === 404)
      throw new Error(
        '同步历史文件暂不可读或已被删除，请检查目录及代理缓存后重试。',
      );
    const text = await readResponseTextWithinLimit(
      response,
      SYNC_MAX_SNAPSHOT_BYTES + 1024 * 1024,
      '单个同步版本超过 65 MB，已停止读取。',
    );
    let record: unknown;
    try {
      record = JSON.parse(text);
    } catch {
      throw new Error(
        '同步版本尚未完整写入或已损坏，请稍后重试。本机数据已保留。',
      );
    }
    validateRecord(record);
    if (record.id !== id) throw new Error('版本文件名与内容不一致。');
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
        throw new Error(
          '同步空间已达到 4096 个版本，请保留目录备份后使用新的同步目录。',
        );
      const end = Math.min(offset + 4, pending.length);
      const batch = await Promise.all(
        pending.slice(offset, end).map(async (id) => {
          if (!listed.has(id)) {
            const published = await this.request(`done-${id}`, 'GET');
            if (!published.ok)
              throw new Error(
                '同步历史缺少已发布的版本，请检查目录及代理缓存后重试。',
              );
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
          throw new Error(
            '同步历史超过 257 MB，已暂停同步，请保留备份后使用新的同步目录。',
          );
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
        '已有版本内容过大。',
      );
      if (body === canonical(record)) {
        await this.publish(record.id);
        return;
      }
      // The content-addressed name permits retrying precisely these bytes after an interrupted PUT.
      this.note('正在重新写入未完整保存的相同版本。');
    }
    const response = await this.request(path, 'PUT', canonical(record));
    if (!response.ok) throw new Error('版本目录不存在，请重新连接同步空间。');
    const stored = await this.readRecord(record.id, false);
    if (canonical(stored.record) !== canonical(record))
      throw new Error('版本写入后读回内容不一致，未标记为同步成功。');
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
      throw new Error('版本发布标记未能保存，本机数据已保留，稍后会重试。');
  }

  async test() {
    this.diagnostics.length = 0;
    this.note(`实际同步目录：${this.directory}`);
    for (const path of ['../', '']) {
      const response = await this.request(path, 'MKCOL');
      if (!response.ok && response.status !== 405)
        throw new Error('同步目录无法创建，请先确认填写的父目录存在。');
    }
    const name = `probe-${crypto.randomUUID()}.json`;
    const body = JSON.stringify({ probe: crypto.randomUUID() });
    try {
      const written = await this.request(name, 'PUT', body);
      if (!written.ok) throw new Error('同步目录不可写。');
      const response = await this.request(name, 'GET');
      if (
        !response.ok ||
        (await readResponseTextWithinLimit(
          response,
          4096,
          '测试文件返回内容过大。',
        )) !== body
      ) {
        throw new Error(
          '测试文件读回失败或内容不一致，请检查代理缓存和 WebDAV 服务。',
        );
      }
      this.note(
        response.headers.has('etag')
          ? '服务返回 ETag；独立版本同步无需条件写入。'
          : '服务未返回 ETag；独立版本同步无需 ETag／If-Match。',
      );
      if (!(await this.list()).includes(name))
        throw new Error(
          'PROPFIND 未列出刚写入的测试文件，请检查目录权限、列表完整性及代理缓存。',
        );
      this.note('目录读写与文件可见性检查通过。');
    } finally {
      await this.request(name, 'DELETE').catch(() =>
        this.note('测试文件清理未完成，可在 WebDAV 目录手动删除 probe 文件。'),
      );
    }
  }
}
