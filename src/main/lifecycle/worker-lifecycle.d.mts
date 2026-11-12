import type { WebContents } from 'electron';
export function stopServiceWorkers(contents: WebContents): Promise<void>;
