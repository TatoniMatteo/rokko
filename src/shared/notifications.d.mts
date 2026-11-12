import type { WebApp } from './model';
export function notificationOrigin(url: unknown): string | null;
export function validNotificationGrant(value: unknown, url: string): string | undefined;
export function notificationAllowed(app: WebApp | undefined, permission: string, requestingOrigin: unknown): boolean;
