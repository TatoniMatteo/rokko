import type { AppData } from '../contracts/model';
import type { Preferences } from '../preferences/preferences.mjs';
export interface Configuration {
  format: 'rokko-configuration';
  version: 1;
  workspaces: { key: string; name: string }[];
  services: {
    key: string;
    name: string;
    url: string;
    workspaceKey: string | null;
    shared: boolean;
    icon?: string;
  }[];
  appearance?: Pick<Preferences, 'theme' | 'seed' | 'language' | 'dock'>;
}
export interface ConfigurationImportOptions {
  duplicates: 'skip' | 'copy';
  appearance: boolean;
}
export const configurationLimit: number;
export function validateConfiguration(input: unknown): Configuration;
export function exportConfiguration(data: AppData, preferences: Preferences): Configuration;
export function planConfigurationImport(
  data: AppData,
  preferences: Preferences,
  input: unknown,
  options: unknown,
  uuid: () => string,
): { data: AppData; preferences: Preferences; added: number; skipped: number };
