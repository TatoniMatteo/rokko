import type { Preferences } from '../preferences/preferences.mjs';
import type { ImportRequest, ImportService } from '../import/rambox.mjs';
export interface WebApp {
  id: string;
  name: string;
  url: string;
  workspaceId: string | null;
  partition: string;
  icon?: string;
  notificationOrigin?: string;
}
export interface AppInput { name: string; url: string; workspaceId?: string | null; shareWorkspaceSession?: boolean; icon?: string | null; notificationOrigin?: string | null }
export interface Workspace { id: string; name: string }
export interface AppData {
  version: 1;
  workspaces: Workspace[];
  apps: WebApp[];
  selectedWorkspaceId: string;
}
export interface AppSnapshot {
  data: AppData;
  activeAppId: string | null;
  appStates?: Record<string, AppLoadState>;
  preferences?: Preferences;
  browserLanguage?: string;
}
export interface AppLoadState {
  status: 'loading' | 'ready' | 'failed';
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: number | 'blocked';
}
export interface ViewBounds { x: number; y: number; width: number; height: number }
export interface ContextMenuRequest { kind: 'service' | 'workspace' | 'global'; id: string }
export type ContextMenuAction = 'open' | 'edit' | 'reload' | 'browser' | 'services' | 'hide' | 'show';
export interface RokkoAPI {
  onServiceIcon(callback: (url: string, icon: string) => void): () => void;
  showContextMenu(input: ContextMenuRequest): Promise<ContextMenuAction | null>;
  setPreferences(input: Preferences): Promise<AppSnapshot>;
  moveApp(id: string, targetId: string, after: boolean): Promise<AppSnapshot>;
  restart(): Promise<void>;
  readRambox(port: number, token: string): Promise<ImportService[]>;
  importRambox(input: ImportRequest): Promise<AppSnapshot>;
  onAppState(callback: (id: string, state: AppLoadState | null) => void): () => void;
  onSnapshot(callback: (snapshot: AppSnapshot) => void): () => void;
  getSnapshot(): Promise<AppSnapshot>;
  addApp(input: AppInput): Promise<AppSnapshot>;
  addWorkspace(name: string): Promise<AppSnapshot>;
  selectWorkspace(id: string): Promise<AppSnapshot>;
  selectApp(id: string | null): Promise<AppSnapshot>;
  removeApp(id: string): Promise<AppSnapshot>;
  updateApp(id: string, input: AppInput): Promise<AppSnapshot>;
  renameWorkspace(id: string, name: string): Promise<AppSnapshot>;
  removeWorkspace(id: string, destinationId: string): Promise<AppSnapshot>;
  reorderApp(id: string, direction: -1 | 1): Promise<AppSnapshot>;
  testNotification(id: string): Promise<void>;
  getServiceIcon(url: string): Promise<string | null>;
  updateBounds(bounds: ViewBounds): void;
  setOverlayOpen(open: boolean): void;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  reload(): Promise<void>;
  openExternal(url: string): Promise<void>;
}
