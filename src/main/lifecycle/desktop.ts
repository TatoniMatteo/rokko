import { app, Menu, nativeImage, Tray, type BaseWindow } from 'electron';

export function restoreWindow(window: BaseWindow | null): void {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

export function createTray(icon: string, window: () => BaseWindow | null, language: () => string) {
  let tray: Tray | undefined;
  const refresh = (): void => {
    if (!tray || tray.isDestroyed()) return;
    const italian = language() === 'it';
    tray.setContextMenu(Menu.buildFromTemplate([
      { id: 'show', label: italian ? 'Mostra Rokko' : 'Show Rokko', click: () => restoreWindow(window()) },
      { id: 'hide', label: italian ? 'Nascondi Rokko' : 'Hide Rokko', click: () => window()?.hide() },
      { type: 'separator' },
      { id: 'quit', label: italian ? 'Esci' : 'Quit', click: () => app.quit() }
    ]));
  };
  try {
    tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 24, height: 24 }));
    tray.setToolTip('Rokko');
    tray.on('click', () => restoreWindow(window()));
    refresh();
  } catch {
    tray?.destroy();
    tray = undefined;
    console.warn('[Rokko] Tray unavailable; closing the window still quits Rokko.');
  }
  return { refresh, destroy: () => tray?.destroy() };
}
