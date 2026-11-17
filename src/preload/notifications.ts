import { contextBridge, ipcRenderer } from 'electron';

// The only capability crossing this bridge is the existing, consent-controlled notification API.
contextBridge.executeInMainWorld({
  func: (invoke: (request: unknown) => Promise<unknown>, subscribe: (callback: (value: unknown) => Promise<unknown>) => void) => {
    if (typeof ServiceWorkerRegistration === 'undefined') return;
    const prototype = ServiceWorkerRegistration.prototype;
    const scope = Object.getOwnPropertyDescriptor(prototype, 'scope')!.get!;
    const pageNotifications = new Map<string, Notification>();
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
    if (typeof document !== 'undefined' && typeof Notification !== 'undefined') {
      const nativeNotification = Notification;
      type ExtendedOptions = NotificationOptions & {
        actions?: { action: string; title: string; icon?: string }[];
        image?: string;
        renotify?: boolean;
        vibrate?: number[];
      };
      const RokkoNotification = new Proxy(nativeNotification, {
        get(target, property, receiver) {
          if (property === 'permission') return target.permission;
          if (property === 'requestPermission') return target.requestPermission.bind(target);
          return Reflect.get(target, property, receiver);
        },
        construct(_target, args: [string, ExtendedOptions?]) {
          const [title, options = {}] = args;
          const notification = Object.setPrototypeOf(new EventTarget(), nativeNotification.prototype) as Notification;
          let id: string | undefined;
          let closed = false;
          let closeSent = false;
          const notificationScope = location.href;
          const value = {
            title: String(title),
            body: options.body ?? '',
            tag: options.tag ?? '',
            data: JSON.stringify(options.data ?? null),
            silent: options.silent === true,
            requireInteraction: options.requireInteraction === true,
          };
          for (const [key, property] of Object.entries({
            title: value.title, body: value.body, tag: value.tag, data: options.data ?? null,
            dir: options.dir ?? 'auto', lang: options.lang ?? '', icon: options.icon ?? '',
            badge: options.badge ?? '', image: options.image ?? '', timestamp: Date.now(),
            renotify: options.renotify ?? false, requireInteraction: value.requireInteraction,
            silent: value.silent, vibrate: options.vibrate ?? [],
            actions: options.actions ?? [],
          })) Object.defineProperty(notification, key, { value: property, enumerable: true });
          const close = (): void => {
            closed = true;
            if (id && !closeSent) {
              closeSent = true;
              const notificationId = id;
              void request({ action: 'close', scope: notificationScope, id: notificationId }).then(() => {
                pageNotifications.delete(notificationId);
                notification.dispatchEvent(new Event('close'));
              }).catch(() => {});
            }
          };
          Object.defineProperty(notification, 'close', { value: close });
          void request({ action: 'show', scope: notificationScope, ...value }).then(result => {
            const info = result as { id?: unknown };
            if (typeof info?.id !== 'string') return;
            id = info.id;
            pageNotifications.set(id, notification);
            if (closed) close();
          }).catch(() => notification.dispatchEvent(new Event('error')));
          return notification;
        },
      });
      window.Notification = RokkoNotification;
    }
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
    subscribe(value => {
      const info = value as Parameters<typeof object>[0] & { kind: string };
      if (typeof document !== 'undefined') {
        const notification = pageNotifications.get(info.id);
        if (notification) {
          notification.dispatchEvent(new Event(info.kind));
          if (info.kind === 'notificationclose') pageNotifications.delete(info.id);
        }
        return Promise.resolve();
      }
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
          if (typeof value.token === 'string') ipcRenderer.send('rokko:persistent-event-complete', value.token);
        });
      });
    }]
});
