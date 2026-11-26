export class TriliumError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 for a problem with an otherwise successful answer. */
    readonly status: number,
  ) {
    super(message);
    this.name = 'TriliumError';
  }
}

export interface NoteApi {
  getBlobId(): Promise<string>;
  getContent(): Promise<string>;
  putContent(html: string): Promise<void>;
  createRevision(): Promise<void>;
}

export const TIMEOUT_MS = 10_000;

export function triliumNote(
  serverUrl: string,
  token: string,
  noteId: string,
  fetchImpl: typeof fetch = fetch,
): NoteApi {
  const base = `${serverUrl.replace(/\/+$/, '')}/etapi/notes/${encodeURIComponent(noteId)}`;

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetchImpl(base + path, {
      ...init,
      headers: { Authorization: token, ...init.headers },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      throw new TriliumError('The server redirected the request. Enter the final address.', 0);
    }
    if (!res.ok) throw new TriliumError(`Trilium answered ${res.status}`, res.status);
    return res;
  }

  return {
    async getBlobId() {
      const res = await call('');
      let note: { blobId?: unknown; isProtected?: unknown; type?: unknown };
      try {
        note = (await res.json()) as typeof note;
      } catch {
        throw new TriliumError('The server did not answer like Trilium. Check the address.', 0);
      }
      if (note.isProtected) throw new TriliumError('The todo note must not be protected', 0);
      if (note.type !== undefined && note.type !== 'text') {
        throw new TriliumError('The todo note must be a text note', 0);
      }
      if (typeof note.blobId !== 'string' || !note.blobId) {
        throw new TriliumError('No blobId in the response', 0);
      }
      return note.blobId;
    },
    async getContent() {
      return (await call('/content')).text();
    },
    async putContent(html) {
      await call('/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: html,
      });
    },
    async createRevision() {
      await call('/revision', { method: 'POST' });
    },
  };
}

export type ErrorKind =
  /** Trilium is not reachable: show the offline state and retry on a schedule. */
  | 'offline'
  /** 429, 5xx or a note that kept changing: retry on a schedule. */
  | 'retry'
  /** 401: the token was rejected. Pause until the settings change. */
  | 'auth'
  /** 404: wrong note ID or deleted note. */
  | 'not-found'
  /** Anything else: show the message and wait for a manual retry. */
  | 'fatal';

/** Turns any error thrown by a sync into a kind and a message that is safe to show and log. */
export function classifyError(err: unknown): { kind: ErrorKind; message: string } {
  if (err instanceof TriliumError) {
    if (err.status === 401) return { kind: 'auth', message: 'Trilium rejected the token.' };
    if (err.status === 404) return { kind: 'not-found', message: 'The note was not found.' };
    if (err.status === 429 || err.status >= 500) return { kind: 'retry', message: err.message };
    return { kind: 'fatal', message: err.message };
  }
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { kind: 'offline', message: 'Trilium did not answer in time.' };
    }
    if (err.name === 'SyncConflictError') return { kind: 'retry', message: err.message };
    if (err instanceof TypeError) {
      const cause = (err as { cause?: { message?: unknown } }).cause;
      const detail = typeof cause?.message === 'string' ? cause.message : '';
      if (/redirect/i.test(detail) || /redirect/i.test(err.message)) {
        return {
          kind: 'fatal',
          message: 'The server redirected the request. Enter the final address.',
        };
      }
      if (/certificate|self[- ]signed|CERT_/i.test(detail)) {
        return { kind: 'fatal', message: `The server's certificate was rejected (${detail}).` };
      }
      return { kind: 'offline', message: 'Trilium is not reachable.' };
    }
    return { kind: 'fatal', message: err.message };
  }
  return { kind: 'fatal', message: String(err) };
}

/** HTTPS is required, except for this computer. Returns an error message or null. */
export function checkServerUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'Enter the full server address, for example https://trilium.example.com';
  }
  if (url.username || url.password) return 'Do not put a user name or password in the address.';
  if (url.search || url.hash) return 'Remove the query or # part from the address.';
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && local) return null;
  if (url.protocol === 'http:') return 'Use HTTPS. Plain HTTP is only allowed for localhost.';
  return 'The address must start with https://';
}
