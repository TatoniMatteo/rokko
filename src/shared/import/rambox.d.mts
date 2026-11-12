import type { AppData } from '../contracts/model';
export interface ImportService { sourceId: string; name: string; url: string }
export interface ImportRequest {
  services: { name: string; url: string; workspaceId: string | null }[];
  newWorkspaceName?: string;
}
export function importUrl(value: unknown): string;
export function parseRamboxMetadata(value: unknown): ImportService[];
export function planRamboxImport(data: AppData, input: unknown, uuid: () => string): AppData;
