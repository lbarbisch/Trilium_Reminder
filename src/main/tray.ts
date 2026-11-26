import { join } from 'node:path';
import { app, Menu, nativeImage, Tray } from 'electron';

export interface TrayActions {
  show(): void;
  syncNow(): void;
  settings(): void;
  quit(): void;
}

export function trayIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(app.getAppPath(), 'resources', 'tray.png');
}

/** Tray icon with Show, Sync now, Settings and Quit. Returns null if the desktop has no tray. */
export function createTray(actions: TrayActions): Tray | null {
  try {
    const tray = new Tray(nativeImage.createFromPath(trayIconPath()));
    tray.setToolTip('Trilium Reminder');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show', click: actions.show },
        { label: 'Sync now', click: actions.syncNow },
        { label: 'Settings', click: actions.settings },
        { type: 'separator' },
        { label: 'Quit', click: actions.quit },
      ]),
    );
    tray.on('click', actions.show);
    return tray;
  } catch {
    return null;
  }
}
