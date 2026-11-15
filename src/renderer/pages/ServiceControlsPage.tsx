import { Button } from '../components/ui';
import { useI18n } from '../preferences/i18n';

interface ServiceControlsPageProps {
  name: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onBrowser: () => void;
  onPermissions: () => void;
  onDownloads: () => void;
  onEdit: () => void;
  onSuspend: () => void;
  suspended?: boolean;
}

export function ServiceControlsPage({
  name,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
  onBrowser,
  onPermissions,
  onDownloads,
  onEdit,
  onSuspend,
  suspended,
}: ServiceControlsPageProps) {
  const t = useI18n();
  return (
    <div className="settings-page configuration-page">
      <h1>{name}</h1>
      <section className="settings-card">
        <div className="page-actions">
          <Button variant="secondary" className="secondary" disabled={!canGoBack} onClick={onBack}>
            {t('Go back')}
          </Button>
          <Button
            variant="secondary"
            className="secondary"
            disabled={!canGoForward}
            onClick={onForward}
          >
            {t('Go forward')}
          </Button>
          <Button variant="secondary" className="secondary" onClick={onReload}>
            {t('Reload')}
          </Button>
          <Button variant="secondary" className="secondary" onClick={onBrowser}>
            {t('Open in browser')}
          </Button>
          <Button variant="secondary" onClick={onPermissions}>
            {t('Service permissions')}
          </Button>
          <Button variant="secondary" onClick={onDownloads}>
            {t('Downloads')}
          </Button>
          <Button variant="secondary" onClick={onSuspend}>
            {t(suspended ? 'Resume service' : 'Suspend service')}
          </Button>
          <Button variant="secondary" className="secondary" onClick={onEdit}>
            {t('Edit application')}
          </Button>
        </div>
        <p className="page-note">
          {t(
            'Suspending stops this service and pauses its notifications until resumed or Rokko is restarted. Cookies are kept; no service is suspended automatically.',
          )}
        </p>
      </section>
    </div>
  );
}
