import type {
  ServiceResourceUsage,
  ResourceUsageSnapshot,
  WebApp,
} from '../contracts/model';
export function resourceUsage(
  services: WebApp[],
  processIds: Record<string, number | undefined>,
  metrics: Electron.ProcessMetric[],
  sampledAt?: number,
): ResourceUsageSnapshot;
export function aggregateResourceUsage(
  usages: ServiceResourceUsage[],
): { cpuPercent: number; memoryBytes: number };
