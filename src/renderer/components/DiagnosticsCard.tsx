import { useState } from 'react';
import { Button, Card } from './ui';
import { errorMessage, useI18n } from '../preferences/i18n';
export function DiagnosticsCard() {
  const t = useI18n();
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  async function action(exporting: boolean) {
    setBusy(true);
    setStatus('');
    try {
      if (exporting) {
        if (await window.rokko.exportDiagnostics()) setStatus('Diagnostics exported.');
      } else {
        await window.rokko.clearDiagnostics();
        setStatus('Local logs cleared.');
      }
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="full-width">
      <h2>{t('Local diagnostics')}</h2>
      <p className="page-note">
        {t(
          'Local logs cover at most seven days, in three files of 256 KB. Old entries are removed when Rokko starts or diagnostics are used. No URLs, service names, cookies or website contents are logged. Nothing is sent automatically.',
        )}
      </p>
      <div className="page-actions">
        <Button
          variant="secondary"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void action(true)}
        >
          {t('Export diagnostics')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void action(false)}>
          {t('Clear local logs')}
        </Button>
      </div>
      {status && <p role="status">{t(status)}</p>}
    </Card>
  );
}
