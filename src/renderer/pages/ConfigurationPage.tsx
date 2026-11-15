import { useState } from 'react';
import type { AppSnapshot } from '../../shared/contracts/model';
import type { Configuration } from '../../shared/import/configuration.mjs';
import { Button, Card } from '../components/ui';
import { useI18n, errorMessage } from '../preferences/i18n';
export function ConfigurationPage({ onImported }: { onImported: (snapshot: AppSnapshot) => void }) {
  const t = useI18n();
  const [document, setDocument] = useState<Configuration | null>(null);
  const [duplicates, setDuplicates] = useState<'skip' | 'copy'>('skip');
  const [appearance, setAppearance] = useState(false);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus('');
    try {
      await action();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-page configuration-page">
      <div className="page-heading">
        <div>
          <h1>{t('Import and export')}</h1>
          <p>
            {t('Move services and workspaces without cookies, credentials or permission grants.')}
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <Card>
          <h2>{t('Export configuration')}</h2>
          <p className="page-note">
            {t(
              'The file contains service names, URLs, custom icons and appearance. Keep it private.',
            )}
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            aria-busy={busy}
            onClick={() =>
              void run(async () => {
                if (await window.rokko.exportConfiguration()) setStatus('Configuration exported.');
              })
            }
          >
            {t('Save configuration file')}
          </Button>
        </Card>
        <Card>
          <h2>{t('Import configuration')}</h2>
          <p className="page-note">
            {t('Preview before importing. Existing services and sessions are preserved.')}
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setDocument(await window.rokko.readConfiguration());
              })
            }
          >
            {t('Choose configuration file')}
          </Button>
        </Card>
      </div>
      {document && (
        <section className="settings-card import-preview">
          <h2>{t('Import preview')}</h2>
          <p>
            {t('{services} services and {workspaces} workspaces', {
              services: document.services.length,
              workspaces: document.workspaces.length,
            })}
          </p>
          <p className="page-note">
            {t(
              'Workspaces with the same name are matched. Shared services may use accounts already logged into that destination workspace. Notification and device permissions must be granted again.',
            )}
          </p>
          <label htmlFor="configuration-duplicates">{t('Matching services')}</label>
          <select
            id="configuration-duplicates"
            value={duplicates}
            disabled={busy}
            onChange={(e) => setDuplicates(e.target.value as 'skip' | 'copy')}
          >
            <option value="skip">{t('Skip existing matches')}</option>
            <option value="copy">{t('Create additional copies')}</option>
          </select>
          <label className="notification-toggle">
            <input
              type="checkbox"
              checked={appearance}
              disabled={busy}
              onChange={(e) => setAppearance(e.target.checked)}
            />
            {t('Also import appearance and language')}
          </label>
          <ul className="configuration-preview">
            {document.services.map((service) => (
              <li key={service.key}>
                <strong>{service.name}</strong>
                <span>
                  {document.workspaces.find((w) => w.key === service.workspaceKey)?.name ??
                    t('Always visible')}
                </span>
              </li>
            ))}
          </ul>
          <div className="page-actions">
            <Button
              disabled={busy}
              aria-busy={busy}
              onClick={() =>
                void run(async () => {
                  const snapshot = await window.rokko.importConfiguration(document, {
                    duplicates,
                    appearance,
                  });
                  onImported(snapshot);
                  setDocument(null);
                  setStatus(t('Imported {added}; skipped {skipped}.', snapshot.importSummary));
                })
              }
            >
              {t('Confirm import')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setDocument(null)}>
              {t('Cancel')}
            </Button>
          </div>
        </section>
      )}
      {status && <p role="status">{t(status)}</p>}
    </div>
  );
}
