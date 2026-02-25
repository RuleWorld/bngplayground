const BIOMODELS_DOWNLOAD_BASE = 'https://www.ebi.ac.uk/biomodels/model/download';
const ZIP_MAGIC_0 = 0x50;
const ZIP_MAGIC_1 = 0x4b;
const ZIP_MAGIC_2 = 0x03;
const ZIP_MAGIC_3 = 0x04;
const FETCH_TIMEOUT_MS = Number(
  (typeof process !== 'undefined' &&
    (process.env?.BIOMODELS_FETCH_TIMEOUT_MS ||
      process.env?.BIOMODELS_ROUNDTRIP_FETCH_TIMEOUT_MS)) ||
    '20000'
);
const BODY_READ_TIMEOUT_MS = Number(
  (typeof process !== 'undefined' &&
    (process.env?.BIOMODELS_BODY_READ_TIMEOUT_MS ||
      process.env?.BIOMODELS_ROUNDTRIP_BODY_READ_TIMEOUT_MS ||
      process.env?.BIOMODELS_ROUNDTRIP_FETCH_TIMEOUT_MS)) ||
    '15000'
);

const SBML_TAG_RE = /<\s*sbml(?:\s|>)/i;
const HTML_TAG_RE = /<!doctype\s+html|<\s*html(?:\s|>)/i;
const BINARY_ENTRY_EXT_RE = /\.(mp4|mov|avi|mkv|png|jpe?g|gif|webp|bmp|pdf|zip|gz|tgz|tar|7z|bin|exe|dll|so|dylib|wav|mp3|ogg)$/i;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface BioModelsSbmlResult {
  normalizedId: string;
  sbmlText: string;
  sourceUrl: string;
  sourceEntry?: string;
}

const stripBom = (text: string): string => text.replace(/^\uFEFF/, '');

const looksLikeZipText = (text: string): boolean => {
  const sample = stripBom(text);
  if (sample.length < 2) return false;
  return sample.charCodeAt(0) === ZIP_MAGIC_0 && sample.charCodeAt(1) === ZIP_MAGIC_1;
};

const isLikelySbml = (text: string): boolean => {
  const sample = stripBom(text).slice(0, 8192);
  if (!sample) return false;
  if (looksLikeZipText(sample)) return false;
  const trimmed = sample.trimStart();
  if (!trimmed.startsWith('<')) return false;
  return SBML_TAG_RE.test(trimmed);
};

const isLikelyHtml = (text: string): boolean => HTML_TAG_RE.test(stripBom(text).slice(0, 4096));

const debugEnabled =
  typeof process !== 'undefined' &&
  !!process.env &&
  process.env.BIOMODELS_IMPORT_DEBUG === '1';

const debugLog = (...args: unknown[]): void => {
  if (!debugEnabled) return;
  console.log('[bioModelsImport]', ...args);
};

const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try {
          onTimeout?.();
        } catch {
          // ignore timeout hook failures
        }
        reject(new Error(`${label} timed out after ${ms} ms`));
      }, ms);
      if (timer && typeof (timer as any).unref === 'function') {
        (timer as any).unref();
      }
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const looksLikeZip = (bytes: Uint8Array): boolean => {
  if (bytes.byteLength < 4) return false;
  const head = bytes.subarray(0, 4);
  return (
    head[0] === ZIP_MAGIC_0 &&
    head[1] === ZIP_MAGIC_1 &&
    head[2] === ZIP_MAGIC_2 &&
    head[3] === ZIP_MAGIC_3
  );
};

const normalizeZipPath = (entryPath: string): string => {
  try {
    const decoded = decodeURIComponent(entryPath);
    return decoded.replace(/^\.?\//, '').replace(/^\/+/, '');
  } catch {
    return entryPath.replace(/^\.?\//, '').replace(/^\/+/, '');
  }
};

const parseManifestSbmlEntries = (manifestXml: string): string[] => {
  const entries: string[] = [];
  const contentTagRe = /<\s*content\b([^>]*)>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = contentTagRe.exec(manifestXml)) !== null) {
    const attrs = match[1] ?? '';
    const locationMatch = attrs.match(/\blocation\s*=\s*["']([^"']+)["']/i);
    const formatMatch = attrs.match(/\bformat\s*=\s*["']([^"']+)["']/i);
    if (!locationMatch || !formatMatch) continue;
    if (!/sbml/i.test(formatMatch[1])) continue;
    entries.push(normalizeZipPath(locationMatch[1]));
  }
  return entries;
};

