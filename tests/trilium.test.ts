import { describe, expect, it } from 'vitest';
import { SyncConflictError } from '../src/main/sync';
import { checkServerUrl, classifyError, triliumNote, TriliumError } from '../src/main/trilium';

function recordingFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe('triliumNote', () => {
  it('sends the token, refuses redirects and uses the ETAPI paths', async () => {
    const { calls, impl } = recordingFetch(
      () => new Response(JSON.stringify({ blobId: 'b1', type: 'text' })),
    );
    const api = triliumNote('https://t.example/', 'tok', 'abc', impl);
    expect(await api.getBlobId()).toBe('b1');
    await api.putContent('<p>x</p>');
    await api.createRevision();
    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET https://t.example/etapi/notes/abc',
      'PUT https://t.example/etapi/notes/abc/content',
      'POST https://t.example/etapi/notes/abc/revision',
    ]);
    expect(calls[0].init.redirect).toBe('error');
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('tok');
    expect((calls[1].init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
  });

  it('rejects a protected note', async () => {
    const { impl } = recordingFetch(
      () => new Response(JSON.stringify({ blobId: 'b', isProtected: true })),
    );
    await expect(triliumNote('https://t', 'x', 'n', impl).getBlobId()).rejects.toThrow(
      'must not be protected',
    );
  });

  it('explains an answer that is not Trilium JSON', async () => {
    const { impl } = recordingFetch(() => new Response('<html>login</html>'));
    await expect(triliumNote('https://t', 'x', 'n', impl).getBlobId()).rejects.toThrow(
      'did not answer like Trilium',
    );
  });

  it('turns HTTP errors into TriliumError with the status', async () => {
    const { impl } = recordingFetch(() => new Response('{}', { status: 401 }));
    await expect(triliumNote('https://t', 'x', 'n', impl).getContent()).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('classifyError', () => {
  it.each([
    [new TriliumError('x', 401), 'auth'],
    [new TriliumError('x', 404), 'not-found'],
    [new TriliumError('x', 429), 'retry'],
    [new TriliumError('x', 502), 'retry'],
    [new TriliumError('x', 400), 'fatal'],
    [new TriliumError('protected', 0), 'fatal'],
    [new SyncConflictError(), 'retry'],
    [new TypeError('fetch failed'), 'offline'],
    [Object.assign(new Error('t'), { name: 'TimeoutError' }), 'offline'],
    [new TypeError('fetch failed', { cause: new Error('unexpected redirect') }), 'fatal'],
    [new Error('other'), 'fatal'],
  ])('%s is %s', (err, kind) => {
    expect(classifyError(err).kind).toBe(kind);
  });
});

describe('checkServerUrl', () => {
  it('requires HTTPS except for localhost', () => {
    expect(checkServerUrl('https://trilium.example')).toBeNull();
    expect(checkServerUrl('http://localhost:8080')).toBeNull();
    expect(checkServerUrl('http://127.0.0.1:8080')).toBeNull();
    expect(checkServerUrl('http://trilium.example')).toMatch(/HTTPS/);
    expect(checkServerUrl('ftp://trilium.example')).not.toBeNull();
    expect(checkServerUrl('trilium.example')).not.toBeNull();
    expect(checkServerUrl('https://user:pw@trilium.example')).not.toBeNull();
  });
});
