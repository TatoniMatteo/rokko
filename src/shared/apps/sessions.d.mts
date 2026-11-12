import type { AppData, WebApp } from '../contracts/model';
export function workspacePartition(id: string): string;
export function sharesWorkspace(app: WebApp): boolean;
export function servicePartition(id: string, workspaceId: string | null, shared: boolean): string;
export function visibleApps(data: AppData): WebApp[];