const scoreEntryName = (name: string): number => {
  const lower = name.toLowerCase();
  let score = 0;
  if (lower.endsWith('.sbml')) score += 6;
  if (lower.endsWith('.xml')) score += 3;
  if (lower.includes('model')) score += 2;
  if (lower.includes('manifest')) score -= 10;
  if (lower.includes('metadata')) score -= 7;
  if (lower.endsWith('.rdf')) score -= 7;
  if (lower.includes('sedml') || lower.endsWith('.sedx')) score -= 6;
  return score;
};

const extractSbmlFromOmex = async (bytes: Uint8Array): Promise<{ sbmlText: string; sourceEntry: string }> => {
  const jsZipModule = await import('jszip');
  const JSZip = jsZipModule.default || jsZipModule;
  const archiveBytes =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes
      : bytes.slice();
  const zip = await withTimeout(
    JSZip.loadAsync(archiveBytes),
    BODY_READ_TIMEOUT_MS,
    'OMEX zip load'
  );
  const allEntries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);

  const prioritized = new Set<string>();
  const manifestFile = zip.file('manifest.xml');
  if (manifestFile) {
    try {
      const manifestXml = await manifestFile.async('string');
      const manifestCandidates = parseManifestSbmlEntries(manifestXml);
      for (const candidate of manifestCandidates) {
        if (zip.file(candidate)) {
          prioritized.add(candidate);
        }
      }
    } catch {
      // Ignore malformed manifest and continue with content heuristics.
    }
  }

  allEntries
    .filter((name) => /\.(xml|sbml)$/i.test(name))
    .sort((a, b) => scoreEntryName(b) - scoreEntryName(a))
    .forEach((name) => prioritized.add(name));

  const probeEntry = async (entryName: string): Promise<{ sbmlText: string; sourceEntry: string } | null> => {
    const file = zip.file(entryName);
    if (!file) return null;
    const text = await withTimeout(file.async('string'), BODY_READ_TIMEOUT_MS, `OMEX entry read ${entryName}`);
    if (isLikelySbml(text)) {
      return { sbmlText: text, sourceEntry: entryName };
    }
    return null;
  };

  for (const entryName of prioritized) {
    const found = await probeEntry(entryName);
    if (found) return found;
  }

  // Fallback: probe additional text-like entries even when extension isn't xml/sbml.
  const fallbackCandidates = allEntries
    .filter((name) => !prioritized.has(name))
    .filter((name) => !BINARY_ENTRY_EXT_RE.test(name))
    .sort((a, b) => scoreEntryName(b) - scoreEntryName(a));

  for (const entryName of fallbackCandidates) {
    const found = await probeEntry(entryName);
    if (found) return found;
  }

  const sample = allEntries.slice(0, 8).join(', ');
  throw new Error(`OMEX archive did not contain a valid SBML XML document. entries=${allEntries.length} sample=[${sample}]`);
};

