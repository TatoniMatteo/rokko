import { suspensionLabel } from '../preferences/service-status';
import { useState } from 'react';
import type { AppSnapshot, RokkoAPI } from '../../shared/contracts/model';
import { dockApps } from '../../shared/preferences/preferences.mjs';
import { Button, Card } from './ui';
import { errorMessage, useI18n } from '../preferences/i18n';
export function ServiceTools({
  snapshot,
  onUpdate,
}: {
  snapshot: AppSnapshot;
  onUpdate: (snapshot: AppSnapshot) => void;
}) {
  const t = useI18n(),
    service = snapshot.data.apps.find((a) => a.id === snapshot.activeAppId)!;
  const [confirm, setConfirm] = useState<'reset-permissions' | 'clear-cache' | null>(null);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  const preferences = snapshot.preferences!;
  const peers = snapshot.data.apps.filter((a) => a.partition === service.partition);
  const state = snapshot.appStates?.[service.id];
  const health = snapshot.suspendedIds?.includes(service.id)
    ? t('Suspended')
    : state?.status === 'failed'
      ? t('Failed')
      : state?.status === 'loading'
        ? t('Loading')
        : snapshot.loadedIds?.includes(service.id)
          ? t('Ready')
          : t('Not loaded');
  async function run(action: () => Promise<AppSnapshot>) {
    setBusy(true);
    setStatus('');
    try {
      onUpdate(await action());
      setConfirm(null);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const control = (action: Parameters<RokkoAPI['controlService']>[1]) =>
    run(() => window.rokko.controlService(service.id, action));
  return (
    <div className="settings-grid">
      <Card>
        <h2>{t('Service health')}</h2>
        <p role="status">{health}</p>
        {snapshot.suspendedIds?.includes(service.id)&&<p>{suspensionLabel(snapshot.suspensionReasons?.[service.id],t)}</p>}
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void control(preferences.mutedServices.includes(service.id) ? 'unmute' : 'mute')
          }
        >
          {t(preferences.mutedServices.includes(service.id) ? 'Unmute service' : 'Mute service')}
        </Button>
        <p className="page-note">
          {t(
            'Mute affects audio from this service. Desktop notifications keep their own settings.',
          )}
        </p>
      </Card>
      <Card>
        <h2>{t('Split view')}</h2>
        <label htmlFor="split-service">{t('Show alongside this service')}</label>
        <select
          id="split-service"
          disabled={busy}
          value={preferences.split.secondaryId ?? ''}
          onChange={(event) =>
            void run(() =>
              window.rokko.setSplit(event.target.value || null, preferences.split.ratio),
            )
          }
        >
          <option value="">{t('Single service')}</option>
          {dockApps(snapshot.data, preferences)
            .filter((a) => a.id !== service.id)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
        <p className="page-note">
          {t('Sessions stay separate. Drag the divider or use its arrow keys to resize.')}
        </p>
      </Card>
      <Card>
        <h2>{t('Permissions and cache')}</h2>
        <div className="page-actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setConfirm('reset-permissions')}
          >
            {t('Reset service permissions')}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirm('clear-cache')}>
            {t('Clear HTTP cache')}
          </Button>
        </div>
        {confirm && (
          <section className="inline-confirm">
            <h3>
              {t(confirm === 'clear-cache' ? 'Clear HTTP cache' : 'Reset service permissions')}
            </h3>
            <p>
              {t(
                confirm === 'clear-cache'
                  ? 'Only the HTTP cache of this session is cleared. Cookies, passwords and website storage are kept. Shared peers are affected too; their next load may be slower.'
                  : 'Notification and device grants for this service are removed. The service reloads and active downloads or unsaved drafts may be lost. Cookies are kept.',
              )}
            </p>
            {confirm === 'clear-cache' && (
              <p>
                {t('Affected services')}: {peers.map((a) => a.name).join(', ')}
              </p>
            )}
            <div className="page-actions">
              <Button
                variant="danger-button"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void control(confirm)}
              >
                {t('Confirm')}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>
                {t('Cancel')}
              </Button>
            </div>
          </section>
        )}
      </Card>
      {status && <p role="alert">{t(status)}</p>}
    </div>
  );
}
