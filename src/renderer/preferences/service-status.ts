import type { SuspensionReason } from '../../shared/hibernation/rules.mjs';
type Translate = (message: string, values?: Record<string, string | number>) => string;
export function suspensionLabel(reason: SuspensionReason | undefined, t: Translate): string {
  if (reason?.kind === 'hidden-workspace') return t('Hibernated because its workspace is hidden.');
  if (reason?.kind === 'rule') return t('Hibernated by rule: {name}', { name: reason.name });
  return t('Manually suspended.');
}