const fetchAttempt = async (
  fetchImpl: FetchLike,
  normalizedId: string,
  url: string
): Promise<BioModelsSbmlResult> => {
  const requestInitBase: RequestInit = {
    headers: {
      Accept: 'application/xml,text/xml,application/octet-stream,*/*',
    },
    redirect: 'follow',
  };
  const doFetch = (ctrl: AbortController | null): Promise<Response> =>
    fetchImpl(url, {
      ...requestInitBase,
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const response = await withTimeout(
    doFetch(controller),
    FETCH_TIMEOUT_MS,
    `HTTP fetch ${normalizedId}`,
    () => controller?.abort()
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const resolvedUrl = response.url || url;
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const contentDisposition = (response.headers.get('content-disposition') || '').toLowerCase();
  const lowerResolvedUrl = resolvedUrl.toLowerCase();
  const archiveHint =
    /zip|octet-stream|omex/.test(contentType) ||
    /\.omex\b|\.zip\b/.test(contentDisposition) ||
    /\.omex(?:$|[?#])|\.zip(?:$|[?#])/.test(lowerResolvedUrl);

  debugLog(
    `fetched ${normalizedId}`,
    `status=${response.status}`,
    `url=${resolvedUrl}`,
    `content-type=${contentType || 'n/a'}`,
    `archiveHint=${archiveHint}`
  );

  if (!archiveHint) {
    const text = await withTimeout(
      response.text(),
      BODY_READ_TIMEOUT_MS,
      `BioModels response body read (text) ${normalizedId}`,
      () => controller?.abort()
    );
    debugLog('text read ok', `chars=${text.length}`);

    if (isLikelySbml(text)) {
      debugLog('payload identified as SBML text');
      return {
        normalizedId,
        sbmlText: text,
        sourceUrl: resolvedUrl,
      };
    }

    if (isLikelyHtml(text)) {
      throw new Error('Received HTML instead of SBML.');
    }

    throw new Error('Response did not contain SBML content.');
  }

  const binaryController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const binaryResponse = response.bodyUsed
    ? await withTimeout(
        doFetch(binaryController),
        FETCH_TIMEOUT_MS,
        `HTTP refetch ${normalizedId} (binary)`,
        () => binaryController?.abort()
      )
    : response;

  if (!binaryResponse.ok) {
    throw new Error(`HTTP ${binaryResponse.status} during binary body fetch`);
  }

  const raw = await withTimeout(
    binaryResponse.arrayBuffer(),
    BODY_READ_TIMEOUT_MS,
    `BioModels response body read (arrayBuffer) ${normalizedId}`,
    () => {
      binaryController?.abort();
      controller?.abort();
    }
  );
  const bytes = new Uint8Array(raw);
  debugLog('arrayBuffer read ok', `bytes=${bytes.byteLength}`);

  if (looksLikeZip(bytes)) {
    debugLog('payload looks like ZIP/OMEX');
    const { sbmlText, sourceEntry } = await extractSbmlFromOmex(bytes);
    return {
      normalizedId,
      sbmlText,
      sourceUrl: resolvedUrl,
      sourceEntry,
    };
  }

  const text = new TextDecoder('utf-8').decode(bytes);
  if (isLikelySbml(text)) {
    debugLog('payload identified as SBML text');
    return {
      normalizedId,
      sbmlText: text,
      sourceUrl: resolvedUrl,
    };
  }

  if (isLikelyHtml(text)) {
    throw new Error('Received HTML instead of SBML.');
  }

  throw new Error('Response did not contain SBML content.');
};

export const normalizeBioModelsId = (id: string): string => {
  const trimmed = id.trim().toUpperCase();
  if (/^\d{1,10}$/.test(trimmed)) {
    return `BIOMD${trimmed.padStart(10, '0')}`;
  }
  if (/^BIOMD\d{10}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^MODEL\d{10}$/.test(trimmed)) {
    return trimmed;
  }
  throw new Error('Enter a valid BioModels ID (e.g., BIOMD0000000001).');
};

export const fetchBioModelsSbml = async (
  id: string,
  fetchImpl: FetchLike = fetch
): Promise<BioModelsSbmlResult> => {
  const normalizedId = normalizeBioModelsId(id);
  const encodedId = encodeURIComponent(normalizedId);
  const attempts = [
    `${BIOMODELS_DOWNLOAD_BASE}/${encodedId}?filename=${encodedId}_url.xml`,
    `${BIOMODELS_DOWNLOAD_BASE}/${encodedId}`,
  ];

  let lastError: unknown = null;
  for (const url of attempts) {
    try {
      return await withTimeout(
        fetchAttempt(fetchImpl, normalizedId, url),
        FETCH_TIMEOUT_MS,
        `Fetch attempt for ${normalizedId}`
      );
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'Unknown error');
  throw new Error(`Failed to fetch SBML for ${normalizedId}. ${detail}`);
};
