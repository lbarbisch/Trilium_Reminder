import type { Op, Status } from '../shared/types';
import type { SyncEngine } from './sync';
import { classifyError } from './trilium';

/** Waits after network errors: 1, 2, 5 and 10 seconds, then every 30 seconds. */
export const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/** Short wait after an action, so a quick series of clicks is sent in one save. */
export const ACTION_DELAY_MS = 500;
/** Periodic refresh while the window is visible. */
export const VISIBLE_INTERVAL_MS = 60_000;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export interface SyncServiceOptions {
  /** Called whenever status, notice or the shown list may have changed. */
  onChange(): void;
  /** Called when Trilium rejects the token. */
  onAuthError(): void;
  log?(message: string): void;
  clock?: Clock;
}

export function describeSkipped(skipped: Op[]): string {
  const n = skipped.length;
  return n === 1
    ? '1 change was not applied: its item was deleted in Trilium or the move crossed levels.'
    : `${n} changes were not applied: their items were deleted in Trilium or the moves crossed levels.`;
}

/** Decides when to sync, retries and reports status. */
export class SyncService {
  status: Status;
  notice: string | undefined;
  syncing = false;

  private readonly clock: Clock;
  private timer: unknown = null;
  private timerAt = Infinity;
  private interval: unknown = null;
  private retryIndex = 0;
  /** Set after an error that retrying on a timer cannot fix. */
  private paused: 'auth' | 'error' | null = null;
  private again = false;
  private current: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly engine: SyncEngine,
    private readonly opts: SyncServiceOptions,
  ) {
    this.clock = opts.clock ?? systemClock;
    this.status = { kind: 'offline', pending: engine.pending };
  }

  /** An action was queued. */
  actionAdded(): void {
    if (this.status.kind === 'offline')
      this.status = { kind: 'offline', pending: this.engine.pending };
    if (!this.paused) this.schedule(ACTION_DELAY_MS);
  }

  /** The window was shown by a trigger. Retries after errors, but not after a rejected token. */
  wake(): void {
    if (this.paused === 'auth') return;
    this.paused = null;
    this.retryIndex = 0;
    this.schedule(0);
  }

  /** "Sync now": always tries, and resolves when that sync is over. */
  syncNow(): Promise<void> {
    this.paused = null;
    this.retryIndex = 0;
    this.clearTimer();
    return this.run();
  }

  setVisible(visible: boolean): void {
    if (visible && this.interval === null && !this.stopped) {
      this.interval = this.clock.setInterval(() => {
        if (!this.paused) this.schedule(0);
      }, VISIBLE_INTERVAL_MS);
    } else if (!visible && this.interval !== null) {
      this.clock.clearInterval(this.interval);
      this.interval = null;
    }
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.setVisible(false);
  }

  /** Resolves when no sync is running (for shutdown and tests). */
  async idle(): Promise<void> {
    while (this.current) await this.current;
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.timerAt = Infinity;
  }

  /** Runs a sync after ms, unless one is already planned sooner. */
  private schedule(ms: number): void {
    if (this.stopped) return;
    const at = this.clock.now() + ms;
    if (this.timer !== null && this.timerAt <= at) return;
    this.clearTimer();
    this.timerAt = at;
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.timerAt = Infinity;
      void this.run();
    }, ms);
  }

  private run(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.current) {
      this.again = true;
      return this.current;
    }
    this.current = this.attempt().finally(() => {
      this.current = null;
      if (this.again && !this.paused && !this.stopped) {
        this.again = false;
        this.schedule(0);
      }
    });
    return this.current;
  }

  private async attempt(): Promise<void> {
    this.syncing = true;
    this.again = false;
    this.opts.onChange();
    try {
      const skipped = await this.engine.sync();
      this.retryIndex = 0;
      this.status = { kind: 'synced', at: new Date(this.clock.now()).toISOString() };
      if (skipped.length > 0) {
        this.notice = describeSkipped(skipped);
        this.opts.log?.(`skipped ${skipped.length} action(s)`);
      }
      // Actions added during the save are still queued.
      if (this.engine.pending > 0) this.again = true;
    } catch (err) {
      const { kind, message } = classifyError(err);
      this.opts.log?.(`sync failed (${kind}): ${message}`);
      this.again = false;
      switch (kind) {
        case 'offline':
        case 'retry': {
          this.status =
            kind === 'offline'
              ? { kind: 'offline', pending: this.engine.pending }
              : { kind: 'error', message };
          const delay = RETRY_DELAYS_MS[Math.min(this.retryIndex, RETRY_DELAYS_MS.length - 1)];
          this.retryIndex++;
          this.schedule(delay);
          break;
        }
        case 'auth':
          this.paused = 'auth';
          this.status = { kind: 'auth-error' };
          this.opts.onAuthError();
          break;
        case 'not-found':
          this.paused = 'error';
          this.status = {
            kind: 'error',
            message: 'The note was not found. Check the note ID in Settings.',
          };
          break;
        default:
          this.paused = 'error';
          this.status = { kind: 'error', message };
      }
    } finally {
      this.syncing = false;
      this.opts.onChange();
    }
  }
}
