import type { ExternalLinkRequest } from '../../shared/contracts/model';
import { Button } from './ui';
import { useI18n } from '../preferences/i18n';
import { useEffect } from 'react';

export function ExternalLinkDialog({
  request,
  onResolve,
}: {
  request: ExternalLinkRequest;
  onResolve: (action: 'cancel' | 'external' | 'internal') => void;
}) {
  const t = useI18n();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onResolve('cancel');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onResolve]);
  return (
    <div className="dialog-backdrop">
      <section
        className="external-link-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-link-title"
        aria-describedby="external-link-description"
      >
        <h2 id="external-link-title">{t('Open link from {name}?', { name: request.serviceName })}</h2>
        <p id="external-link-description">{t('Choose where to open this link.')}</p>
        <code className="external-link-address">{request.label}</code>
        <div className="page-actions">
          {request.canOpenInApp && (
            <Button autoFocus onClick={() => onResolve('internal')}>
              {t('Open in Rokko')}
            </Button>
          )}
          <Button
            variant={request.canOpenInApp ? 'secondary' : 'primary'}
            onClick={() => onResolve('external')}
          >
            {t('Open in browser')}
          </Button>
          <Button variant="secondary" onClick={() => onResolve('cancel')}>
            {t('Cancel')}
          </Button>
        </div>
      </section>
    </div>
  );
}
