export type GamepadActionFeedEntry = {
  id: number;
  label: string;
  count: number | null;
  expiresAt: number;
};

export type GamepadActionFeedInput = {
  label: string;
  persistentWhileHeld: boolean;
};

export class GamepadActionFeed {
  private readonly activeLabels = new Set<string>();
  private entries: GamepadActionFeedEntry[] = [];
  private sequence = 0;

  constructor(
    private readonly lifetimeMs = 1_800,
    private readonly maximumEntries = 3,
  ) {}

  update(actions: readonly GamepadActionFeedInput[], now: number) {
    this.prune(now);
    const nextActive = new Map<string, boolean>();
    for (const action of actions) {
      nextActive.set(
        action.label,
        action.persistentWhileHeld || nextActive.get(action.label) === true,
      );
    }
    for (const label of this.activeLabels) {
      if (nextActive.has(label)) continue;
      const entry = this.entries.find(
        (candidate) => candidate.label === label && candidate.count === null,
      );
      if (entry) entry.expiresAt = now + this.lifetimeMs;
    }
    for (const [label, persistentWhileHeld] of nextActive) {
      if (!this.activeLabels.has(label)) {
        this.record(label, persistentWhileHeld, now);
      }
    }
    this.activeLabels.clear();
    for (const label of nextActive.keys()) this.activeLabels.add(label);
    return this.current();
  }

  visible(now: number) {
    this.prune(now);
    return this.current();
  }

  nextExpiration() {
    return this.entries.reduce(
      (next, entry) => Math.min(next, entry.expiresAt),
      Number.POSITIVE_INFINITY,
    );
  }

  clear() {
    this.activeLabels.clear();
    this.entries = [];
  }

  private current() {
    return this.entries.map((entry) => ({ ...entry }));
  }

  private prune(now: number) {
    this.entries = this.entries.filter((entry) => entry.expiresAt > now);
  }

  private record(label: string, persistentWhileHeld: boolean, now: number) {
    const repeated = this.entries.find((entry) => entry.label === label);
    if (repeated) {
      if (persistentWhileHeld) {
        repeated.count = null;
        repeated.expiresAt = Number.POSITIVE_INFINITY;
        return;
      }
      repeated.count = (repeated.count ?? 0) + 1;
      repeated.expiresAt = now + this.lifetimeMs;
      this.entries = [
        repeated,
        ...this.entries.filter((entry) => entry !== repeated),
      ];
      return;
    }
    this.entries.unshift({
      id: ++this.sequence,
      label,
      count: persistentWhileHeld ? null : 1,
      expiresAt: persistentWhileHeld
        ? Number.POSITIVE_INFINITY
        : now + this.lifetimeMs,
    });
    this.entries = this.entries.slice(0, this.maximumEntries);
  }
}
