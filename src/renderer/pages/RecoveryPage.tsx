import logo from '../../../assets/brand/rokko-dark-icon.png';
import { useState } from 'react';
import type { ProfileRecovery } from '../../shared/contracts/model';
import { Button, Card } from '../components/ui';
import { useI18n } from '../preferences/i18n';

export function RecoveryPage({
  recovery,
  busy,
  error,
  onRecover,
}: {
  recovery: ProfileRecovery;
  busy: boolean;
  error: string;
  onRecover: (action: 'restore' | 'new') => void;
}) {
  const t = useI18n();
  const [confirmNew, setConfirmNew] = useState(false);
  return (
    <div className="settings-page configuration-page">
      <div className="page-heading">
        <img className="dashboard-logo" src={logo} alt="Rokko" />
        <div>
          <h1>{t('Recover your configuration')}</h1>
          <p>{t('Your browser accounts and sessions have not been deleted.')}</p>
        </div>
      </div>
      <Card>
        {recovery.kind === 'future' ? (
          <>
            <h2>{t('A newer version of Rokko is required')}</h2>
            <p>
              {t(
                'This configuration uses a newer database format. Install a compatible version; Rokko will not overwrite it.',
              )}
            </p>
          </>
        ) : (
          <>
            <h2>{t('The saved configuration could not be opened')}</h2>
            <p>
              {t(
                'Keep the existing files for recovery, or restore the previous saved configuration if available.',
              )}
            </p>
            {recovery.canRestore && (
              <Button disabled={busy} aria-busy={busy} onClick={() => onRecover('restore')}>
                {t('Restore previous configuration')}
              </Button>
            )}
            {confirmNew ? (
              <section className="inline-confirm" aria-label={t('Start a new configuration')}>
                <p>
                  {t(
                    'Your current configuration will be archived. Services must be added again; Chromium login data stays on this device.',
                  )}
                </p>
                <div className="page-actions">
                  <Button
                    variant="danger-button"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => onRecover('new')}
                  >
                    {t('Archive and start again')}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => setConfirmNew(false)}>
                    {t('Cancel')}
                  </Button>
                </div>
              </section>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={() => setConfirmNew(true)}>
                {t('Start a new configuration')}
              </Button>
            )}
          </>
        )}
        {error && (
          <p className="field-error" role="alert">
            {t(error)}
          </p>
        )}
      </Card>
    </div>
  );
}
