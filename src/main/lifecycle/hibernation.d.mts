import type {
  HibernationContext,
  HibernationPolicy,
  SuspensionReason,
} from '../../shared/hibernation/rules.mjs';
export class Hibernation {
  constructor(options: {
    context: () => HibernationContext & { policy: HibernationPolicy };
    close: (id: string) => Promise<void>;
    wake: (id: string, wasLoaded: boolean) => void;
    changed: () => void;
    startup?: boolean;
  });
  has(id: string): boolean;
  reasons(): Record<string, SuspensionReason>;
  touch(id: string): void;
  requestWake(id: string): void;
  request(): void;
  reconcile(): void;
  settle(id: string): Promise<void>;
  stop(): void;
}
