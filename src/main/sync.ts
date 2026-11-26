import type { Op } from '../shared/types';
import { applyOps, ensureIds } from './todoDoc';
import type { NoteApi } from './trilium';

export interface SyncState {
  cacheHtml: string;
  queue: Op[];
  lastRevisionDay: string;
}

export class SyncConflictError extends Error {
  constructor() {
    super('The note kept changing during sync. Trying again later.');
    this.name = 'SyncConflictError';
  }
}

export const emptyState = (): SyncState => ({ cacheHtml: '', queue: [], lastRevisionDay: '' });

export class SyncEngine {
  private running: Promise<Op[]> | null = null;

  constructor(
    private readonly api: NoteApi,
    readonly state: SyncState,
    private readonly persist: (s: SyncState) => void,
    // Local date as YYYY-MM-DD
    private readonly today: () => string = () => new Date().toLocaleDateString('sv-SE'),
  ) {}

  /** What the window shows: the cached note with unsent changes on top. */
  view(): string {
    return applyOps(this.state.cacheHtml, this.state.queue).html;
  }

  get pending(): number {
    return this.state.queue.length;
  }

  enqueue(op: Op): void {
    this.state.queue.push(op);
    this.persist(this.state);
  }

  /** Only one sync runs at a time. Resolves with the actions that had to be skipped. */
  sync(): Promise<Op[]> {
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<Op[]> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.api.getBlobId();
      const remote = await this.api.getContent();
      const batch = this.state.queue.slice();
      const { html, skipped } = applyOps(ensureIds(remote), batch);

      if (html !== remote) {
        if (this.state.lastRevisionDay !== this.today()) {
          await this.api.createRevision();
          this.state.lastRevisionDay = this.today();
          this.persist(this.state);
        }
        if ((await this.api.getBlobId()) !== before) continue; // note changed: start over
        await this.api.putContent(html);
      }

      this.state.queue.splice(0, batch.length); // actions added meanwhile stay queued
      this.state.cacheHtml = html;
      this.persist(this.state);
      return skipped;
    }
    throw new SyncConflictError();
  }
}
