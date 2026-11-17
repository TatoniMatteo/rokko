export type HibernationCondition =
  | { kind: 'inactive'; minutes: number }
  | { kind: 'outside-workspace' }
  | { kind: 'startup' }
  | { kind: 'time'; start: string; end: string; days: number[] };
export interface HibernationRule {
  id: string;
  name: string;
  enabled: boolean;
  scope: { kind: 'all' } | { kind: 'workspace' | 'service'; id: string };
  match: 'all' | 'any';
  conditions: HibernationCondition[];
}
export interface HibernationPolicy {
  hiddenWorkspaces: boolean;
  protectAudio: boolean;
  protectDownloads: boolean;
  protectDeviceAccess: boolean;
  wakeOnSelection: boolean;
  startupIncludedServiceIds: string[];
  startupExcludedServiceIds: string[];
  excludedServiceIds: string[];
  rules: HibernationRule[];
}
export type SuspensionReason =
  | { kind: 'manual' }
  | { kind: 'hidden-workspace' }
  | { kind: 'rule'; ruleId: string; name: string };
export interface HibernationContext {
  services: {
    id: string;
    workspaceId: string | null;
    loaded: boolean;
    audible: boolean;
    downloading: boolean;
    deviceAccess: boolean;
  }[];
  visibleIds: string[];
  hiddenWorkspaceIds: string[];
  selectedWorkspaceId: string;
  manualIds: string[];
  startup?: boolean;
  wakeRequestedIds?: string[];
}
export function defaultHibernation(): HibernationPolicy;
export function validateHibernation(input?: unknown): HibernationPolicy;
export function hibernatesAtStartup(
  policy: HibernationPolicy,
  service: { id: string; workspaceId: string | null },
): boolean;
export function planHibernation(
  policy: HibernationPolicy,
  context: HibernationContext,
  lastUsed: Map<string, number>,
  sleeping: Map<string, { wasLoaded: boolean }>,
  now: number,
): { wanted: Map<string, SuspensionReason>; nextAt: number };
