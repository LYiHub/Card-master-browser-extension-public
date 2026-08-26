export class CleanupScope {
  private readonly cleanups: Array<() => void> = [];
  private disposed = false;

  constructor(private readonly onError: (error: unknown) => void) {}

  add(cleanup: () => void) {
    if (this.disposed) {
      this.run(cleanup);
      return;
    }
    this.cleanups.push(cleanup);
  }

  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      this.run(cleanup);
    }
  };

  private run(cleanup: () => void) {
    try {
      cleanup();
    } catch (error) {
      this.onError(error);
    }
  }
}
