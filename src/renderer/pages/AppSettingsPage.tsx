import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button, TextField, Spinner } from '../components/ui';
import { useI18n, errorMessage } from '../preferences/i18n';
import type { AppInput, WebApp, Workspace } from '../../shared/contracts/model';
import { normalizeHttpsUrl, validTitle } from '../../shared/security/validation.mjs';
import { notificationOrigin } from '../../shared/notifications/notifications.mjs';
import { ServiceIcon, readCustomIcon } from '../components/ServiceIcon';

interface AppSettingsPageProps {
  app?: WebApp;
  draft: AppInput;
  onDraft: (value: AppInput) => void;
  workspaces: Workspace[];
  previewUrl: string;
  busy: boolean;
  removalRequested?: number;
  onSave: () => void;
  onBack: () => void;
  onRemove: () => void;
  onError: (message: string) => void;
}

export function AppSettingsPage({
  app,
  draft,
  onDraft,
  workspaces,
  previewUrl,
  busy,
  onSave,
  onBack,
  onRemove,
  onError,
  removalRequested,
}: AppSettingsPageProps) {
  const t = useI18n();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [remove, setRemove] = useState(false);
  useEffect(() => {
    setRemove(Boolean(removalRequested));
    if (removalRequested) {
      requestAnimationFrame(() =>
        document.getElementById('app-removal')?.scrollIntoView({ block: 'nearest' }),
      );
    }
  }, [removalRequested]);
  const [readingIcon, setReadingIcon] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const origin = notificationOrigin(draft.url);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    try {
      validTitle(draft.name);
    } catch (e) {
      next['app-name'] = t(errorMessage(e));
    }
    try {
      normalizeHttpsUrl(draft.url);
    } catch (e) {
      next['app-url'] = t(errorMessage(e));
    }
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) document.getElementById(first)?.focus();
    else onSave();
  }

  return (
    <div className="settings-page configuration-page">
      <div className="page-heading">
        <div>
          <h1>{app ? t('Edit {name}', { name: app.name }) : t('Set up your application')}</h1>
          <p>{t('Give it a name, choose its workspace and make it yours.')}</p>
        </div>
      </div>
      <form className="settings-form service-form" noValidate onSubmit={handleSubmit}>
        <TextField
          label={t('Application name')}
          id="app-name"
          disabled={busy || readingIcon}
          value={draft.name}
          required
          maxLength={48}
          error={errors['app-name']}
          onChange={(event) => {
            setErrors((previous) => ({ ...previous, 'app-name': '' }));
            onDraft({ ...draft, name: event.target.value });
          }}
        />
        <TextField
          label={t('Website URL (HTTPS)')}
          id="app-url"
          disabled={busy || readingIcon}
          value={draft.url}
          required
          error={errors['app-url']}
          onChange={(event) => {
            setErrors((previous) => ({ ...previous, 'app-url': '' }));
            onDraft({
              ...draft,
              url: event.target.value,
              notificationOrigin:
                notificationOrigin(event.target.value) === draft.notificationOrigin
                  ? draft.notificationOrigin
                  : null,
            });
          }}
        />
        <div>
          <label htmlFor="app-workspace">{t('Workspace')}</label>
          <select
            id="app-workspace"
            disabled={busy || readingIcon}
            value={draft.workspaceId ?? 'global'}
            onChange={(event) =>
              onDraft({
                ...draft,
                workspaceId: event.target.value === 'global' ? null : event.target.value,
                shareWorkspaceSession:
                  event.target.value === 'global' ? false : draft.shareWorkspaceSession,
              })
            }
          >
            <option value="global">{t('Always visible · no workspace')}</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <p className="page-note">
            {t(
              draft.workspaceId === null
                ? 'Available in every workspace'
                : 'Choose no workspace to keep this service always visible.',
            )}
          </p>
        </div>
        <details className="settings-card icon-settings">
          <summary>
            <span className="icon-preview">
              <ServiceIcon name={draft.name} url={previewUrl} icon={draft.icon} />
              <span>
                <strong>
                  {t('Service icon')} · {draft.icon ? t('Custom image') : t('Website favicon')}
                </strong>
                <span className="page-note">
                  {t('Automatic icons follow the saved website. Missing icons use initials.')}
                </span>
              </span>
            </span>
          </summary>
          <div className="icon-settings-body">
            {readingIcon && (
              <p className="loading-status" role="status">
                <Spinner />
                {t('Loading')}
              </p>
            )}
            <label htmlFor="app-icon">{t('Choose an image')}</label>
            <input
              id="app-icon"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy || readingIcon}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setReadingIcon(true);
                try {
                  const icon = await readCustomIcon(file);
                  if (mounted.current) onDraft({ ...draft, icon });
                } catch (error) {
                  onError(errorMessage(error));
                } finally {
                  if (mounted.current) setReadingIcon(false);
                }
              }}
            />
            <button
              type="button"
              className="text-button"
              disabled={busy || readingIcon}
              onClick={() => onDraft({ ...draft, icon: null })}
            >
              {t('Use website favicon')}
            </button>
          </div>
        </details>
        <section className="full-width session-settings">
          <label className="notification-toggle">
            <input
              id="app-shared-session"
              type="checkbox"
              checked={Boolean(draft.workspaceId !== null && draft.shareWorkspaceSession)}
              disabled={busy || readingIcon || draft.workspaceId === null}
              onChange={(event) =>
                onDraft({ ...draft, shareWorkspaceSession: event.target.checked })
              }
            />
            <span>{t('Use the workspace account session')}</span>
          </label>
          <p className="page-note">
            {t(
              'Workspace sessions share logins between connected services. Other workspaces and global services stay separate. Changing session reloads this app; previous session data stays on this device and is not copied.',
            )}
          </p>
        </section>
        <section className="full-width notification-settings" aria-label={t('Notifications')}>
          <label className="notification-toggle" htmlFor="app-notifications">
            <input
              id="app-notifications"
              type="checkbox"
              disabled={busy || readingIcon || !origin}
              checked={Boolean(origin && draft.notificationOrigin === origin)}
              onChange={(event) => {
                setTestStatus('');
                onDraft({ ...draft, notificationOrigin: event.target.checked ? origin : null });
              }}
            />
            <span>
              {t('Allow notifications from')} <strong>{origin ?? t('this website')}</strong>
            </span>
          </label>
          <p className="page-note">
            {t(
              'Permission applies only to this app and website. Enable notifications in the service too, if it asks. Changing the website requires a new consent. Enabled services start with Rokko and stay connected in the background. Saving a permission change reloads this app without signing you out.',
            )}
          </p>
          <Button
            variant="secondary"
            type="button"
            className="secondary"
            aria-busy={testStatus === t('Sending')}
            disabled={
              busy ||
              testStatus === t('Sending') ||
              !app?.notificationOrigin ||
              app.notificationOrigin !== draft.notificationOrigin
            }
            onClick={async () => {
              if (!app) return;
              setTestStatus(t('Sending'));
              try {
                await window.rokko.testNotification(app.id);
                if (mounted.current) setTestStatus(t('Test notification sent.'));
              } catch (error) {
                if (mounted.current) setTestStatus(errorMessage(error));
              }
            }}
          >
            {t('Send test notification')}
          </Button>
          {testStatus && (
            <p className="page-note loading-status" role="status">
              {t(testStatus)}
            </p>
          )}
        </section>
        <div className="page-actions full-width">
          <Button className="primary" type="submit" aria-busy={busy} disabled={busy || readingIcon}>
            {busy ? t('Saving') : app ? t('Save changes') : t('Add application')}
          </Button>
          <Button
            variant="secondary"
            className="secondary"
            type="button"
            disabled={busy}
            onClick={onBack}
          >
            {t('Cancel')}
          </Button>
        </div>
      </form>
      {app && (
        <section id="app-removal" className="settings-card danger-zone">
          <h2>{t('Remove application')}</h2>
          <p className="page-note">
            {t(
              'This removes the service from Rokko. Its browser session data stays on this device.',
            )}
          </p>
          {remove ? (
            <div className="page-actions">
              <Button
                variant="danger-button"
                className="danger-button"
                disabled={busy}
                onClick={onRemove}
              >
                {t('Confirm removal')}
              </Button>
              <Button variant="secondary" className="secondary" onClick={() => setRemove(false)}>
                {t('Keep application')}
              </Button>
            </div>
          ) : (
            <Button
              variant="danger-button"
              className="danger-button"
              onClick={() => setRemove(true)}
            >
              {t('Remove application')}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
