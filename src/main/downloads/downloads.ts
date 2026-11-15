import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, type DownloadItem, type Session, type WebContents } from 'electron';
import type { DownloadInfo } from '../../shared/contracts/model';
import { safeDownloadName } from '../../shared/security/download-name.mjs';

export class Downloads {
  private sessions = new WeakSet<Session>();
  private entries = new Map<
    string,
    { info: DownloadInfo; item?: DownloadItem; timer?: ReturnType<typeof setTimeout> }
  >();
  constructor(
    private owner: (contents: WebContents) => string | undefined,
    private changed: () => void,
    private log: (event: string) => void,
  ) {}
  list(): DownloadInfo[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.info }));
  }
  configure(session: Session): void {
    if (this.sessions.has(session)) return;
    this.sessions.add(session);
    session.on('will-download', (event, item, contents) => {
      const serviceId = contents && this.owner(contents);
      const active = [...this.entries.values()].filter((entry) => entry.item);
      if (
        !serviceId ||
        active.length >= 16 ||
        active.filter((entry) => entry.info.serviceId === serviceId).length >= 4
      ) {
        event.preventDefault();
        return;
      }
      const filename = safeDownloadName(item.getFilename());
      item.setSaveDialogOptions({
        defaultPath: join(app.getPath('downloads'),filename),
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      });
      const id = randomUUID();
      const entry: {
        info: DownloadInfo;
        item?: DownloadItem;
        timer?: ReturnType<typeof setTimeout>;
      } = {
        info: {
          id,
          serviceId,
          filename,
          canCancel: true,
          received: 0,
          total: 0,
          state: 'progressing',
        },
        item,
      };
      this.entries.set(id, entry);
      this.log('download-start');
      this.changed();
      const update = (): void => {
        entry.info = {
          ...entry.info,
          received: Math.max(0, item.getReceivedBytes()),
          total: Math.max(0, item.getTotalBytes()),
        };
      };
      item.on('updated', (_event, state) => {
        update();
        entry.info.state = state;
        if (!entry.timer)
          entry.timer = setTimeout(() => {
            entry.timer = undefined;
            this.changed();
          }, 250);
      });
      item.once('done', (_event, state) => {
        clearTimeout(entry.timer);
        entry.timer = undefined;
        update();
        entry.info.state = state;
        entry.info.canCancel = false;
        entry.item = undefined;
        this.log('download-' + state);
        for (const [key, value] of this.entries) {
          if (this.entries.size <= 50) break;
          if (!value.item) this.entries.delete(key);
        }
        this.changed();
      });
    });
  }
  cancel(id: unknown): void {
    if (typeof id !== 'string' || !this.entries.get(id)?.item)
      throw new Error('Download is no longer active.');
    this.entries.get(id)!.item!.cancel();
  }
  closeService(id: string): void {
    for (const entry of this.entries.values())
      if (entry.info.serviceId === id) entry.item?.cancel();
  }
  close(): void {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer);
      entry.item?.cancel();
    }
  }
}
