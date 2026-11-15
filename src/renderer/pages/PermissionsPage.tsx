import { useState } from 'react';
import type { PermissionState, WebApp, MediaCapability } from '../../shared/contracts/model';
import { Button, Card } from '../components/ui';
import { errorMessage, useI18n } from '../preferences/i18n';
export function PermissionsPage({
  state,
  services,
  onRevoke,
}: {
  state: PermissionState;
  services: WebApp[];
  onRevoke: (id: string) => void;
}) {
  const t = useI18n();
  const [error, setError] = useState('');
  const labels: Record<MediaCapability, string> = {
    camera: t('Camera'),
    microphone: t('Microphone'),
    screen: t('Screen sharing'),
  };
  const name = (id: string) =>
    services.find((service) => service.id === id)?.name ?? t('Removed service');
  async function respond(id: string, allow: boolean, source?: string) {
    try {
      await window.rokko.respondPermission(id, allow, source);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="settings-page configuration-page">
      <h1>{t('Service permissions')}</h1>
      <p className="page-note">
        {t(
          'Only the requesting service and origin receive access. Grants last until the service is closed, its origin changes, or Rokko restarts. Screen capture always requires a source choice; system audio is not shared on Linux.',
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      <div className="settings-grid">
        {state.requests.map((request) => (
          <Card key={request.id}>
            <h2>{name(request.appId)}</h2>
            <p>{request.origin}</p>
            <p>{request.capabilities.map((value) => labels[value]).join(' · ')}</p>
            {request.sources ? (
              <>
                <h3>{t('Choose what to share')}</h3>
                {request.sources.map((source) => (
                  <Button
                    variant="secondary"
                    key={source.id}
                    onClick={() => void respond(request.id, true, source.id)}
                  >
                    {source.name}
                  </Button>
                ))}
                {!request.sources.length && <p>{t('No capture sources available.')}</p>}
              </>
            ) : (
              <Button onClick={() => void respond(request.id, true)}>
                {t('Allow for this service')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => void respond(request.id, false)}>
              {t('Deny')}
            </Button>
          </Card>
        ))}
        {!state.requests.length && (
          <Card>
            <p>{t('No pending permission requests.')}</p>
          </Card>
        )}
        {state.grants.map((grant) => (
          <Card key={grant.appId + grant.origin}>
            <h2>{name(grant.appId)}</h2>
            <p>{grant.origin}</p>
            <p>{grant.capabilities.map((value) => labels[value]).join(' · ')}</p>
            <p className="page-note">
              {t(
                'Revoking reloads this service to stop active capture. Unsaved website drafts and active downloads may be lost; login data is kept.',
              )}
            </p>
            <Button variant="secondary" onClick={() => onRevoke(grant.appId)}>
              {t('Revoke service access')}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
