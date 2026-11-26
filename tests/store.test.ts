import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atomicWrite, isOp, Store, type Config, type TokenCrypto } from '../src/main/store';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), 'trilium-reminder-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Reversible fake: "enc:" + text. The flag simulates a rotated key. */
function fakeCrypto(rotate = false): TokenCrypto & { encrypted: number } {
  const c = {
    encrypted: 0,
    encrypt: async (s: string) => {
      c.encrypted++;
      return Buffer.from(`enc:${s}`);
    },
    decrypt: async (b: Buffer) => {
      const s = b.toString();
      if (!s.startsWith('enc:')) throw new Error('bad');
      return { result: s.slice(4), shouldReEncrypt: rotate };
    },
  };
  return c;
}

const config = (tokenEncrypted: string): Config => ({
  version: 1,
  serverUrl: 'https://t.example',
  noteId: 'abc',
  tokenEncrypted,
});

describe('atomicWrite', () => {
  it('replaces the file and leaves no temporary file', () => {
    const p = join(dir, 'f.json');
    atomicWrite(p, 'one');
    atomicWrite(p, 'two');
    expect(fs.readFileSync(p, 'utf8')).toBe('two');
    expect(fs.existsSync(`${p}.tmp`)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('uses mode 0600 on Linux', () => {
    const p = join(dir, 'f.json');
    atomicWrite(p, 'x', 'linux');
    expect(fs.statSync(p).mode & 0o777).toBe(0o600);
  });
});

describe('Store', () => {
  it('round-trips state with a queue', () => {
    const store = new Store(dir, fakeCrypto());
    const state = {
      cacheHtml: '<p>x</p>',
      queue: [{ type: 'add' as const, id: 'e1', text: 'A' }],
      lastRevisionDay: '2026-11-26',
    };
    store.saveState(state);
    expect(new Store(dir, fakeCrypto()).loadState()).toEqual(state);
  });

  it('returns empty state and no config on first start', () => {
    const store = new Store(dir, fakeCrypto());
    expect(store.loadConfig()).toBeNull();
    expect(store.loadState()).toEqual({ cacheHtml: '', queue: [], lastRevisionDay: '' });
    expect(store.notices).toEqual([]);
  });

  it('renames a damaged file to *.bad and reports it', () => {
    fs.writeFileSync(join(dir, 'state.json'), '{"version":1,"queue":[{"type":"add"');
    const store = new Store(dir, fakeCrypto());
    expect(store.loadState().queue).toEqual([]);
    expect(fs.existsSync(join(dir, 'state.json.bad'))).toBe(true);
    expect(store.notices[0]).toContain('damaged');
  });

  it('treats a queue with an unknown action as damaged instead of dropping it silently', () => {
    const bad = { version: 1, cacheHtml: '', lastRevisionDay: '', queue: [{ type: 'delete' }] };
    fs.writeFileSync(join(dir, 'state.json'), JSON.stringify(bad));
    const store = new Store(dir, fakeCrypto());
    store.loadState();
    expect(fs.readFileSync(join(dir, 'state.json.bad'), 'utf8')).toContain('delete');
    expect(store.notices).toHaveLength(1);
  });

  it('encrypts the token and never writes it in plain text', async () => {
    const crypto = fakeCrypto();
    const store = new Store(dir, crypto);
    const c = config(await store.encryptToken('secret-token'));
    store.saveConfig(c);
    const raw = fs.readFileSync(join(dir, 'config.json'), 'utf8');
    expect(raw).not.toContain('secret-token');
    expect(await store.readToken(store.loadConfig()!)).toBe('secret-token');
  });

  it('encrypts again and saves when the key was rotated', async () => {
    const crypto = fakeCrypto(true);
    const store = new Store(dir, crypto);
    const c = config(await store.encryptToken('t'));
    store.saveConfig(c);
    expect(await store.readToken(c)).toBe('t');
    expect(crypto.encrypted).toBe(2);
  });

  it('reports a token that cannot be decrypted', async () => {
    const store = new Store(dir, fakeCrypto());
    expect(await store.readToken(config(Buffer.from('garbage').toString('base64')))).toBeNull();
    expect(store.notices[0]).toContain('token');
  });
});

describe('isOp', () => {
  it('accepts valid actions and rejects others', () => {
    expect(isOp({ type: 'move', id: 'a', beforeId: null })).toBe(true);
    expect(isOp({ type: 'setDone', id: 'a', done: 'yes' })).toBe(false);
    expect(isOp({ type: 'add', id: 'x'.repeat(101), text: 'A' })).toBe(false);
  });
});
