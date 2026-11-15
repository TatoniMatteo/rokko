import { Button } from '../components/ui';
import { useI18n } from '../preferences/i18n';
export function SuspendedServicePage({ onResume, busy }: { onResume: () => void; busy: boolean }) {
  const t = useI18n();
  return (
    <div className="settings-page configuration-page">
      <h1>{t('Service suspended')}</h1>
      <section className="settings-card">
        <p>
          {t(
            'This service is stopped. Its notifications are paused; login data stays on this device. Shared workspace workers may still be used by other services. Restarting Rokko clears manual suspensions.',
          )}
        </p>
        <Button onClick={onResume} disabled={busy} aria-busy={busy}>
          {t('Resume service')}
        </Button>
      </section>
    </div>
  );
}
