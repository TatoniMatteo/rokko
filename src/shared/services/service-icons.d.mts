export function rasterIcon(bytes: Buffer): string;
export function validIcon(value: unknown): string | undefined;
export function fetchFavicon(site: string, fetcher?: typeof fetch, hints?: string[]): Promise<string | null>;
export function faviconIcon(bytes: Buffer): string;
export function faviconLinks(html: string, pageUrl: string, origin?: string): string[];
