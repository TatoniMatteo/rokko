export interface ServiceTemplate {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly icon: string;
}
export interface ServiceCatalog {
  readonly version: 1;
  readonly templates: readonly ServiceTemplate[];
}
export function validateServiceCatalog(value: unknown): ServiceCatalog;
export const serviceCatalog: ServiceCatalog;
