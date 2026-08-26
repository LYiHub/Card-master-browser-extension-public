import type { ContentBlockingSubscriptionContentStorage } from '../application/repository';

const DEFAULT_CACHE_NAME = 'card-master.content-blocking-subscriptions.v1';
const CACHE_URL_PREFIX =
  'https://content-blocking.card-master.invalid/subscriptions/';

export class CacheStorageSubscriptionContentStorage
  implements ContentBlockingSubscriptionContentStorage
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

  async write(contentKey: string, content: string) {
    await (await this.cache()).put(
      this.request(contentKey),
      new Response(content, {
        headers: { 'content-type': 'text/plain;charset=utf-8' },
      }),
    );
  }

  async remove(contentKey: string) {
    await (await this.cache()).delete(this.request(contentKey));
  }
}
