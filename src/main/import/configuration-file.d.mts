import type { Configuration } from '../../shared/import/configuration.mjs';
export function readConfiguration(path: string): Promise<Configuration>;
export function writeConfiguration(path: string, value: Configuration): Promise<void>;
