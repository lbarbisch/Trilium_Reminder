import * as fs from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 512 * 1024;

/**
 * A small log file in userData/logs. Callers must never pass the token or note content:
 * only event names, error kinds and counts.
 */
export function createLog(dir: string): (message: string) => void {
  const file = join(dir, 'main.log');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const size = fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0;
    if (size > MAX_BYTES) {
      fs.renameSync(file, join(dir, 'main.old.log'));
    }
  } catch {
    // logging must never stop the app
  }
  return (message) => {
    const line = `${new Date().toISOString()} ${message}\n`;
    try {
      fs.appendFileSync(file, line, { mode: 0o600 });
    } catch {
      // ignore
    }
    if (!process.env.VITEST) console.log(line.trimEnd());
  };
}
