export function resourceUsage(services, processIds, metrics, sampledAt = Date.now()) {
  const byPid = new Map(metrics.map(metric => [metric.pid, metric]));
  const idsByPid = new Map();
  for (const service of services) {
    const pid = processIds[service.id];
    if (typeof pid !== 'number' || pid <= 0) continue;
    const ids = idsByPid.get(pid) ?? [];
    ids.push(service.id);
    idsByPid.set(pid, ids);
  }
  const number = value => Number.isFinite(value) && value > 0 ? value : 0;
  const servicesUsage = services.map(service => {
    const pid = processIds[service.id];
    const metric = typeof pid === 'number' ? byPid.get(pid) : undefined;
    const usage = metric ? {
      cpuPercent: number(metric.cpu?.percentCPUUsage),
      memoryBytes: Math.round(number(metric.memory?.workingSetSize) * 1024),
    } : { cpuPercent: 0, memoryBytes: 0 };
    return {
      id: service.id,
      processId: metric ? pid : null,
      ...usage,
      sharedWith: metric ? (idsByPid.get(pid) ?? []).filter(id => id !== service.id) : [],
    };
  });
  const total = metrics.reduce((usage, metric) => ({
    cpuPercent: usage.cpuPercent + number(metric.cpu?.percentCPUUsage),
    memoryBytes: usage.memoryBytes + Math.round(number(metric.memory?.workingSetSize) * 1024),
  }), { cpuPercent: 0, memoryBytes: 0 });
  return {
    sampledAt,
    processCount: metrics.length,
    total,
    services: servicesUsage,
  };
}

export function aggregateResourceUsage(usages) {
  const processes = new Map();
  for (const usage of usages) {
    if (usage.processId !== null && !processes.has(usage.processId))
      processes.set(usage.processId, usage);
  }
  return [...processes.values()].reduce(
    (total, usage) => ({
      cpuPercent: total.cpuPercent + usage.cpuPercent,
      memoryBytes: total.memoryBytes + usage.memoryBytes,
    }),
    { cpuPercent: 0, memoryBytes: 0 },
  );
}
