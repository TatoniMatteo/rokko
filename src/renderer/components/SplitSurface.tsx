import { useRef, useState } from 'react';
import type { AppSnapshot, WebApp } from '../../shared/contracts/model';
import { Button } from './ui';
import { useI18n } from '../preferences/i18n';
export function SplitToolbar({
  primary,
  secondary,
  onClose,
}: {
  primary: WebApp;
  secondary: WebApp;
  onClose: () => void;
}) {
  const t = useI18n();
  return (
    <div className="split-toolbar">
      <strong>{primary.name}</strong>
      <span>{secondary.name}</span>
      <button className="text-button" onClick={onClose}>
        {t('Close split view')}
      </button>
    </div>
  );
}
export function SplitSurface({
  snapshot,
  primary,
  secondary,
  onUpdate,
  onError,
}: {
  snapshot: AppSnapshot;
  primary: WebApp;
  secondary: WebApp;
  onUpdate: (snapshot: AppSnapshot) => void;
  onError: (error: unknown) => void;
}) {
  const t = useI18n();
  const saved = snapshot.preferences!.split.ratio;
  const [draft, setDraft] = useState<number | null>(null);
  const ratio = draft ?? saved;
  const ratioRef = useRef(ratio),
    dragging = useRef(false),
    surface = useRef<HTMLDivElement>(null);
  function preview(value: number) {
    ratioRef.current = Math.max(0.25, Math.min(0.75, value));
    setDraft(ratioRef.current);
    window.rokko.previewSplitRatio(ratioRef.current);
  }
  async function commit() {
    try {
      onUpdate(await window.rokko.setSplit(secondary.id, ratioRef.current));
    } catch (error) {
      onError(error);
      window.rokko.previewSplitRatio(saved);
    } finally {
      setDraft(null);
    }
  }
  return (
    <div
      className="split-surface"
      ref={surface}
      style={{ gridTemplateColumns: `minmax(0,${ratio}fr) 8px minmax(0,${1 - ratio}fr)` }}
    >
      {[primary, secondary].map((service, index) => {
        const state = snapshot.appStates?.[service.id],
          suspended = snapshot.suspendedIds?.includes(service.id);
        return (
          <div
            className="split-pane"
            id={'split-pane-' + index}
            key={service.id}
            style={{ gridColumn: index === 0 ? 1 : 3 }}
          >
            {(suspended || state?.status === 'failed') && (
              <section className="split-placeholder" role="status">
                <h2>{service.name}</h2>
                <p>{t(suspended ? 'Service suspended' : 'This service could not be loaded.')}</p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void (
                      suspended
                        ? window.rokko.resumeService(service.id)
                        : window.rokko.controlService(service.id, 'reload')
                    )
                      .then(onUpdate)
                      .catch(onError)
                  }
                >
                  {t(suspended ? 'Resume service' : 'Retry')}
                </Button>
              </section>
            )}
          </div>
        );
      })}
      <div
        className="split-divider"
        role="separator"
        tabIndex={0}
        aria-label={t('Resize split view')}
        aria-orientation="vertical"
        aria-valuemin={25}
        aria-valuemax={75}
        aria-valuenow={Math.round(ratio * 100)}
        aria-controls="split-pane-0 split-pane-1"
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            preview(
              event.key === 'Home'
                ? 0.25
                : event.key === 'End'
                  ? 0.75
                  : ratio + (event.key === 'ArrowLeft' ? -0.05 : 0.05),
            );
            void commit();
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
        }}
        onPointerMove={(event) => {
          if (dragging.current) {
            const rect = surface.current!.getBoundingClientRect();
            preview((event.clientX - rect.left) / (rect.width - 8));
          }
        }}
        onPointerUp={(event) => {
          if (dragging.current) {
            dragging.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
            void commit();
          }
        }}
        onPointerCancel={() => {
          dragging.current = false;
          preview(saved);
          setDraft(null);
        }}
      />
    </div>
  );
}
