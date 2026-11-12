import type { AppData, ContextMenuAction } from '../../shared/contracts/model';
export interface ContextItem { action: ContextMenuAction; label: string; enabled: boolean }
export function contextMenuItems(data: AppData, input: unknown, language: string, loadedIds?: string[], hiddenIds?: string[]): ContextItem[];
