import type { WebContents } from 'electron';
export function stopServiceWorkers(contents: WebContents, origins?: string[]): Promise<void>;
