import type { ExtensionStorageArea } from './api';
import {
  AI_CONVERSATION_STORAGE_KEY,
  normalizeAssistantState,
  prepareAssistantStateForPersistence,
  type StoredAssistantState,
  trimAssistantState,
} from './assistant-state';

export class ExtensionAssistantStateStore {
  private state: StoredAssistantState | null = null;
  private loading: Promise<StoredAssistantState> | null = null;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: ExtensionStorageArea) {}

  async read() {
    if (this.state) return this.state;
    if (!this.loading) {
      this.loading = this.storage
        .get(AI_CONVERSATION_STORAGE_KEY)
        .then((stored) => {
          this.state = normalizeAssistantState(
            stored[AI_CONVERSATION_STORAGE_KEY],
          );
          return this.state;
        })
        .finally(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }

  async persist() {
    const state = this.state ?? (await this.read());
    trimAssistantState(state);
    const persisted = prepareAssistantStateForPersistence(state);
    const pending = this.persistQueue.then(() =>
      this.storage.set({
        [AI_CONVERSATION_STORAGE_KEY]: persisted,
      }),
    );
    this.persistQueue = pending.catch(() => undefined);
    await pending;
  }
}
