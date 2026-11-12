export function rasterIcon(bytes: Buffer): string;
export function validIcon(value: unknown): string | undefined;
export function fetchFavicon(site: string, fetcher?: typeof fetch): Promise<string | null>;
