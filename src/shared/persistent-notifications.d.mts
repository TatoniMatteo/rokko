export interface PersistentRequest {
  action: 'show' | 'list' | 'close'; scope: string; tag: string; id?: string; title?: string; body?: string;
  data?: string; silent?: boolean; requireInteraction?: boolean;
}
export function persistentRequest(value: unknown, origin: string): PersistentRequest;
