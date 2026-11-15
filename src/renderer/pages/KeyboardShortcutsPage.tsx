import { useI18n } from '../preferences/i18n';

export function KeyboardShortcutsPage() {
  const t = useI18n();
  return (
    <div className="settings-page configuration-page">
      <div className="page-heading">
        <div>
          <h1>{t('Keyboard shortcuts')}</h1>
          <p>{t('Move between applications without leaving the keyboard.')}</p>
        </div>
      </div>
      <section className="settings-card">
        <dl className="shortcut-list">
          <dt><kbd>Ctrl + K</kbd></dt><dd>{t('Quick switch')}</dd>
          <dt>
            <kbd>{t('Ctrl + Tab')}</kbd>
          </dt>
          <dd>{t('Next application in this workspace')}</dd>
          <dt>
            <kbd>{t('Ctrl + Shift + Tab')}</kbd>
          </dt>
          <dd>{t('Previous application in this workspace')}</dd>
          <dt>
            <kbd>{t('Alt + 1…9')}</kbd>
          </dt>
          <dd>{t('Application at this position in the sidebar')}</dd>
          <dt>
            <kbd>{t('Alt + PageUp / PageDown')}</kbd>
          </dt>
          <dd>{t('Previous / next workspace')}</dd>
          <dt>
            <kbd>{t('Alt + Home')}</kbd>
          </dt>
          <dd>{t('Return to Rokko home')}</dd>
        </dl>
        <p className="page-note">
          {t(
            'Available while using applications, including inside their pages. Navigation shortcuts pause on configuration pages so you can edit safely. Use Tab and Shift + Tab to move through controls, then Enter or Space to activate them.',
          )}
        </p>
      </section>
    </div>
  );
}
