import { useState } from 'react';
import { TextField } from '../components/ui';
import { useI18n } from '../preferences/i18n';
import {
  serviceCatalog,
  serviceCategories,
  type ServiceTemplate,
} from '../../shared/services/service-catalog.mjs';
import { ServiceIcon } from '../components/ServiceIcon';

export function CatalogPage({ onChoose }: { onChoose: (template?: ServiceTemplate) => void }) {
  const t = useI18n();
  const [query, setQuery] = useState('');
  const services = serviceCatalog.templates.filter((service) =>
    service.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <h1>{t('Add an application')}</h1>
          <p>{t('Choose a service or connect your own website.')}</p>
        </div>
      </div>
      <TextField
        label={t('Search services')}
        id="catalog-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('Find a service…')}
        autoFocus
      />
      {serviceCategories
        .filter((category) => services.some((service) => service.category === category.id))
        .map((category) => (
          <section
            className="catalog-group"
            key={category.id}
            aria-labelledby={'catalog-' + category.id}
          >
            <h2 id={'catalog-' + category.id}>{t(category.name)}</h2>
            <div className="service-grid">
              {services
                .filter((service) => service.category === category.id)
                .map((service) => (
                  <button
                    className="service-card"
                    key={service.id}
                    onClick={() => onChoose(service)}
                  >
                    <ServiceIcon name={service.name} url={service.url} />
                    <strong>{service.name}</strong>
                    <span>{new URL(service.url).hostname}</span>
                  </button>
                ))}
            </div>
          </section>
        ))}
      <section className="catalog-group" aria-labelledby="catalog-custom">
        <h2 id="catalog-custom">{t('Custom services')}</h2>
        <div className="service-grid">
          <button className="service-card custom-service" onClick={() => onChoose()}>
            <span className="service-icon">+</span>
            <strong>{t('Custom service')}</strong>
            <span>{t('Connect any HTTPS website')}</span>
          </button>
        </div>
      </section>
      {!services.length && (
        <p className="page-note">
          {t('No matching service. You can always add a custom website.')}
        </p>
      )}
    </div>
  );
}
