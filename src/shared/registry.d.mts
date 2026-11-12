import type { AppData, AppInput } from './model';
export function appInput(data: AppData, input: unknown): Required<Pick<AppInput, 'name' | 'url' | 'workspaceId'>> & { icon?: string; notificationOrigin?: string };
export function updateApp(data: AppData, id: unknown, input: unknown): AppData;
export function renameWorkspace(data: AppData, id: unknown, name: unknown): AppData;
export function removeWorkspace(data: AppData, id: unknown, destinationId: unknown): AppData;
export function reorderApp(data: AppData, id: unknown, direction: unknown): AppData;
