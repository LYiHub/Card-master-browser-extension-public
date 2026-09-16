import {
  SYNC_MAX_DOCUMENT_BYTES,
  type SyncConnection,
  type SyncDocument,
  validateDocument,
} from './model';

export class SyncRemoteChanged extends Error {
  constructor() {
    super('另一台设备刚更新了数据，请查看最新合并结果。');
  }
}

export type RemoteSnapshot = {
  document: SyncDocument | null;
  etag: string | null;
};

export class WebDavSync {
  private readonly root: string;
  private readonly authorization: string;

  constructor(
    connection: SyncConnection,
    private readonly fetcher: typeof fetch = globalThis.fetch,
  ) {
    this.root = new URL('card-master-sync/', connection.url).href;
    const bytes = new TextEncoder().encode(
      `${connection.username}:${connection.password}`,
    );
    this.authorization = `Basic ${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
  }

  private async request(
    path: string,
    method: string,
    body?: string,
    condition?: { name: string; value: string },
  ) {
    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.root), {
        method,
        body,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: this.authorization,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(condition ? { [condition.name]: condition.value } : {}),
        },
      });
    } catch {
      throw new Error(
        '暂时无法连接同步服务，本机修改已保留。请检查网络和 WebDAV 地址。',
      );
    }
    if (response.status === 401 || response.status === 403)
      throw new Error('同步服务拒绝访问，请检查账号、应用密码和目录权限。');
    if (response.status === 412) throw new SyncRemoteChanged();
    if (
      !response.ok &&
      response.status !== 404 &&
      !(method === 'MKCOL' && response.status === 405)
    ) {
      throw new Error(`同步服务返回 HTTP ${response.status}，本机修改已保留。`);
    }
    return response;
  }

  private etag(response: Response) {
    const tag = response.headers.get('etag');
    if (!tag || !/^"[^"\r\n]+"$/.test(tag))
      throw new Error(
        '该 WebDAV 服务未提供可靠的版本标识，无法开启安全的双向同步。',
      );
    return tag;
  }

  async read(): Promise<RemoteSnapshot> {
    const response = await this.request('workspace.json', 'GET');
    if (response.status === 404) return { document: null, etag: null };
    const reader = response.body?.getReader();
    if (!reader) throw new Error('同步服务没有返回有效内容。');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > SYNC_MAX_DOCUMENT_BYTES)
          throw new Error('远端同步文件超过 16 MB，已停止读取。');
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    let document: unknown;
    try {
      document = JSON.parse(await new Blob(chunks as BlobPart[]).text());
    } catch {
      throw new Error('远端同步文件损坏，本机数据已保留。');
    }
    validateDocument(document);
    return { document, etag: this.etag(response) };
  }

  async write(document: SyncDocument, etag: string | null) {
    const response = await this.request(
      'workspace.json',
      'PUT',
      JSON.stringify(document),
      etag
        ? { name: 'If-Match', value: etag }
        : { name: 'If-None-Match', value: '*' },
    );
    if (!response.ok) throw new Error('同步目录不存在，请重新连接。');
  }

  async test() {
    const directory = await this.request('', 'MKCOL');
    if (!directory.ok && directory.status !== 405)
      throw new Error('无法创建同步目录，请确认父目录存在且允许写入。');
    const path = `probe-${crypto.randomUUID()}.json`;
    try {
      const created = await this.request(path, 'PUT', '{}', {
        name: 'If-None-Match',
        value: '*',
      });
      if (!created.ok) throw new Error('同步目录不允许写入。');
      const stored = await this.request(path, 'GET');
      if (!stored.ok || (await stored.text()) !== '{}')
        throw new Error('同步服务未能正确保存测试内容。');
      const tag = this.etag(stored);
      let rejected = false;
      try {
        await this.request(path, 'PUT', '{}', {
          name: 'If-Match',
          value: '"card-master-invalid-revision"',
        });
      } catch (error) {
        if (!(error instanceof SyncRemoteChanged)) throw error;
        rejected = true;
      }
      if (!rejected)
        throw new Error(
          '该 WebDAV 服务忽略了版本检查，无法开启安全的双向同步。',
        );
      const updated = await this.request(path, 'PUT', '{"verified":true}', {
        name: 'If-Match',
        value: tag,
      });
      if (!updated.ok) throw new Error('同步服务不支持条件写入。');
    } finally {
      await this.request(path, 'DELETE').catch(() => undefined);
    }
  }
}
