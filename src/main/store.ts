import * as fs from 'node:fs';
import { join } from 'node:path';
import type { Op } from '../shared/types';
import { emptyState, type SyncState } from './sync';

export interface Config {
  version: 1;
  serverUrl: string;
  noteId: string;
  /** safeStorage output, base64. Empty if no token was saved. */
  tokenEncrypted: string;
}

interface StateFile extends SyncState {
  version: 1;
}

/** The parts of Electron's safeStorage the store needs, so tests can replace it. */
export interface TokenCrypto {
  encrypt(plain: string): Promise<Buffer>;
  decrypt(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

const MAX_ID = 100;
const MAX_TEXT = 500;

const isId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_ID;

/** True if the value is an action that can be replayed safely. */
export function isOp(v: unknown): v is Op {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  switch (o.type) {
    case 'add':
      return isId(o.id) && typeof o.text === 'string' && o.text.length <= MAX_TEXT;
    case 'setDone':
      return isId(o.id) && typeof o.done === 'boolean';
    case 'move':
      return isId(o.id) && (o.beforeId === null || isId(o.beforeId));
    default:
      return false;
  }
}

function isConfig(v: unknown): v is Config {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.serverUrl === 'string' &&
    typeof o.noteId === 'string' &&
    typeof o.tokenEncrypted === 'string'
  );
}

function isStateFile(v: unknown): v is StateFile {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.cacheHtml === 'string' &&
    typeof o.lastRevisionDay === 'string' &&
    Array.isArray(o.queue) &&
    o.queue.every(isOp)
  );
}

/**
 * Writes the file next to its final place, then renames it over the original,
 * so a crash leaves either the old or the new content, never half of it.
 */
export function atomicWrite(path: string, data: string, platform = process.platform): void {
  const tmp = `${path}.tmp`;
  const mode = platform === 'win32' ? undefined : 0o600;
  const fd = fs.openSync(tmp, 'w', mode);
  try {
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (mode !== undefined) fs.chmodSync(tmp, mode); // an older tmp file may have other bits
  // Windows can briefly lock a file that a virus scanner or indexer has open.
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, path);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
}

export class Store {
  readonly configPath: string;
  readonly statePath: string;
  /** Problems found while loading, for the window's notice line. */
  readonly notices: string[] = [];

  constructor(
    readonly dir: string,
    private readonly crypto: TokenCrypto,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    fs.mkdirSync(dir, { recursive: true });
    this.configPath = join(dir, 'config.json');
    this.statePath = join(dir, 'state.json');
  }

  /** Reads a JSON file. A damaged file is renamed to *.bad and reported, never deleted. */
  private read<T>(path: string, valid: (v: unknown) => v is T, label: string): T | null {
    let text: string;
    try {
      text = fs.readFileSync(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    try {
      const value: unknown = JSON.parse(text);
      if (valid(value)) return value;
    } catch {
      // handled below
    }
    const bad = `${path}.bad`;
    fs.renameSync(path, bad);
    this.notices.push(`The ${label} file was damaged and was renamed to ${bad}.`);
    return null;
  }

  loadConfig(): Config | null {
    return this.read(this.configPath, isConfig, 'settings');
  }

  saveConfig(config: Config): void {
    atomicWrite(this.configPath, JSON.stringify(config, null, 2), this.platform);
  }

  loadState(): SyncState {
    const s = this.read(this.statePath, isStateFile, 'saved state');
    if (!s) return emptyState();
    return { cacheHtml: s.cacheHtml, queue: s.queue, lastRevisionDay: s.lastRevisionDay };
  }

  saveState(state: SyncState): void {
    const file: StateFile = { version: 1, ...state };
    atomicWrite(this.statePath, JSON.stringify(file), this.platform);
  }

  async encryptToken(token: string): Promise<string> {
    return (await this.crypto.encrypt(token)).toString('base64');
  }

  /**
   * Decrypts the saved token. If the key was rotated, encrypts it again and saves the config.
   * Returns null if there is no token or it can no longer be decrypted.
   */
  async readToken(config: Config): Promise<string | null> {
    if (!config.tokenEncrypted) return null;
    let out: { result: string; shouldReEncrypt: boolean };
    try {
      out = await this.crypto.decrypt(Buffer.from(config.tokenEncrypted, 'base64'));
    } catch {
      this.notices.push('The saved token could not be decrypted. Enter it again in Settings.');
      return null;
    }
    if (out.shouldReEncrypt) {
      config.tokenEncrypted = await this.encryptToken(out.result);
      this.saveConfig(config);
    }
    return out.result;
  }
}
