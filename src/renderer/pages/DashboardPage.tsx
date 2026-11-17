import { Button, Card } from '../components/ui';
import type { AppData } from '../../shared/contracts/model';
import { orderedCards, type Preferences } from '../../shared/preferences/preferences.mjs';
import { Icon } from '../components/Icon';
import { ServiceIcon } from '../components/ServiceIcon';
import { WorkspaceMark } from '../components/Dock';
import { useI18n } from '../preferences/i18n';
export function DashboardPage({ data, preferences, onNewWorkspace, onCatalog, onImport, onOrganize }: {
  data: AppData; preferences: Preferences; onNewWorkspace: () => void; onCatalog: () => void;
  onOrganize: (workspaceId?: string) => void; onImport: () => void;
}) {
  const t = useI18n();
  const cards = orderedCards(data, preferences);
  const cardName = (id: string) => data.workspaces.find(w => w.id === id)?.name ?? t('Always visible');
  return <div className="settings-page dashboard welcome"><div className="page-heading"><div className="dashboard-heading-copy">
    <h1>{t('Your space, your way.')}</h1><p>{t('All your services. Just the workspaces you need.')}</p></div></div>
    <div className="page-actions dashboard-actions"><Button className="primary" onClick={onCatalog}><Icon name="plus"/>{t('Add application')}</Button>
      <Button variant="secondary" className="secondary" onClick={onNewWorkspace}>{t('New workspace')}</Button>
      <Button variant="secondary" className="secondary" onClick={() => onOrganize()}>{t('Organize')}</Button></div>
    {!data.apps.length && <Card className="empty-state"><h2>{t('Where would you like to start?')}</h2>
      <p>{t('Choose a service, add your own website, or import your services from Rambox.')}</p>
      <p className="page-note">{t('Group services in workspaces, or keep them always visible. You can change this later.')}</p>
      <p className="page-note">{t('No Rokko account is needed. You sign in directly on each website; login data stays on this device. Notifications are optional and keep enabled services running in the background.')}</p>
      <div className="page-actions"><Button onClick={onCatalog}>{t('Choose a service')}</Button>
        <Button variant="secondary" onClick={onImport}>{t('Import from Rambox')}</Button></div></Card>}
    <div className="workspace-overview">{cards.map(id => {
      const workspace = data.workspaces.find(w => w.id === id);
      const services = data.apps.filter(a => a.workspaceId === (id === 'global' ? null : id));
      return <Card key={id} className="workspace-summary"><header>
        <WorkspaceMark name={workspace?.name ?? null}/><h2>{cardName(id)}</h2></header>
        <p className="page-note">{id === 'global' ? t('Available in every workspace') : t(services.length === 1 ? '{count} service' : '{count} services', { count: services.length })}
          {workspace && preferences.hiddenWorkspaces.includes(id) && <> · {t('Hidden from dock')}</>}</p>
        <div className="summary-services">{services.slice(0, 3).map(service => <span className="summary-service" key={service.id}>
          <ServiceIcon name={service.name} url={service.url} icon={service.icon}/><span>{service.name}</span></span>)}
          {!services.length && <span className="page-note">{t('No applications yet.')}</span>}</div>
        <Button variant="secondary" onClick={() => onOrganize(id)}>{t('Manage services')}</Button>
      </Card>;
    })}</div>
  </div>;
}
