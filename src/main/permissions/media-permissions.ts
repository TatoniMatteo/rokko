import { desktopCapturer, webContents, type WebContents, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { notificationOrigin } from '../../shared/notifications/notifications.mjs';
import type {
  MediaCapability,
  PermissionState,
  PermissionPrompt,
} from '../../shared/contracts/model';
type Owner = { id: string; active: boolean };
type Grant = { appId: string; origin: string; capabilities: Set<MediaCapability> };
type Pending = {
  info: PermissionPrompt;
  contents: WebContents;
  timer: ReturnType<typeof setTimeout>;
  finish: (allow: boolean, source?: string) => void;
};
export class MediaPermissions {
  private pending = new Map<string, Pending>();
  private grants = new Map<WebContents, Grant>();
  private screenTickets = new Set<WebContents>();
  constructor(
    private owner: (contents: WebContents) => Owner | undefined,
    private changed: () => void,
    private log: (event: string) => void,
  ) {}
  list(): PermissionState {
    return {
      requests: [...this.pending.values()].map((p) => ({ ...p.info })),
      grants: [...this.grants.values()].map((g) => ({
        appId: g.appId,
        origin: g.origin,
        capabilities: [...g.capabilities],
      })),
    };
  }
  private identity(
    contents: WebContents | null,
    origin: string | undefined,
  ): { owner: Owner; origin: string } | undefined {
    if (!contents || contents.isDestroyed()) return;
    const owner = this.owner(contents),
      current = notificationOrigin(contents.getURL());
    if (owner && current && notificationOrigin(origin) === current)
      return { owner, origin: current };
  }
  check(
    contents: WebContents | null,
    permission: string,
    origin: string,
    details: Electron.PermissionCheckHandlerHandlerDetails,
  ): boolean {
    if (permission !== 'media' || !details.isMainFrame) return false;
    const identity = this.identity(contents, origin);
    const capability =
      details.mediaType === 'video'
        ? 'camera'
        : details.mediaType === 'audio'
          ? 'microphone'
          : undefined;
    const grant = contents && this.grants.get(contents);
    return Boolean(
      identity &&
        capability &&
        grant?.origin === identity.origin &&
        grant.capabilities.has(capability),
    );
  }
  request(
    contents: WebContents,
    permission: string,
    callback: (allow: boolean) => void,
    details: Electron.MediaAccessPermissionRequest,
  ): void {
    const identity = this.identity(contents, details.requestingUrl);
    if (
      !identity?.owner.active ||
      !details.isMainFrame ||
      !['media', 'display-capture'].includes(permission)
    ) {
      callback(false);
      return;
    }
    const capabilities: MediaCapability[] =
      permission === 'display-capture'
        ? ['screen']
        : (details.mediaTypes ?? []).map((type) => (type === 'video' ? 'camera' : 'microphone'));
    if (!capabilities.length) {
      callback(false);
      return;
    }
    this.ask(contents, identity.owner.id, identity.origin, capabilities, (allow) => {
      if (allow) {
        const grant = this.grants.get(contents) ?? {
          appId: identity.owner.id,
          origin: identity.origin,
          capabilities: new Set<MediaCapability>(),
        };
        capabilities.forEach((capability) => grant.capabilities.add(capability));
        this.grants.set(contents, grant);
        if (permission === 'display-capture') this.screenTickets.add(contents);
      }
      callback(allow);
    });
  }
  configure(session: Session): void {
    session.setDisplayMediaRequestHandler((request, callback) => {
      const frame = request.frame;
      const contents = frame && webContents.fromFrame(frame);
      const identity = this.identity(contents ?? null, request.securityOrigin);
      if (
        !frame ||
        frame !== frame.top ||
        !contents ||
        !identity ||
        !request.userGesture ||
        !this.screenTickets.delete(contents)
      ) {
        callback(null);
        return;
      }
      void desktopCapturer
        .getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: false,
        })
        .then((sources) => {
          if (!this.identity(contents, identity.origin)) {
            callback(null);
            return;
          }
          const options = sources.slice(0, 100);
          this.ask(
            contents,
            identity.owner.id,
            identity.origin,
            ['screen'],
            (allow, source) => {
              const chosen = options.find((value) => value.id === source);
              callback(allow && chosen ? { video: chosen } : null);
            },
            options.map((source) => ({ id: source.id, name: source.name })),
          );
        })
        .catch(() => callback(null));
    });
  }
  private ask(
    contents: WebContents,
    appId: string,
    origin: string,
    capabilities: MediaCapability[],
    finish: (allow: boolean, source?: string) => void,
    sources?: { id: string; name: string }[],
  ): void {
    if (
      this.pending.size >= 16 ||
      [...this.pending.values()].some((p) => p.contents === contents)
    ) {
      finish(false);
      return;
    }
    const id = randomUUID();
    const pending: Pending = {
      info: { id, appId, origin, capabilities, ...(sources ? { sources } : {}) },
      contents,
      timer: setTimeout(() => this.finish(id, false), 60000),
      finish,
    };
    this.pending.set(id, pending);
    this.log('permission-request');
    this.changed();
  }
  private finish(id: string, allow: boolean, source?: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    const valid = this.identity(pending.contents, pending.info.origin);
    const granted = Boolean(
      allow &&
        valid &&
        valid.owner.id === pending.info.appId &&
        (!pending.info.sources || pending.info.sources.some((value) => value.id === source)),
    );
    try {
      pending.finish(granted, source);
    } catch {
      /* Frame may have gone away. */
    }
    this.log(granted ? 'permission-granted' : 'permission-denied');
    this.changed();
  }
  respond(id: unknown, allow: unknown, source: unknown): void {
    if (
      typeof id !== 'string' ||
      typeof allow !== 'boolean' ||
      (source !== undefined && typeof source !== 'string') ||
      !this.pending.has(id)
    )
      throw new Error('Permission request expired.');
    this.finish(id, allow, source as string | undefined);
  }
  navigated(appId: string, url: string): void {
    for (const grant of this.grants.values())
      if (grant.appId === appId && grant.origin !== notificationOrigin(url)) this.closeApp(appId);
  }
  closeApp(appId: string): void {
    for (const [id, pending] of this.pending)
      if (pending.info.appId === appId) this.finish(id, false);
    for (const [contents, grant] of this.grants)
      if (grant.appId === appId) {
        this.grants.delete(contents);
        this.screenTickets.delete(contents);
      }
    this.changed();
  }
  close(): void {
    for (const id of this.pending.keys()) this.finish(id, false);
    this.grants.clear();
    this.screenTickets.clear();
  }
}
