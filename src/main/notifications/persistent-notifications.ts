import { ipcMain, Notification, nativeImage, type NativeImage, type Session, type ServiceWorkerMain, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { WebApp } from '../../shared/contracts/model';
import { notificationAllowed, notificationOrigin } from '../../shared/notifications/notifications.mjs';
import { persistentRequest } from '../../shared/notifications/persistent-notifications.mjs';

const channel = 'rokko:persistent-notification';
interface RecordInfo { id: string; scope: string; title: string; body: string; tag: string; data: string }
interface Entry { appId: string; info: RecordInfo; native: Notification }
interface Options {
  app(id: string): WebApp | undefined;
  view(id: string): WebContents | undefined;
  activate(id: string): void;
  icon: string;
}
export class PersistentNotifications {
  private readonly icon: NativeImage;
  private readonly entries = new Map<string, Entry>();
  private readonly configurations = new Map<string, { session: Session; origin: string; scripts: string[];
    listener: (event: Electron.Event<Electron.ServiceWorkersRunningStatusChangedEventParams>) => void }>();
  private readonly boundWorkers = new WeakSet<ServiceWorkerMain>();
  private readonly closing = new Set<string>();
  private readonly events = new Map<string, Set<Promise<void>>>();
  private readonly tasks = new Map<string, { appId: string; finish: () => void }>();

  constructor(private readonly options: Options) {
    this.icon = nativeImage.createFromPath(options.icon).resize({ width: 64, height: 64 });
    ipcMain.handle(channel, (event, payload: unknown) => {
      const config = [...this.configurations].find(([id, config]) =>
        config.session === event.sender.session && this.options.view(id) === event.sender);
      if (!config) throw new Error('Unauthorized notification sender');
      return this.request(config[0], event.senderFrame?.url ?? '', payload);
    });
  }

  configure(service: WebApp, session: Session): void {
    this.closing.delete(service.id);
    const origin = notificationOrigin(service.url)!;
    if (this.configurations.get(service.id)?.origin === origin) return;
    this.unregister(service.id);
    const scripts = (['frame', 'service-worker'] as const).map(type => session.registerPreloadScript({
      type, filePath: join(import.meta.dirname, '../preload/notifications.cjs'), includeGlobs: [`${origin}/*`]
    }));
    const bind = (worker: ServiceWorkerMain | undefined): void => {
      if (!worker || this.boundWorkers.has(worker)) return;
      this.boundWorkers.add(worker);
      worker.ipc.handle(channel, (event, payload: unknown) => {
        if (event.session !== session || event.serviceWorker !== worker) throw new Error('Unauthorized worker');
        return this.request(service.id, worker.scope, payload, worker.scope);
      });
      worker.ipc.on('rokko:persistent-event-complete', (event, token: unknown) => {
        if (event.session === session && event.serviceWorker === worker && typeof token === 'string') {
          const task = this.tasks.get(token);
          if (task?.appId === service.id) task.finish();
        }
      });
    };
    const listener = ({ versionId, runningStatus }: Electron.Event<Electron.ServiceWorkersRunningStatusChangedEventParams>): void => {
      if (runningStatus === 'starting' || runningStatus === 'running') bind(session.serviceWorkers.getWorkerFromVersionID(versionId));
    };
    session.serviceWorkers.on('running-status-changed', listener);
    this.configurations.set(service.id, { session, origin, scripts, listener });
    for (const worker of Object.values(session.serviceWorkers.getAllRunning())) {
      bind(session.serviceWorkers.getWorkerFromVersionID(worker.versionId));
    }
  }

  unregister(id: string): void {
    this.closing.delete(id);
    const config = this.configurations.get(id);
    if (!config) return;
    config.session.serviceWorkers.off('running-status-changed', config.listener);
    for (const script of config.scripts) config.session.unregisterPreloadScript(script);
    this.configurations.delete(id);
  }

  async closeApp(id: string): Promise<void> {
    this.closing.add(id);
    for (const [key, entry] of this.entries) {
      if (entry.appId !== id) continue;
      this.entries.delete(key);
      entry.native.close();
    }
    for (const task of this.tasks.values()) if (task.appId === id) task.finish();
    await Promise.allSettled(this.events.get(id) ?? []);
  }

  private queueEvent(entry: Entry, kind: 'notificationclick' | 'notificationclose'): void {
    if (this.closing.has(entry.appId)) return;
    const pending = this.events.get(entry.appId) ?? new Set<Promise<void>>();
    this.events.set(entry.appId, pending);
    const promise = this.event(entry, kind).catch(() => { /* The registration or window may be gone. */ }).finally(() => {
      pending.delete(promise);
      if (!pending.size) this.events.delete(entry.appId);
    });
    pending.add(promise);
  }

  private async event(entry: Entry, kind: 'notificationclick' | 'notificationclose'): Promise<void> {
    const service = this.options.app(entry.appId);
    if (this.closing.has(entry.appId) || !notificationAllowed(service, 'notifications', entry.info.scope)) return;
    if (kind === 'notificationclick') this.options.activate(entry.appId);
    const session = this.configurations.get(entry.appId)?.session;
    if (!session) return;
    try {
      const worker = await session.serviceWorkers.startWorkerForScope(entry.info.scope);
      if (!this.closing.has(entry.appId) && notificationAllowed(this.options.app(entry.appId), 'notifications', worker.scope)) {
        const { end } = worker.startTask();
        const token = randomUUID();
        const finish = (): void => {
          clearTimeout(timer); this.tasks.delete(token);
          try { end(); } catch { /* The worker may already have stopped. */ }
        };
        const timer = setTimeout(finish, 30000);
        timer.unref();
        this.tasks.set(token, { appId: entry.appId, finish });
        try { worker.send('rokko:persistent-event', { kind, ...entry.info, token }); }
        catch { finish(); }
      }
    } catch { /* The registration may have been unregistered or disposed. */ }
  }

  private async request(id: string, source: string, payload: unknown, workerScope?: string): Promise<unknown> {
    const service = this.options.app(id);
    if (this.closing.has(id) || !notificationAllowed(service, 'notifications', source)) throw new Error('Notifications are not allowed');
    const request = persistentRequest(payload, notificationOrigin(service!.url)!);
    if (workerScope !== undefined && request.scope !== workerScope) throw new Error('Worker scope mismatch');
    const owned = [...this.entries.values()].filter(entry => entry.appId === id && entry.info.scope === request.scope);
    if (request.action === 'list') return owned.filter(entry => !request.tag || entry.info.tag === request.tag).map(e => e.info);
    if (request.action === 'close') {
      const entry = owned.find(entry => entry.info.id === request.id);
      if (entry) { this.entries.delete(entry.info.id); entry.native.close(); }
      return;
    }
    if (!Notification.isSupported()) throw new Error('Desktop notifications are not available');
    if (request.tag) {
      for (const entry of owned.filter(entry => entry.info.tag === request.tag)) {
        this.entries.delete(entry.info.id); entry.native.close();
      }
    }
    if (this.entries.size >= 512 || [...this.entries.values()].filter(entry => entry.appId === id).length >= 64) {
      throw new Error('Too many active notifications');
    }
    const info: RecordInfo = { id: randomUUID(), scope: request.scope, title: request.title!, body: request.body!,
      tag: request.tag, data: request.data! };
    const native = new Notification({ title: info.title, body: info.body, icon: this.icon,
      silent: request.silent, timeoutType: request.requireInteraction ? 'never' : 'default' });
    const entry: Entry = { appId: id, info, native };
    this.entries.set(info.id, entry);
    native.on('click', () => { if (this.entries.get(info.id) === entry) this.queueEvent(entry, 'notificationclick'); });
    native.once('close', () => {
      if (this.entries.get(info.id) !== entry) return;
      this.entries.delete(info.id);
      this.queueEvent(entry, 'notificationclose');
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Desktop notification timed out')), 5000);
        native.once('show', () => { clearTimeout(timer); resolve(); });
        native.once('failed', () => { clearTimeout(timer); reject(new Error('Desktop notification failed')); });
        native.show();
      });
      return;
    } catch (error) {
      this.entries.delete(info.id); native.close(); throw error;
    }
  }
}
