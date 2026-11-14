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
  onEdit: () => void;
}

export function ServiceControlsPage({
  name,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
  onBrowser,
  onEdit,
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
          <Button variant="secondary" className="secondary" onClick={onEdit}>
            {t('Edit application')}
          </Button>
        </div>
      </section>
    </div>
  );
}
