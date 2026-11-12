import { contextBridge, ipcRenderer } from 'electron';

// The only capability crossing this bridge is the existing, consent-controlled notification API.
contextBridge.executeInMainWorld({
  func: (invoke: (request: unknown) => Promise<unknown>, subscribe: (callback: (value: unknown) => Promise<unknown>) => void) => {
    if (typeof ServiceWorkerRegistration === 'undefined') return;
    const prototype = ServiceWorkerRegistration.prototype;
    const scope = Object.getOwnPropertyDescriptor(prototype, 'scope')!.get!;
    const request = async (value: object): Promise<unknown> => {
      try { return await invoke(value); }
      catch { throw new DOMException('Notification request denied or unavailable', 'NotAllowedError'); }
    };
    const object = (info: { id: string; scope: string; title: string; body: string; tag: string; data: string }): Notification => {
      const notification = Object.setPrototypeOf(new EventTarget(), Notification.prototype) as Notification;
      for (const [key, value] of Object.entries({ ...info, data: JSON.parse(info.data) })) {
        Object.defineProperty(notification, key, { value, enumerable: true });
      }
      Object.defineProperty(notification, 'close', { value: () => {
        void request({ action: 'close', scope: info.scope, id: info.id }).catch(() => {});
      } });
      return notification;
    };
    prototype.showNotification = async function(title: string, options: NotificationOptions = {}): Promise<void> {
      const value = scope.call(this) as string;
      let data: string;
      try { data = JSON.stringify(options.data ?? null); }
      catch { throw new DOMException('Notification data must be JSON serializable', 'DataCloneError'); }
      await request({ action: 'show', scope: value, title: String(title), body: options.body ?? '', tag: options.tag ?? '',
        data, silent: options.silent, requireInteraction: options.requireInteraction });
    };
    prototype.getNotifications = async function(options: GetNotificationOptions = {}): Promise<Notification[]> {
      const list = await request({ action: 'list', scope: scope.call(this), tag: options.tag ?? '' }) as Parameters<typeof object>[0][];
      return list.map(object);
    };
    // A worker can receive click/close events even after its original document has gone away.
    if (typeof document === 'undefined') subscribe(value => {
      const info = value as Parameters<typeof object>[0] & { kind: string };
      const event = new Event(info.kind);
      const pending: Promise<unknown>[] = [];
      Object.defineProperties(event, { notification: { value: object(info) }, action: { value: '' },
        waitUntil: { value: (promise: Promise<unknown>) => { pending.push(Promise.resolve(promise)); } } });
      globalThis.dispatchEvent(event);
      return Promise.allSettled(pending);
    });
  },
  args: [(value: unknown) => ipcRenderer.invoke('rokko:persistent-notification', value),
    (callback: (value: unknown) => Promise<unknown>) => {
      ipcRenderer.on('rokko:persistent-event', (_event, value: { token: string }) => {
        void Promise.resolve().then(() => callback(value)).catch(() => {}).finally(() => {
          ipcRenderer.send('rokko:persistent-event-complete', value.token);
        });
      });
    }]
});
