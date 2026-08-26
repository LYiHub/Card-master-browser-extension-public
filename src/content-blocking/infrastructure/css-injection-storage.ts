export interface ContentBlockingCssInjectionStorage {
  read(contentKey: string): Promise<string | undefined>;
  write(contentKey: string, css: string): Promise<void>;
  remove(contentKey: string): Promise<void>;
  readOwnership(): Promise<unknown>;
  writeOwnership(ownership: unknown): Promise<void>;
}

const DEFAULT_CACHE_NAME = 'card-master.content-blocking-css.v1';
const CACHE_URL_PREFIX =
  'https://content-blocking.card-master.invalid/css-injections/';
const OWNERSHIP_URL =
  'https://content-blocking.card-master.invalid/rule-ownership';

export class CacheStorageCssInjectionStorage
  implements ContentBlockingCssInjectionStorage
{
  constructor(
    private readonly cacheStorage: CacheStorage,
    private readonly cacheName = DEFAULT_CACHE_NAME,
  ) {}

  private request(contentKey: string) {
    return new Request(`${CACHE_URL_PREFIX}${encodeURIComponent(contentKey)}`);
  }

  private cache() {
    return this.cacheStorage.open(this.cacheName);
  }

  async read(contentKey: string) {
    const response = await (await this.cache()).match(this.request(contentKey));
    return response ? response.text() : undefined;
  }

  async write(contentKey: string, css: string) {
    await (await this.cache()).put(
      this.request(contentKey),
      new Response(css, {
        headers: { 'content-type': 'text/css;charset=utf-8' },
      }),
    );
  }

  async remove(contentKey: string) {
    await (await this.cache()).delete(this.request(contentKey));
  }

  async readOwnership() {
    const response = await (await this.cache()).match(OWNERSHIP_URL);
    return response ? response.json() : undefined;
  }

  async writeOwnership(ownership: unknown) {
    await (await this.cache()).put(
      OWNERSHIP_URL,
      new Response(JSON.stringify(ownership), {
        headers: { 'content-type': 'application/json;charset=utf-8' },
      }),
    );
  }
}
