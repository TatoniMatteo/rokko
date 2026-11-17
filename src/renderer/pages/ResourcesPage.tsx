import { useEffect, useState } from 'react';
import type {
  ResourceUsageSnapshot,
  ServiceResourceUsage,
  WebApp,
  Workspace,
} from '../../shared/contracts/model';
import { aggregateResourceUsage } from '../../shared/resources/resource-usage.mjs';
import { Card } from '../components/ui';
import { errorMessage, useI18n } from '../preferences/i18n';

const REFRESH_INTERVAL = 2000;

function formatMemory(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function ResourcesPage({
  services,
  workspaces,
}: {
  services: WebApp[];
  workspaces: Workspace[];
}) {
  const t = useI18n();
  const [snapshot, setSnapshot] = useState<ResourceUsageSnapshot | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const sample = async () => {
      try {
        const next = await window.rokko.getResourceUsage();
        if (alive) {
          setSnapshot(next);
          setError('');
        }
      } catch (reason) {
        if (alive) setError(errorMessage(reason));
      } finally {
        if (alive) timer = setTimeout(() => void sample(), REFRESH_INTERVAL);
      }
    };
    void sample();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const usages = new Map(snapshot?.services.map((usage) => [usage.id, usage]) ?? []);
  const groups = [
    ...workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      services: services.filter((service) => service.workspaceId === workspace.id),
    })),
    {
      id: '__unassigned__',
      name: t('No workspace'),
      services: services.filter(
        (service) =>
          !service.workspaceId ||
          !workspaces.some((workspace) => workspace.id === service.workspaceId),
      ),
    },
  ].filter((group) => group.services.length > 0);

  return (
    <div className="settings-page configuration-page resource-usage-page">
      <h1>{t('Resource usage')}</h1>
      <p className="page-note">
        {t(
          'CPU and memory are sampled every two seconds from Electron processes. Workspace totals include processes linked to their services; application totals include all Electron processes. A process shared by services is listed under each service, but counted once in workspace totals.',
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {!snapshot && !error && <p role="status">{t('Collecting resource usage…')}</p>}
      {snapshot && (
        <>
          <Card className="resource-total-card" aria-labelledby="application-resource-title">
            <h2 id="application-resource-title">{t('Entire application')}</h2>
            <div className="resource-usage-totals">
              <span>
                <strong>{t('CPU')}</strong> {snapshot.total.cpuPercent.toFixed(1)}%
              </span>
              <span>
                <strong>{t('Memory')}</strong> {formatMemory(snapshot.total.memoryBytes)}
              </span>
              <span>
                <strong>{t('Processes')}</strong> {snapshot.processCount}
              </span>
            </div>
          </Card>
          {groups.map((group) => {
            const groupUsages = group.services
              .map((service) => usages.get(service.id))
              .filter((usage): usage is ServiceResourceUsage => Boolean(usage));
            const total = aggregateResourceUsage(groupUsages);
            return (
              <Card key={group.id} className="resource-workspace-card">
                <div className="resource-workspace-heading">
                  <h2>{group.name}</h2>
                  <div className="resource-usage-totals">
                    <span>
                      <strong>{t('CPU')}</strong> {total.cpuPercent.toFixed(1)}%
                    </span>
                    <span>
                      <strong>{t('Memory')}</strong> {formatMemory(total.memoryBytes)}
                    </span>
                  </div>
                </div>
                <div className="resource-service-list">
                  {group.services.map((service) => {
                    const usage = usages.get(service.id);
                    return (
                      <div className="resource-service-row" key={service.id}>
                        <strong>{service.name}</strong>
                        {usage?.processId === null || !usage ? (
                          <span className="page-note">{t('No active process')}</span>
                        ) : (
                          <>
                            <span>{t('CPU')} {usage.cpuPercent.toFixed(1)}%</span>
                            <span>{t('Memory')} {formatMemory(usage.memoryBytes)}</span>
                            {usage.sharedWith.length > 0 && (
                              <span className="page-note">
                                {t('Process shared with {services}', {
                                  services: usage.sharedWith
                                    .map((id) => services.find((item) => item.id === id)?.name ?? id)
                                    .join(', '),
                                })}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
          <p className="page-note" role="status">
            {t('Last updated')}: {new Date(snapshot.sampledAt).toLocaleTimeString()}
          </p>
        </>
      )}
    </div>
  );
}
