import localforage from 'localforage';
import LZString from 'lz-string';

export type TBotsManifestItem = {
    name: string;
    file: string; // xml filename in /public/xml
    description?: string;
    difficulty?: string;
    strategy?: string;
    features?: string[];
    youtube_url?: string;
};

const XML_CACHE_PREFIX = 'freebots:xml:';

// In-memory cache for faster access
const memoryCache = new Map<string, string>();

// Domain-aware XML base path: defaults to /xml/
const XML_BASE = '/xml/';
export const getXmlBase = () => XML_BASE;

const decompress = (data: string | null) => (data ? LZString.decompressFromUTF16(data) : null);
const compress = (data: string) => LZString.compressToUTF16(data);

export const getCachedXml = async (file: string): Promise<string | null> => {
    try {
        const key = `${XML_CACHE_PREFIX}${file}`;
        const cached = (await localforage.getItem<string>(key)) || null;
        return decompress(cached);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('freebots-cache:getCachedXml error', e);
        return null;
    }
};

export const setCachedXml = async (file: string, xml: string) => {
    try {
        const key = `${XML_CACHE_PREFIX}${file}`;
        await localforage.setItem(key, compress(xml));
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('freebots-cache:setCachedXml error', e);
    }
};

export const fetchXmlWithCache = async (file: string): Promise<string | null> => {
    // Check memory cache first
    if (memoryCache.has(file)) {
        return memoryCache.get(file)!;
    }

    // Check persistent cache
    const cached = await getCachedXml(file);
    if (cached) {
        memoryCache.set(file, cached); // Store in memory for faster access
        return cached;
    }

    try {
        // Always use default /xml/
        const url = `/xml/${encodeURIComponent(file)}`;
        const res = await fetch(url);

        if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.status}`);
        const xml = await res.text();

        // Store in both caches
        memoryCache.set(file, xml);
        await setCachedXml(file, xml);
        return xml;
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('freebots-cache:fetchXmlWithCache error', e);
        return null;
    }
};

export const prefetchAllXmlInBackground = async (files: string[]) => {
    // Fire-and-forget prefetch with throttling to avoid overwhelming the browser
    const batchSize = 3; // Load 3 files at a time
    for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(file => fetchXmlWithCache(file)));
        // Small delay between batches to prevent blocking
        if (i + batchSize < files.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
};

export const getBotsManifest = async (): Promise<TBotsManifestItem[] | null> => {
    try {
        // Fallback to generic manifest
        const res = await fetch('/xml/bots.json', { cache: 'no-cache' });

        if (!res.ok) return null;

        const data = (await res.json()) as TBotsManifestItem[];
        return data;
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('freebots-cache:getBotsManifest error', e);
        return null;
    }
};
