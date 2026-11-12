import type { Preferences } from '../../shared/preferences/preferences.mjs';
import { useI18n } from '../preferences/i18n';
import fontLicense from '../../../assets/fonts/ONEST-LICENSE.txt?raw';
import iconLicense from '../../../assets/icons/FONT-AWESOME-LICENSE.txt?raw';
export function ApplicationSettingsPage({ preferences, browserLanguage, busy, onChange, onShortcuts, onImport, onManageServices, onManageWorkspaces }: {
  preferences: Preferences; browserLanguage: string; busy: boolean; onChange: (value: Preferences) => void;
  onShortcuts: () => void; onImport: () => void; onManageServices: () => void; onManageWorkspaces: () => void;
}) {
  const t = useI18n();
  return <div className="settings-page"><div className="page-heading"><div><h1>{t('Settings')}</h1><p>{t('Make Rokko yours.')}</p></div></div><div className="settings-grid">
    <section className="settings-card"><h2>{t('Appearance')}</h2>
      <label htmlFor="theme">{t('Theme')}</label><select id="theme" value={preferences.theme} disabled={busy}
        onChange={e => onChange({ ...preferences, theme: e.target.value as Preferences['theme'] })}>
        <option value="system">{t('Follow system')}</option><option value="light">{t('Light')}</option><option value="dark">{t('Dark')}</option></select>
      <label htmlFor="seed">{t('Seed color')}</label><input type="color" id="seed" value={preferences.seed} disabled={busy}
        onChange={e => onChange({ ...preferences, seed: e.target.value })}/>
      <label htmlFor="dock-position">{t('Dock position')}</label><select id="dock-position" value={preferences.dock} disabled={busy}
        onChange={e => onChange({ ...preferences, dock: e.target.value as Preferences['dock'] })}>
        <option value="left">{t('Left')}</option><option value="right">{t('Right')}</option><option value="top">{t('Top')}</option><option value="bottom">{t('Bottom')}</option></select>
    </section><section className="settings-card"><h2>{t('Language')}</h2>
      <label htmlFor="language">{t('Application and service language')}</label><select id="language" value={preferences.language} disabled={busy}
        onChange={e => onChange({ ...preferences, language: e.target.value as Preferences['language'] })}>
        <option value="it">Italiano</option><option value="en">English</option></select>
      <p className="page-note">{t('Rokko changes language immediately. Services use the browser language at startup; account preferences may take precedence.')}</p>
      {browserLanguage !== preferences.language && <div role="status"><p>{t('Restart Rokko to apply the new browser language to all services. Unsaved drafts may be lost.')}</p>
        <button className="secondary" disabled={busy} onClick={() => void window.rokko.restart()}>{t('Restart Rokko')}</button></div>}
    </section><section className="settings-card"><h2>{t('Tools')}</h2><div className="page-actions"><button className="secondary" onClick={onManageServices}>{t('Configured services')}</button>
      <button className="secondary" onClick={onManageWorkspaces}>{t('All workspaces')}</button>
      <button className="secondary" onClick={onImport}>{t('Import from Rambox')}</button>
      <button className="secondary" onClick={onShortcuts}>{t('Keyboard shortcuts')}</button></div></section>
    <section className="settings-card"><h2>{t('About Rokko')}</h2><p>{t('Local configuration. Accounts stay in Chromium sessions.')}</p>
      <details><summary>{t('Font and icon licenses')}</summary><h3>Onest · SIL OFL 1.1</h3><pre className="license">{fontLicense}</pre>
        <h3>Font Awesome Free 6.7.2</h3><pre className="license">{iconLicense}</pre></details></section>
  </div></div>;
}
