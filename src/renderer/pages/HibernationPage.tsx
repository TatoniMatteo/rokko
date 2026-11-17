import { useEffect, useState } from 'react';
import type { AppSnapshot, WebApp } from '../../shared/contracts/model';
import {
  hibernatesAtStartup,
  validateHibernation,
  type HibernationPolicy,
} from '../../shared/hibernation/rules.mjs';
import { Button, Card, TextField } from '../components/ui';
import { HibernationRuleEditor } from '../components/HibernationRuleEditor';
import { errorMessage, useI18n } from '../preferences/i18n';
export function HibernationPage({
  snapshot,
  service,
  busy,
  onDirty,
  onSave,
}: {
  snapshot: AppSnapshot;
  service?: WebApp;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (policy: HibernationPolicy) => Promise<boolean>;
}) {
  const t = useI18n(),
    saved = snapshot.preferences!.hibernation;
  const [draft, setDraft] = useState(saved),
    [error, setError] = useState('');
  const [inactivityId] = useState(() => 'inactivity-' + crypto.randomUUID());
  const inactivity = service
    ? draft.rules.find(
        (rule) =>
          rule.id.startsWith('inactivity-') &&
          rule.scope.kind === 'service' &&
          rule.scope.id === service.id &&
          rule.conditions.length === 1 &&
          rule.conditions[0].kind === 'inactive',
      )
    : undefined;
  const minutes =
    inactivity?.conditions[0].kind === 'inactive' ? inactivity.conditions[0].minutes : 15;
  const startupEnabled = Boolean(service && hibernatesAtStartup(draft, service));
  function changeInactivity(enabled: boolean, minutes: number) {
    if (!service) return;
    const rule = {
      id: inactivity?.id ?? inactivityId,
      name: t('Inactivity'),
      enabled,
      scope: { kind: 'service' as const, id: service.id },
      match: 'all' as const,
      conditions: [{ kind: 'inactive' as const, minutes }],
    };
    change({
      ...draft,
      rules: inactivity
        ? draft.rules.map((old) => (old.id === inactivity.id ? rule : old))
        : [...draft.rules, rule],
    });
  }
  function changeStartup(enabled: boolean) {
    if (!service) return;
    const startupExcludedServiceIds = enabled
      ? draft.startupExcludedServiceIds.filter((id) => id !== service.id)
      : [...new Set([...draft.startupExcludedServiceIds, service.id])];
    change({
      ...draft,
      startupIncludedServiceIds: enabled
        ? [...new Set([...draft.startupIncludedServiceIds, service.id])]
        : draft.startupIncludedServiceIds.filter((id) => id !== service.id),
      startupExcludedServiceIds,
    });
  }
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  useEffect(() => {
    setDraft(saved);
  }, [saved]);
  function change(policy: HibernationPolicy) {
    setDraft(policy);
    onDirty(JSON.stringify(policy) !== JSON.stringify(saved));
    setError('');
  }
  return (
    <div className="settings-page configuration-page">
      <div className="page-heading">
        <div>
          <h1>
            {t('Service hibernation')}
            {service && ' · ' + service.name}
          </h1>
          <p>
            {t(
              service
                ? 'Rules apply only to this service. Accounts stay on this device.'
                : 'Choose when background services sleep. Accounts stay on this device.',
            )}
          </p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          try {
            const policy = validateHibernation(draft);
            void onSave(policy).then((ok) => {
              if (ok) onDirty(false);
            });
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      >
        {!service && (
          <>
            <p className="page-note">
              {t(
                'While hibernated, services stop their notifications and background activity. Custom rules do not suspend the services you are viewing.',
              )}
            </p>
            <p className="page-note">
              {t(
                'Dock indicators: pause = hibernated; faded icon = not loaded; exclamation = error. Running services have no badge.',
              )}
            </p>
          </>
        )}
        {service ? (
          <div className="settings-grid">
            <Card>
              <h2>{t('At Rokko startup')}</h2>
              <label className="notification-toggle">
                <input
                  type="checkbox"
                  checked={startupEnabled}
                  disabled={busy}
                  onChange={(event) => changeStartup(event.target.checked)}
                />
                {t('Hibernate at startup')}
              </label>
              <p className="page-note">
                {t('Hibernate this service when Rokko starts.')}
              </p>
            </Card>
            <Card className="hibernation-inactivity">
              <h2>{t('Inactivity')}</h2>
              <label className="notification-toggle">
                <input
                  type="checkbox"
                  checked={inactivity?.enabled ?? false}
                  disabled={busy || (!inactivity && draft.rules.length >= 20)}
                  onChange={(event) => changeInactivity(event.target.checked, minutes)}
                />
                {t('Hibernate after inactivity')}
              </label>
              <TextField
                label={t('Minutes of inactivity')}
                type="number"
                min={1}
                max={1440}
                required
                disabled={busy || !inactivity?.enabled}
                value={Number.isFinite(minutes) ? minutes : ''}
                onChange={(event) => changeInactivity(true, event.target.valueAsNumber)}
              />
            </Card>
            <Card>
              <h2>{t('Before hibernating')}</h2>
              <p className="page-note">
                {t(
                  'Hibernation unloads the page and may discard unsaved website drafts. Cookies are kept. Visible services are protected from custom rules. Selecting a hibernated service wakes it only when the wake-on-selection setting is enabled.',
                )}
              </p>
              <p className="page-note">
                {t(
                  'Audio, downloads and device access follow the general protections. Workspace and general rules also apply.',
                )}
              </p>
              {draft.excludedServiceIds.includes(service.id) && (
                <p role="status">
                  {t(
                    'This service is excluded from custom rules in the general hibernation settings.',
                  )}
                </p>
              )}
            </Card>
          </div>
        ) : (
          <div className="settings-grid">
            <Card>
              <h2>{t('Hidden workspaces')}</h2>
              <label className="notification-toggle">
                <input
                  type="checkbox"
                  checked={draft.hiddenWorkspaces}
                  disabled={busy}
                  onChange={(event) => change({ ...draft, hiddenWorkspaces: event.target.checked })}
                />
                {t('Keep hidden workspace services hibernated')}
              </label>
              <p className="page-note">
                {t(
                  'Enabled by default. This rule takes priority over custom rules and their protections. Hidden services stop notifications, calls and downloads. Showing the workspace removes this automatic suspension.',
                )}
              </p>
            </Card>
            <Card>
              <h2>{t('When selecting a service')}</h2>
              <label className="notification-toggle">
                <input
                  type="checkbox"
                  checked={draft.wakeOnSelection}
                  disabled={busy}
                  onChange={(event) => change({ ...draft, wakeOnSelection: event.target.checked })}
                />
                {t('Wake hibernated services when selected')}
              </label>
              <p className="page-note">
                {t(
                  'When disabled, selecting a hibernated service shows its suspended page. Resume it there to load the service.',
                )}
              </p>
            </Card>
            <Card>
              <h2>{t('Before hibernating')}</h2>
              <p className="page-note">
                {t(
                  'Hibernation unloads the page and may discard unsaved website drafts. Cookies are kept. Visible services are protected from custom rules. Selecting a hibernated service wakes it only when the wake-on-selection setting is enabled.',
                )}
              </p>
            </Card>
            <Card>
              <h2>{t('Custom rule protections')}</h2>
              <label className="notification-toggle">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={draft.protectAudio}
                  onChange={(event) => change({ ...draft, protectAudio: event.target.checked })}
                />
                {t('Keep services playing audio awake')}
              </label>
              <label className="notification-toggle">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={draft.protectDownloads}
                  onChange={(event) => change({ ...draft, protectDownloads: event.target.checked })}
                />
                {t('Keep services with active downloads awake')}
              </label>
              <label className="notification-toggle">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={draft.protectDeviceAccess}
                  onChange={(event) =>
                    change({ ...draft, protectDeviceAccess: event.target.checked })
                  }
                />
                {t('Keep services with device access awake')}
              </label>
              <p className="page-note">
                {t(
                  'Device protection covers pending requests and granted camera, microphone or screen access until revoked or the service closes. It is conservative to protect calls.',
                )}
              </p>
            </Card>
            <Card>
              <h2>{t('Excluded from custom rules')}</h2>
              <p className="page-note">
                {t(
                  'Choose services that must stay awake. The hidden workspace rule still applies.',
                )}
              </p>
              <div className="hibernation-exclusions">
                {snapshot.data.apps.map((service) => (
                  <label className="notification-toggle" key={service.id}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={draft.excludedServiceIds.includes(service.id)}
                      onChange={(event) =>
                        change({
                          ...draft,
                          excludedServiceIds: event.target.checked
                            ? [...draft.excludedServiceIds, service.id]
                            : draft.excludedServiceIds.filter((id) => id !== service.id),
                        })
                      }
                    />
                    {service.name}
                  </label>
                ))}
              </div>
            </Card>
          </div>
        )}
        <section className="hibernation-rules" aria-labelledby="custom-rules-title">
          <h2 id="custom-rules-title">{t(service ? 'Advanced rules' : 'Custom rules')}</h2>
          <p className="page-note">
            {t(
              'Combine inactivity, workspace and local time conditions. All requires every condition; Any requires just one. Overnight windows use the starting day. Rules are evaluated in list order.',
            )}
          </p>
          {draft.rules.map(
            (rule, index) =>
              (!service ||
                (rule.scope.kind === 'service' &&
                  rule.scope.id === service.id &&
                  rule.id !== inactivity?.id)) && (
                <HibernationRuleEditor
                  key={rule.id}
                  rule={rule}
                  data={snapshot.data}
                  serviceId={service?.id}
                  disabled={busy}
                  onChange={(rule) =>
                    change({
                      ...draft,
                      rules: draft.rules.map((old, i) => (i === index ? rule : old)),
                    })
                  }
                  onRemove={() =>
                    change({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })
                  }
                />
              ),
          )}
          <Button
            variant="secondary"
            disabled={busy || draft.rules.length >= 20}
            onClick={() =>
              change({
                ...draft,
                rules: [
                  ...draft.rules,
                  {
                    id: crypto.randomUUID(),
                    name: t('New rule'),
                    enabled: true,
                    scope: service ? { kind: 'service', id: service.id } : { kind: 'all' },
                    match: 'all',
                    conditions: [{ kind: 'inactive', minutes: 15 }],
                  },
                ],
              })
            }
          >
            {t('Add automatic rule')}
          </Button>
        </section>
        {error && <p role="alert">{t(error)}</p>}
        <div className="page-actions">
          <Button type="submit" disabled={busy || !dirty} aria-busy={busy}>
            {t('Save changes')}
          </Button>
          <Button variant="secondary" disabled={busy || !dirty} onClick={() => change(saved)}>
            {t('Cancel')}
          </Button>
          <span role="status">
            {t(
              dirty ? 'Hibernation changes are not saved yet.' : 'Hibernation settings are saved.',
            )}
          </span>
        </div>
      </form>
    </div>
  );
}
