import type { Preferences } from '../../shared/preferences/preferences.mjs';
import type { AppData } from '../../shared/contracts/model';
export interface NavigationInput {
  type: string; key: string; control?: boolean; alt?: boolean; shift?: boolean; meta?: boolean;
  isComposing?: boolean; isAutoRepeat?: boolean;
}
export function shortcutTarget(data: AppData, activeAppId: string | null, input: NavigationInput,
  configuring?: boolean, preferences?: Preferences): { appId: string | null; workspaceId: string } | null;
