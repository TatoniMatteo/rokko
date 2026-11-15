import { useEffect, useRef, useState } from 'react';
import type { AppData, WebApp, Workspace } from '../../shared/contracts/model';
import { TextField, Button } from '../components/ui';
import { ServiceIcon } from '../components/ServiceIcon';
import { useI18n } from '../preferences/i18n';

export function QuickSwitchPage({
  data,
  onService,
  onWorkspace,
  onCommand,
  onClose,
}: {
  data: AppData;
  onService: (service: WebApp) => void;
  onWorkspace: (workspace: Workspace) => void;
  onCommand: (command: 'dashboard' | 'settings' | 'catalog' | 'downloads') => void;
  onClose: () => void;
}) {
  const t = useI18n();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const entries = [
    ...data.apps.map((service) => ({
      key: 'service-' + service.id,
      name: service.name,
      detail:
        data.workspaces.find((w) => w.id === service.workspaceId)?.name ?? t('Always visible'),
      icon: <ServiceIcon name={service.name} url={service.url} icon={service.icon} />,
      run: () => onService(service),
    })),
    ...data.workspaces.map((workspace) => ({
      key: 'workspace-' + workspace.id,
      name: workspace.name,
      detail: t('Workspace'),
      icon: null,
      run: () => onWorkspace(workspace),
    })),
    ...(['dashboard', 'settings', 'catalog', 'downloads'] as const).map((command) => ({
      key: command,
      name: t(
        {
          dashboard: 'Home',
          settings: 'Settings',
          catalog: 'Add an application',
          downloads: 'Downloads',
        }[command],
      ),
      detail: t('Command'),
      icon: null,
      run: () => onCommand(command),
    })),
  ].filter((entry) =>
    (entry.name + ' ' + entry.detail)
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const index = Math.min(selected, Math.max(0, entries.length - 1));
  useEffect(() => {
    list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }, [index, query]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  return (
    <div className="settings-page configuration-page quick-switch">
      <div className="page-heading">
        <div>
          <h1>{t('Quick switch')}</h1>
          <p>
            {t(
              'Search your applications, workspaces and Rokko commands. Website contents stay private.',
            )}
          </p>
        </div>
        <Button variant="secondary" onClick={onClose}>
          {t('Close search')}
        </Button>
      </div>
      <TextField
        id="quick-search"
        label={t('Search')}
        value={query}
        autoFocus
        role="combobox"
        aria-expanded={true}
        aria-controls="quick-results"
        aria-autocomplete="list"
        aria-activedescendant={entries.length ? 'quick-' + index : undefined}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected(
              (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) %
                (entries.length || 1),
            );
          } else if (event.key === 'Enter' && entries[index]) {
            event.preventDefault();
            entries[index].run();
          }
        }}
      />
      <div
        id="quick-results"
        role="listbox"
        aria-label={t('Search results')}
        className="quick-results"
        ref={list}
      >
        {entries.map((entry, n) => (
          <button
            type="button"
            role="option"
            id={'quick-' + n}
            key={entry.key}
            aria-selected={index === n}
            onClick={entry.run}
            onFocus={() => setSelected(n)}
            className="quick-result"
          >
            {entry.icon}
            <span>
              <strong>{entry.name}</strong>
              <small>{entry.detail}</small>
            </span>
          </button>
        ))}
      </div>
      {!entries.length && <p role="status">{t('No results')}</p>}
    </div>
  );
}
