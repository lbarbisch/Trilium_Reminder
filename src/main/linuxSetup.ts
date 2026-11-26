import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Result } from '../shared/types';

export const APP_NAME = 'trilium-reminder';
export const SERVICE_NAME = 'trilium-reminder-wake.service';
export const LAUNCH_ARGS = ['--ozone-platform=x11', '--wake'];

/** The command that starts this app: the AppImage, the deb's /usr/bin link, or the binary. */
export function appExecutable(
  env: NodeJS.ProcessEnv = process.env,
  execPath = process.execPath,
  exists: (p: string) => boolean = fs.existsSync,
): string {
  if (env.APPIMAGE) return env.APPIMAGE;
  const link = `/usr/bin/${APP_NAME}`;
  if (execPath.startsWith('/opt/') && exists(link)) return link;
  return execPath;
}

/** Quotes one argument for the Exec key of a desktop entry. */
export function desktopQuote(arg: string): string {
  const escaped = arg.replace(/[\\"`$]/g, (c) => '\\' + c).replace(/%/g, '%%');
  return `"${escaped}"`;
}

export function autostartEntry(executable: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Trilium Reminder',
    'Comment=Shows your Trilium todo list after sign-in',
    `Exec=${desktopQuote(executable)} ${LAUNCH_ARGS.join(' ')}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

/** Quotes one word for a systemd ExecStart line. */
export function systemdQuote(arg: string): string {
  const escaped = arg
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/%/g, '%%')
    .replace(/\$/g, '$$$$');
  return `"${escaped}"`;
}

/** Fills the two placeholders in linux/trilium-reminder-wake.service. */
export function renderUnit(template: string, script: string, app: string): string {
  return template.replace('"@SCRIPT@"', systemdQuote(script)).replace('"@APP@"', systemdQuote(app));
}

export interface LinuxPaths {
  home: string;
  /** Folder with wake-watch.sh and the unit template (resources/linux when packaged). */
  source: string;
}

export const autostartPath = (home: string) =>
  join(home, '.config', 'autostart', `${APP_NAME}.desktop`);

/**
 * Writes the autostart entry on the first start of a packaged build. A marker file in
 * userData remembers that it was done, so deleting the entry turns autostart off for good.
 * If the AppImage moved, the existing entry is updated.
 */
export function ensureAutostart(home: string, userData: string, executable: string): void {
  const file = autostartPath(home);
  const marker = join(userData, 'autostart-installed');
  const wanted = autostartEntry(executable);
  if (fs.existsSync(marker)) {
    if (!fs.existsSync(file)) return; // the user removed it
    if (fs.readFileSync(file, 'utf8') === wanted) return;
  }
  fs.mkdirSync(join(home, '.config', 'autostart'), { recursive: true });
  fs.writeFileSync(file, wanted, { mode: 0o644 });
  fs.writeFileSync(marker, '');
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 20_000 }, (err, _stdout, stderr) => {
      if (err)
        reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr.trim() || err.message}`));
      else resolve();
    });
  });
}

/** Same steps as the manual commands in docs/manual/linux.md. */
export async function installWakeService(
  paths: LinuxPaths,
  executable: string,
  exec: (cmd: string, args: string[]) => Promise<void> = run,
): Promise<Result> {
  try {
    const dest = join(paths.home, '.local', 'share', APP_NAME);
    const unitDir = join(paths.home, '.config', 'systemd', 'user');
    fs.mkdirSync(dest, { recursive: true });
    fs.mkdirSync(unitDir, { recursive: true });

    const script = join(dest, 'wake-watch.sh');
    fs.copyFileSync(join(paths.source, 'wake-watch.sh'), script);
    fs.chmodSync(script, 0o755);

    const template = fs.readFileSync(join(paths.source, SERVICE_NAME), 'utf8');
    fs.writeFileSync(join(unitDir, SERVICE_NAME), renderUnit(template, script, executable), {
      mode: 0o644,
    });

    await exec('systemctl', ['--user', 'daemon-reload']);
    await exec('systemctl', ['--user', 'enable', '--now', SERVICE_NAME]);
    // Restart so a reinstall picks up a new script or app path.
    await exec('systemctl', ['--user', 'restart', SERVICE_NAME]);
    return { ok: true, message: 'The wake service is installed and running.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export const defaultHome = (): string => homedir();
