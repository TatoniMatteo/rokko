import type { HibernationPolicy } from '../hibernation/rules.mjs';
import type { AppData, WebApp } from '../contracts/model';
export interface Preferences {
  hibernation:HibernationPolicy;
  version: 1; theme: 'light' | 'dark' | 'system'; seed: string; language: 'it' | 'en';
  split:{secondaryId:string|null;ratio:number}; mutedServices:string[];
  dock: 'left' | 'right' | 'top' | 'bottom'; cardOrder: string[]; hiddenWorkspaces: string[];
}
export function defaultPreferences(language?: string): Preferences;
export function validatePreferences(input: unknown): Preferences;
export function orderedCards(data: AppData, preferences: Preferences): string[];
export function dockApps(data: AppData, preferences: Preferences): WebApp[];
export function moveApp(data: AppData, id: unknown, targetId: unknown, after: unknown): AppData;
export function languageList(language: string): string;
