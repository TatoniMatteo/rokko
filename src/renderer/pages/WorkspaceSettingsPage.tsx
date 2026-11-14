import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Button, TextField } from '../components/ui';
import { useI18n, errorMessage } from '../preferences/i18n';
import type { AppData, WebApp, Workspace } from '../../shared/contracts/model';
import { validTitle } from '../../shared/security/validation.mjs';
import { sharesWorkspace } from '../../shared/apps/sessions.mjs';

interface WorkspaceSettingsPageProps {
  workspace?: Workspace;
  data: AppData;
  busy: boolean;
  onSave: (name: string) => void;
  onRemove: (destination: string) => void;
  onBack: () => void;
  onSession: (app: WebApp, shared: boolean) => void;
  onAccount: (provider: 'google' | 'microsoft') => void;
  onDirty: (dirty: boolean) => void;
  removalRequested?: number;
}

export function WorkspaceSettingsPage({
  workspace,
  data,
  busy,
  onSave,
  onRemove,
  onBack,
  onSession,
  onAccount,
  onDirty,
  removalRequested,
}: WorkspaceSettingsPageProps) {
  const t = useI18n();
  const [name, setName] = useState(workspace?.name ?? '');
  const [destination, setDestination] = useState('');
  const [nameError, setNameError] = useState('');
  useEffect(() => {
    if (removalRequested)
      requestAnimationFrame(() => {
        document.getElementById('workspace-removal')?.scrollIntoView({ block: 'nearest' });
        document.getElementById('workspace-destination')?.focus();
      });
  }, [removalRequested]);
  const count = data.apps.filter((app) => app.workspaceId === workspace?.id).length;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      validTitle(name);
      setNameError('');
      onSave(name);
    } catch (e) {
      setNameError(t(errorMessage(e)));
      document.getElementById('workspace-name')?.focus();
    }
  }

  return (
    <div className="settings-page configuration-page">
      <div className="page-heading">
        <div>
          <h1>{workspace ? t('Edit {name}', { name: workspace.name }) : t('Create workspace')}</h1>
          <p>{t('Organize your applications by context.')}</p>
        </div>
      </div>
      <div className="settings-grid workspace-settings">
        <form className="settings-form" noValidate onSubmit={handleSubmit}>
          <TextField
            label={t('Workspace name')}
            id="workspace-name"
            error={nameError}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              onDirty(event.target.value !== (workspace?.name ?? ''));
            }}
            required
            maxLength={48}
            autoFocus
          />
          <div className="page-actions">
            <Button className="primary" type="submit" aria-busy={busy} disabled={busy}>
              {workspace ? t('Save workspace') : t('Create workspace')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onBack}>
              {t('Cancel')}
            </Button>
          </div>
        </form>
        {workspace && (
          <section className="settings-card">
            <h2>{t('Workspace accounts')}</h2>
            <p className="page-note">
              {t(
                'Sign in through the provider’s account page. Connected services use this workspace’s browser session, including Google sign-in where supported. Each workspace has its own session; passwords and cookies stay in Chromium.',
              )}
            </p>
            <div className="page-actions">
              <Button
                variant="secondary"
                className="secondary"
                disabled={busy}
                onClick={() => onAccount('google')}
              >
                {t('Manage Google accounts')}
              </Button>
              <Button
                variant="secondary"
                className="secondary"
                disabled={busy}
                onClick={() => onAccount('microsoft')}
              >
                {t('Manage Microsoft accounts')}
              </Button>
            </div>
            <p className="page-note">
              {t(
                'The account page opens as a service in this workspace. The provider handles account selection and sign-out. Changing a service’s session keeps its previous login data on this device.',
              )}
            </p>
            {data.apps
              .filter((app) => app.workspaceId === workspace.id)
              .map((app) => (
                <label className="notification-toggle" key={app.id}>
                  <input
                    type="checkbox"
                    checked={sharesWorkspace(app)}
                    disabled={busy}
                    onChange={(event) => onSession(app, event.target.checked)}
                  />
                  <span>
                    {app.name} ·{' '}
                    {sharesWorkspace(app) ? t('Workspace session') : t('Separate session')}
                  </span>
                </label>
              ))}
          </section>
        )}
        {workspace && (
          <section id="workspace-removal" className="settings-card danger-zone">
            <h2>{t('Remove workspace')}</h2>
            {data.workspaces.length <= 1 ? (
              <p className="page-note">
                {t('Keep at least one workspace. Create another before removing this one.')}
              </p>
            ) : (
              <>
                <p className="page-note">
                  {t('Move its')} {count}
                  {t(
                    'application(s) to another workspace. Separate sessions are preserved; shared services use the destination workspace session.',
                  )}
                </p>
                <label htmlFor="workspace-destination">{t('Move applications to')}</label>
                <select
                  id="workspace-destination"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                >
                  <option value="">{t('Choose a destination…')}</option>
                  {data.workspaces
                    .filter((item) => item.id !== workspace.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
                <Button
                  variant="danger-button"
                  className="danger-button"
                  disabled={busy || !destination}
                  onClick={() => onRemove(destination)}
                >
                  {t('Transfer applications and remove workspace')}
                </Button>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
