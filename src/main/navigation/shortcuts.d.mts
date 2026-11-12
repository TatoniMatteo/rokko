import type { AppData } from '../../shared/contracts/model';
export interface NavigationInput {
  type: string; key: string; control?: boolean; alt?: boolean; shift?: boolean; meta?: boolean;
  isComposing?: boolean; isAutoRepeat?: boolean;
}
export function shortcutTarget(data: AppData, activeAppId: string | null, input: NavigationInput,
  configuring?: boolean): { appId: string | null; workspaceId: string } | null;
