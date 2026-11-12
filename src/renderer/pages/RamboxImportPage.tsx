import { useI18n, errorMessage } from '../preferences/i18n';
import { useState } from 'react';
import type { AppData, AppSnapshot } from '../../shared/contracts/model';
import { parseRamboxMetadata, type ImportService } from '../../shared/import/rambox.mjs';

interface Row extends ImportService { selected: boolean; destination: string }
export function RamboxImportPage({ data, onImported }: { data: AppData; onImported: (value: AppSnapshot) => void }) {
  const t = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [token, setToken] = useState('');
  const [port, setPort] = useState('7822');
  const [destination, setDestination] = useState('');
  const [newName, setNewName] = useState('Rambox');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const selected = rows.filter(row => row.selected);
  const patch = (index: number, value: Partial<Row>) => setRows(current =>
    current.map((row, i) => i === index ? { ...row, ...value } : row));
  function preview(services: ImportService[]) {
    setRows(services.map(service => ({ ...service, selected: true, destination: '' })));
    setDestination(''); setLoaded(true); setImported(null);
  }
  const options = <><option value="">{t("Choose a workspace…")}</option><option value="new">{t("Create a new workspace")}</option><option value="global">{t("Always visible · no workspace")}</option>
    {data.workspaces.map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</>;
  async function apply() {
    setBusy(true); setError('');
    try {
      const result = await window.rokko.importRambox({ services: selected.map(row => ({ name: row.name,
        url: row.url, workspaceId: row.destination === 'new' || row.destination === 'global' ? null : row.destination,
        ...(row.destination === 'global' ? { global: true } : {}) })),
        ...(selected.some(row => row.destination === 'new') ? { newWorkspaceName: newName } : {}) });
      onImported(result); setImported(selected.length); setRows([]); setLoaded(false);
    } catch { setError(t("Import failed. Check names, HTTPS URLs, destinations and the 100-application limit. No partial import was saved.")); }
    finally { setBusy(false); }
  }
  return <div className="settings-page"><div className="page-heading"><div>
    <h1>{t("Import from Rambox")}</h1><p>{t("Bring your applications over. Your accounts stay in Rambox.")}</p></div></div>
    {imported !== null && <section className="settings-card" role="status"><h2>{imported}{t("applications imported")}</h2>
      <p>{t("Open each service when you are ready and sign in. Notifications require a new permission.")}</p>
      <p className="page-note">{t("Nothing was opened automatically. Repeating the import creates additional accounts.")}</p></section>}
    {error && <p className="page-note" role="alert">{error}</p>}
    {!loaded ? <section className="settings-card"><h2>{t("Connect to Rambox")}</h2>
      <p className="page-note">{t("In Rambox, open Settings → Advanced and temporarily enable Model Context Protocol. Paste its temporary token below. Only the service list is read; cookies, passwords and sessions stay in Rambox.")}</p>
      <form className="settings-form" onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError('');
        try { preview(await window.rokko.readRambox(Number(port), token)); }
        catch { setError(t("Could not read services. Check the local port and token in Rambox.")); }
        finally { setToken(''); setBusy(false); }
      }}>
        <label htmlFor="rambox-port">{t("Local port")}</label><input id="rambox-port" type="number" min="1024" max="65535"
          value={port} disabled={busy} onChange={e => setPort(e.target.value)} required/>
        <label htmlFor="rambox-token">{t("Temporary MCP token")}</label><input id="rambox-token" type="password" autoComplete="off"
          value={token} disabled={busy} maxLength={1024} onChange={e => setToken(e.target.value)} required/>
        <button className="primary" disabled={busy}>{busy ? t("Reading…") : t("Read services")}</button>
      </form><p className="page-note">{t("The token is used in memory for this connection and is never saved by Rokko. Disable MCP in Rambox as soon as the preview appears.")}</p>
      <label htmlFor="rambox-file">{t("Or open a saved Rokko service list")}</label><input id="rambox-file" type="file"
        accept="application/json,.json" disabled={busy} onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return;
          setError(''); setBusy(true);
          try {
            if (file.size > 1048576) throw new Error();
            preview(parseRamboxMetadata(JSON.parse(await file.text())));
          } catch { setError(t("Unsupported service list. Choose a Rokko service list smaller than 1 MiB.")); }
          finally { e.target.value = ''; setBusy(false); }
        }}/><p className="page-note">{t("Native Rambox export files are not supported by this reader.")}</p>
    </section> : <><section className="settings-card"><h2>{t("Choose applications and destinations")}</h2>
      <p className="page-note" role="status">{rows.length}{t("services found. Disable MCP in Rambox now. This source provides services without workspace names: choose a destination below.")}</p>
      <label htmlFor="import-destination">{t("Workspace for all services")}</label><select id="import-destination" value={destination}
        disabled={busy} onChange={e => { setDestination(e.target.value);
          setRows(current => current.map(row => ({ ...row, destination: e.target.value }))); }}>{options}</select>
      {rows.some(row => row.destination === 'new') && <><label htmlFor="import-workspace-name">{t("New workspace name")}</label>
        <input id="import-workspace-name" value={newName} maxLength={48} disabled={busy} required onChange={e => setNewName(e.target.value)}/></>}
      <div className="page-actions"><button className="text-button" disabled={busy}
        onClick={() => setRows(current => current.map(row => ({ ...row, selected: true })))}>{t("Select all")}</button>
        <button className="text-button" disabled={busy}
          onClick={() => setRows(current => current.map(row => ({ ...row, selected: false })))}>{t("Select none")}</button></div>
    </section><form className="settings-form" onSubmit={e => { e.preventDefault(); void apply(); }}>
      {rows.map((row, index) => <section className="settings-card" key={row.sourceId}>
        <label className="notification-toggle"><input type="checkbox" checked={row.selected} disabled={busy}
          onChange={e => patch(index, { selected: e.target.checked })}/><span>{t("Import")}{' '}{row.name || t('service')}</span></label>
        <label htmlFor={`import-name-${index}`}>{t("Application name")}</label><input id={`import-name-${index}`} value={row.name}
          required={row.selected} maxLength={48} disabled={busy || !row.selected} onChange={e => patch(index, { name: e.target.value })}/>
        <label htmlFor={`import-url-${index}`}>{t("Website URL (HTTPS)")}</label><input id={`import-url-${index}`} value={row.url}
          required={row.selected} maxLength={2048} disabled={busy || !row.selected} onChange={e => patch(index, { url: e.target.value })}/>
        {data.apps.some(app => app.url === row.url) && <p className="page-note">{t("An account already uses this URL. Importing this service creates a separate account.")}</p>}
        <label htmlFor={`import-workspace-${index}`}>{t("Workspace")}</label><select id={`import-workspace-${index}`} value={row.destination}
          required={row.selected} disabled={busy || !row.selected} onChange={e => patch(index, { destination: e.target.value })}>{options}</select>
      </section>)}
      <div className="page-actions"><button className="primary" disabled={busy || !selected.length || selected.some(row => !row.destination)}>
        {busy ? t("Importing…") : t('Import {count} applications', { count: selected.length })}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => { setRows([]); setLoaded(false); }}>{t("Cancel import")}</button></div>
    </form></>}
  </div>;
}
