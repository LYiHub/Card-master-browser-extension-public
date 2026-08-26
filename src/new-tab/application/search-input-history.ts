export const NEW_TAB_SEARCH_INPUT_HISTORY_STORAGE_KEY =
  'card-master.new-tab.search-input-history.v1';

const DEFAULT_MAX_ENTRIES = 50;
const MAX_ENTRY_LENGTH = 4_096;

export type NewTabSearchHistoryDirection = 'previous' | 'next';

export function normalizeNewTabSearchHistory(
  value: unknown,
  maximum = DEFAULT_MAX_ENTRIES,
) {
  const limit = Math.max(1, Math.round(maximum));
  const entries: string[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const entry = String(item ?? '')
      .trim()
      .slice(0, MAX_ENTRY_LENGTH);
    if (!entry) continue;
    const existing = entries.indexOf(entry);
    if (existing >= 0) entries.splice(existing, 1);
    entries.push(entry);
  }
  return entries.slice(-limit);
}

export function newTabSearchHistoryDirection(
  event: Pick<
    KeyboardEvent,
    'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
  >,
): NewTabSearchHistoryDirection | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }
  if (event.code === 'ArrowUp' || event.key === 'ArrowUp') return 'previous';
  if (event.code === 'ArrowDown' || event.key === 'ArrowDown') return 'next';
  return null;
}

export class NewTabSearchInputHistory {
  private entries: string[] = [];
  private cursor = 0;
  private draft = '';

  constructor(
    initialValue: unknown,
    private readonly maximum = DEFAULT_MAX_ENTRIES,
  ) {
    this.replace(initialValue);
  }

  replace(value: unknown) {
    this.entries = normalizeNewTabSearchHistory(value, this.maximum);
    this.resetNavigation();
  }

  record(value: string) {
    const entry = value.trim().slice(0, MAX_ENTRY_LENGTH);
    if (!entry) return false;
    this.entries = this.entries.filter((item) => item !== entry);
    this.entries.push(entry);
    this.entries = this.entries.slice(-this.maximum);
    this.resetNavigation();
    return true;
  }

  move(direction: NewTabSearchHistoryDirection, currentValue: string) {
    if (this.entries.length === 0) {
      return { handled: false, value: currentValue };
    }
    if (direction === 'previous') {
      if (this.cursor >= this.entries.length) {
        this.cursor = this.entries.length;
        this.draft = currentValue;
      }
      this.cursor = Math.max(0, this.cursor - 1);
      return {
        handled: true,
        value: this.entries[this.cursor] ?? currentValue,
      };
    }
    if (this.cursor >= this.entries.length) {
      return { handled: false, value: currentValue };
    }
    if (this.cursor < this.entries.length - 1) {
      this.cursor += 1;
      return {
        handled: true,
        value: this.entries[this.cursor] ?? currentValue,
      };
    }
    this.cursor = this.entries.length;
    return { handled: true, value: this.draft };
  }

  resetNavigation() {
    this.cursor = this.entries.length;
    this.draft = '';
  }

  snapshot() {
    return [...this.entries];
  }
}
