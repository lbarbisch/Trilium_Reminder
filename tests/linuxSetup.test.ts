import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appExecutable,
  autostartEntry,
  autostartPath,
  desktopQuote,
  ensureAutostart,
  installWakeService,
  renderUnit,
  SERVICE_NAME,
  systemdQuote,
} from '../src/main/linuxSetup';

const repoLinux = fileURLToPath(new URL('../linux', import.meta.url));

let home: string;
let userData: string;
beforeEach(() => {
  home = fs.mkdtempSync(join(tmpdir(), 'tr-home-'));
  userData = join(home, 'userData');
  fs.mkdirSync(userData);
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe('appExecutable', () => {
  it('prefers the AppImage, then the deb link, then the binary', () => {
    expect(appExecutable({ APPIMAGE: '/home/u/Apps/t.AppImage' }, '/tmp/.mount/t')).toBe(
      '/home/u/Apps/t.AppImage',
    );
    expect(appExecutable({}, '/opt/Trilium Reminder/trilium-reminder', () => true)).toBe(
      '/usr/bin/trilium-reminder',
    );
    expect(appExecutable({}, '/home/u/dev/electron', () => true)).toBe('/home/u/dev/electron');
  });
});

describe('quoting', () => {
  it('quotes desktop entry arguments', () => {
    expect(desktopQuote('/home/u/My Apps/a$b%.AppImage')).toBe(
      '"/home/u/My Apps/a\\$b%%.AppImage"',
    );
  });

  it('quotes systemd arguments', () => {
    expect(systemdQuote('/home/u/a "b" 100%$x')).toBe('"/home/u/a \\"b\\" 100%%$$x"');
  });

  it('fills the unit template', () => {
    const template = fs.readFileSync(join(repoLinux, SERVICE_NAME), 'utf8');
    const unit = renderUnit(
      template,
      '/h/.local/share/trilium-reminder/wake-watch.sh',
      '/usr/bin/x',
    );
    expect(unit).toContain(
      'ExecStart="/h/.local/share/trilium-reminder/wake-watch.sh" "/usr/bin/x"',
    );
    expect(unit).not.toContain('@');
  });
});

describe('ensureAutostart', () => {
  it('writes the entry once and respects its removal', () => {
    ensureAutostart(home, userData, '/usr/bin/trilium-reminder');
    const file = autostartPath(home);
    expect(fs.readFileSync(file, 'utf8')).toBe(autostartEntry('/usr/bin/trilium-reminder'));
    expect(fs.readFileSync(file, 'utf8')).toContain(
      'Exec="/usr/bin/trilium-reminder" --ozone-platform=x11 --wake',
    );

    fs.rmSync(file);
    ensureAutostart(home, userData, '/usr/bin/trilium-reminder');
    expect(fs.existsSync(file)).toBe(false);
  });

  it('updates the entry when the AppImage moved', () => {
    ensureAutostart(home, userData, '/old/t.AppImage');
    ensureAutostart(home, userData, '/new/t.AppImage');
    expect(fs.readFileSync(autostartPath(home), 'utf8')).toContain('/new/t.AppImage');
  });
});

describe('installWakeService', () => {
  it('copies the script, writes the unit and enables it', async () => {
    const commands: string[] = [];
    const result = await installWakeService(
      { home, source: repoLinux },
      '/usr/bin/trilium-reminder',
      async (cmd, args) => void commands.push([cmd, ...args].join(' ')),
    );
    expect(result.ok).toBe(true);
    const script = join(home, '.local', 'share', 'trilium-reminder', 'wake-watch.sh');
    expect(fs.existsSync(script)).toBe(true);
    const unit = fs.readFileSync(join(home, '.config', 'systemd', 'user', SERVICE_NAME), 'utf8');
    expect(unit).toContain(`ExecStart="${script.replace(/\\/g, '\\\\')}"`);
    expect(commands).toEqual([
      'systemctl --user daemon-reload',
      `systemctl --user enable --now ${SERVICE_NAME}`,
      `systemctl --user restart ${SERVICE_NAME}`,
    ]);
  });

  it('reports a failing systemctl', async () => {
    const result = await installWakeService({ home, source: repoLinux }, '/x', async () => {
      throw new Error('systemctl --user daemon-reload failed: no user bus');
    });
    expect(result).toEqual({ ok: false, message: expect.stringContaining('no user bus') });
  });
});
