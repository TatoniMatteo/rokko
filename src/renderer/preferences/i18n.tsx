import { createContext, useContext } from 'react';
import italian from './it.json';
import errorAliases from './errors.en.json';
export type Language = 'it' | 'en';
export const LanguageContext = createContext<Language>('it');
export function translate(language: Language, message: string, values: Record<string, string | number> = {}): string {
  const dictionary: Record<string, string> = italian;
  message = (errorAliases as Record<string, string>)[message] ?? message;
  const text = language === 'it' ? dictionary[message] ?? message : message;
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
export function useI18n() { const language = useContext(LanguageContext); return (message: string, values?: Record<string, string | number>) => translate(language, message, values); }
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
