/**
 * UniProt service
 * - fetchUniProtEntry(accession) -> returns parsed UniProtEntry or null
 * - In-memory LRU-style cache (simple size-limited Map)
 * - Uses global fetch (works in browser & Node 18+). Uses `node-fetch` fallback in older Node envs (not included here).
 */

export interface UniProtEntry {
  accession: string;
  name?: string;
  proteinName?: string;
  geneName?: string;
  organism?: string;
  function?: string;
  subcellularLocation?: string[];
  keywords?: string[];
}

const CACHE_LIMIT = 200;
const cache = new Map<string, UniProtEntry | null>();

function cacheSet(key: string, value: UniProtEntry | null) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    // delete oldest
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

export async function fetchUniProtEntry(accession: string, opts: { signal?: AbortSignal } = {}): Promise<UniProtEntry | null> {
  const key = accession.toUpperCase();
  if (cache.has(key)) return cache.get(key) || null;

  // UniProt REST API (new format): https://rest.uniprot.org/uniprotkb/{accession}.json
  const url = `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(key)}.json`;

  try {
    const res = await fetch(url, { method: 'GET', signal: opts.signal });
    if (!res.ok) {
      cacheSet(key, null);
      return null;
    }

    const data = await res.json();

    const entry: UniProtEntry = {
      accession: key,
      name: data?.primaryAccession || data?.accession || key,
      proteinName: data?.proteinDescription?.recommendedName?.fullName?.value,
      geneName: data?.genes?.[0]?.geneName?.value || data?.genes?.[0]?.synonyms?.[0],
      organism: data?.organism?.scientificName,
      function: (data?.comments || []).find((c: any) => c.type === 'FUNCTION')?.texts?.[0]?.value,
      subcellularLocation: (data?.comments || [])
        .filter((c: any) => c.type === 'SUBCELLULAR_LOCATION')
        .flatMap((c: any) => (c?.subcellularLocations || []).map((s: any) => s?.location?.value || '')).filter(Boolean),
      keywords: (data?.keywords || []).map((k: any) => k?.value).filter(Boolean),
    };

    cacheSet(key, entry);
    return entry;
  } catch (e) {
    // network error or abort
    cacheSet(key, null);
    return null;
  }
}

export function clearUniProtCache() {
  cache.clear();
}
