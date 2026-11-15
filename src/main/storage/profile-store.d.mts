import type { AppData } from '../../shared/contracts/model';
import type { Preferences } from '../../shared/preferences/preferences.mjs';
export type RecoveryKind = 'future' | 'legacy' | 'corrupt';
export interface ProfileState { data: AppData; preferences: Preferences; activeAppId: string | null; notices: string[] }
export class ProfileStore {
  constructor(directory: string, options?: { fault?: (point: string) => void });
  read(): ProfileState;
  saveData(data: AppData, activeAppId?: string | null): ProfileState;
  savePreferences(preferences: Preferences): void;
  saveContext(workspaceId: string, activeAppId: string | null): void;
  exportLegacy(destination: string): string;
  close(): void;
}
export function recoveryInfo(directory: string, kind: RecoveryKind): { kind: RecoveryKind; canRestore: boolean };
export function recoverProfile(directory: string, action: 'restore' | 'new', kind: RecoveryKind, options?: { fault?: (point: string) => void }): ProfileStore;

export function emptyProfile(): ProfileState;
