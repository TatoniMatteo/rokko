import { useState } from 'react';
import { errorMessage } from '../preferences/i18n';
import { SeedColorPicker } from '../components/SeedColorPicker';
import { Button, Card } from '../components/ui';
import type { Preferences } from '../../shared/preferences/preferences.mjs';
import { useI18n } from '../preferences/i18n';
import fontLicense from '../../../assets/fonts/ONEST-LICENSE.txt?raw';
import iconLicense from '../../../assets/icons/FONT-AWESOME-LICENSE.txt?raw';
export function ApplicationSettingsPage({
  preferences,
  browserLanguage,
  busy,
  onChange,
  onShortcuts,
  onImport,
  onManageServices,
  onManageWorkspaces,
}: {
  preferences: Preferences;
  browserLanguage: string;
  busy: boolean;
  onChange: (value: Preferences) => void;
  onShortcuts: () => void;
  onImport: () => void;
  onManageServices: () => void;
  onManageWorkspaces: () => void;
}) {
  const t = useI18n();
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  async function exportProfile() {
    setExporting(true);
    setExportStatus('');
    try {
      if (await window.rokko.exportProfile())
        setExportStatus('Configuration exported to the chosen folder. Keep these files private.');
    } catch (error) {
      setExportStatus(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="settings-page configuration-page">
      <div className="page-heading">
        <div>
          <h1>{t('Settings')}</h1>
          <p>{t('Make Rokko yours.')}</p>
        </div>
      </div>
      <div className="settings-grid preference-grid">
        <div>
          <label htmlFor="theme">{t('Theme')}</label>
          <select
            id="theme"
            value={preferences.theme}
            disabled={busy}
            onChange={(e) =>
              onChange({ ...preferences, theme: e.target.value as Preferences['theme'] })
            }
          >
            <option value="system">{t('Follow system')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </div>
        <SeedColorPicker
          value={preferences.seed}
          disabled={busy}
          onChange={(seed) => onChange({ ...preferences, seed })}
        />
        <div>
          <label htmlFor="dock-position">{t('Dock position')}</label>
          <select
            id="dock-position"
            value={preferences.dock}
            disabled={busy}
            onChange={(e) =>
              onChange({ ...preferences, dock: e.target.value as Preferences['dock'] })
            }
          >
            <option value="left">{t('Left')}</option>
            <option value="right">{t('Right')}</option>
            <option value="top">{t('Top')}</option>
            <option value="bottom">{t('Bottom')}</option>
          </select>
        </div>
        <div>
          <label htmlFor="language">{t('Application and service language')}</label>
          <select
            id="language"
            value={preferences.language}
            disabled={busy}
            onChange={(e) =>
              onChange({ ...preferences, language: e.target.value as Preferences['language'] })
            }
          >
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </select>
        </div>
        {browserLanguage !== preferences.language && (
          <Card className="full-width" role="status">
            <h2>{t('Restart required')}</h2>
            <p className="page-note">
              {t(
                'Restart Rokko to apply the new browser language to all services. Unsaved drafts may be lost.',
              )}
            </p>
            <Button variant="secondary" disabled={busy} onClick={() => void window.rokko.restart()}>
              {t('Restart Rokko')}
            </Button>
          </Card>
        )}
        <div className="settings-tools">
          {[
            [t('Configured services'), onManageServices],
            [t('All workspaces'), onManageWorkspaces],
            [t('Import from Rambox'), onImport],
          ].map(([label, action]) => (
            <button
              type="button"
              key={label as string}
              className="ui-card settings-tool"
              onClick={action as () => void}
            >
              <strong>{label as string}</strong>
              <span>{t('Open page')}</span>
            </button>
          ))}
        </div>
        <div className="full-width page-actions">
          <Button variant="secondary" onClick={onShortcuts}>
            {t('Keyboard shortcuts')}
          </Button>
        </div>
        <Card className="full-width">
          <h2>{t('Configuration backup')}</h2>
          <p className="page-note">
            {t(
              'Export your current services, workspaces and preferences before a downgrade. Cookies and account credentials are not included.',
            )}
          </p>
          <Button
            variant="secondary"
            disabled={busy || exporting}
            aria-busy={exporting}
            onClick={() => void exportProfile()}
          >
            {t('Export configuration')}
          </Button>
          {exportStatus && <p role="status">{t(exportStatus)}</p>}
        </Card>
        <Card className="full-width">
          <h2>{t('About Rokko')}</h2>
          <p className="page-note">
            {t('Local configuration. Accounts stay in Chromium sessions.')}
          </p>
          <p className="page-note">
            {t(
              'Rokko changes language immediately. Services use the browser language at startup; account preferences may take precedence.',
            )}
          </p>
          <details>
            <summary>{t('Font and icon licenses')}</summary>
            <h3>Onest · SIL OFL 1.1</h3>
            <pre className="license">{fontLicense}</pre>
            <h3>Font Awesome Free 6.7.2</h3>
            <pre className="license">{iconLicense}</pre>
          </details>
        </Card>
      </div>
    </div>
  );
}
