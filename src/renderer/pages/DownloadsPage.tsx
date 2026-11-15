import { useEffect, useState } from 'react';
import type { DownloadInfo, WebApp } from '../../shared/contracts/model';
import { Button, Card } from '../components/ui';
import { errorMessage, useI18n } from '../preferences/i18n';
export function DownloadsPage({ services }: { services: WebApp[] }) {
  const t = useI18n();
  const [items, setItems] = useState<DownloadInfo[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const stop = window.rokko.onDownloads((value) => {
      if (alive) setItems(value);
    });
    void window.rokko
      .getDownloads()
      .then((value) => {
        if (alive) setItems(value);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return (
    <div className="settings-page configuration-page">
      <h1>{t('Downloads')}</h1>
      <p className="page-note">
        {t(
          'Choose a destination in the native save dialog. Existing files require confirmation. Suspending or removing a service cancels its active downloads. History lasts until Rokko closes.',
        )}
      </p>
      {error && <p role="alert">{t(error)}</p>}
      {!items.length && (
        <Card>
          <p>{t('No downloads in this session.')}</p>
        </Card>
      )}
      {items.map((item) => (
        <Card key={item.id} className="download-card">
          <h2>{item.filename}</h2>
          <p>
            {services.find((service) => service.id === item.serviceId)?.name ??
              t('Removed service')}
          </p>
          <p role="status">
            {t(
              item.state === 'progressing'
                ? 'Downloading'
                : item.state === 'completed'
                  ? 'Download completed'
                  : item.state === 'cancelled'
                    ? 'Download cancelled'
                    : 'Download interrupted',
            )}
          </p>
          <progress
            max={item.total || undefined}
            value={item.total ? item.received : undefined}
            aria-label={t('Download progress')}
          />
          <p>
            {t(item.total ? '{received} KB of {total} KB' : '{received} KB', {
              received: Math.ceil(item.received / 1024),
              total: Math.ceil(item.total / 1024),
            })}
          </p>
          {item.canCancel && (
            <Button
              variant="secondary"
              onClick={() =>
                void window.rokko.cancelDownload(item.id).catch((e) => setError(errorMessage(e)))
              }
            >
              {t('Cancel download')}
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}
