import { Button } from '../components/ui';
import { useI18n } from '../preferences/i18n';

interface ServiceErrorPageProps {
  failure: { title: string; message: string };
  onRetry: () => void;
  onBrowser: () => void;
  onEdit: () => void;
}

export function ServiceErrorPage({ failure, onRetry, onBrowser, onEdit }: ServiceErrorPageProps) {
  const t = useI18n();
  return (
    <div className="service-error" role="alert">
      <h1>{t(failure.title)}</h1>
      <p>{t(failure.message)}</p>
      <div className="page-actions">
        <Button className="primary" onClick={onRetry}>
          {t('Try again')}
        </Button>
        <Button variant="secondary" className="secondary" onClick={onBrowser}>
          {t('Open in browser')}
        </Button>
        <Button variant="secondary" className="secondary" onClick={onEdit}>
          {t('Edit application')}
        </Button>
      </div>
    </div>
  );
}
