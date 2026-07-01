// Runtime loader for @xenova/transformers
// - In Node: use an indirect dynamic import to avoid bundlers resolving it into browser bundles
// - In Browser: prefer a preloaded UMD on window.transformers, try a local vendor copy at
//   `${import.meta.env.BASE_URL}vendor/transformers.min.js` (recommended), then fallback to CDN

type PipelineFactory = (task: string, model: string, opts?: any) => Promise<any>;

const CDN_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
let loadPromise: Promise<PipelineFactory> | null = null;

async function loadInNode(): Promise<PipelineFactory> {
  const moduleName = '@xenova/transformers';
  let imported: any;
  try {
    imported = await import(/* @vite-ignore */ moduleName);
  } catch (e) {
    imported = await import(moduleName);
  }
  if (!imported || !imported.pipeline) throw new Error('Failed to import @xenova/transformers in Node');
  return imported.pipeline;
}

function tryWindow(): PipelineFactory | null {
  if (typeof window !== 'undefined' && (window as any).transformers && (window as any).transformers.pipeline) {
    return (window as any).transformers.pipeline as PipelineFactory;
  }
  return null;
}

async function importModule(src: string): Promise<any> {
  try {
    const mod = await import(/* @vite-ignore */ src);
    return mod;
  } catch (err) {
    const marker = '__xeno_transformers_temp__';
    if ((window as any)[marker]) delete (window as any)[marker];
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent = `import * as m from ${JSON.stringify(src)}; window.${marker}=m;`;
    document.head.appendChild(s);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out importing module ${src}`)), 15000);
      (function check() {
        if ((window as any)[marker]) { clearTimeout(timeout); resolve(); }
        else setTimeout(check, 50);
      })();
    });
    const m = (window as any)[marker];
    delete (window as any)[marker];
    return m;
  }
}

function getLocalVendorUrl(): string {
  const rawBase = (import.meta as any).env?.BASE_URL || '/';
  let baseUrl = rawBase;
  try {
    const isAbsolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(baseUrl) || baseUrl.startsWith('//');
    if (!isAbsolute) {
      baseUrl = window.location.origin + (baseUrl.startsWith('/') ? baseUrl : '/' + baseUrl);
    }
  } catch (e) {
    baseUrl = window.location.origin + '/';
  }
  return new URL('vendor/transformers.min.js', baseUrl).toString();
}

async function checkIsJavaScriptMime(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) {
      const ct = head.headers.get('content-type') || '';
      if (/javascript|ecmascript|module|text\/javascript|application\/javascript/.test(ct)) return true;
    }
  } catch (_headErr) {
    try {
      const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      const ct = r.headers.get('content-type') || '';
      if (r.ok && /javascript|ecmascript|module|text\/javascript|application\/javascript/.test(ct)) return true;
    } catch (_getErr) {
      return false;
    }
  }
  return false;
}

function injectClassic(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load script ${src}`)));
      return;
    }
    const s = document.createElement('script');
    s.async = true;
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(s);
  });
}

export async function loadTransformersPipeline(): Promise<PipelineFactory> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (typeof window === 'undefined') {
      return await loadInNode();
    }

    let pipeline = tryWindow();
    if (pipeline) return pipeline;

    const localSrc = getLocalVendorUrl();
    try {
      const ok = await checkIsJavaScriptMime(localSrc);
      if (!ok) {
        console.debug(`[transformersLoader] Skipping local vendor ${localSrc} (missing or invalid MIME)`);
      } else {
        const mod = await importModule(localSrc);
        console.debug('[transformersLoader] Imported module from local vendor', Object.keys(mod || {}));
        pipeline = tryWindow() || mod?.pipeline || mod?.default?.pipeline || (mod?.transformers && mod.transformers.pipeline);
        if (pipeline) return pipeline;
      }
    } catch (e) {
      console.debug('[transformersLoader] Local vendor import failed:', e);
    }

    try {
      const ok = await checkIsJavaScriptMime(CDN_URL);
      if (!ok) {
        console.debug('[transformersLoader] Skipping CDN dynamic import due to missing JS MIME on CDN');
      } else {
        const mod = await importModule(CDN_URL);
        console.debug('[transformersLoader] Imported module from CDN', Object.keys(mod || {}));
        pipeline = tryWindow() || mod?.pipeline || mod?.default?.pipeline || (mod?.transformers && mod.transformers.pipeline);
        if (pipeline) return pipeline;
      }
    } catch (e) {
      console.debug('[transformersLoader] CDN dynamic import failed:', e);
      try {
        await injectClassic(CDN_URL);
        pipeline = tryWindow();
        if (pipeline) return pipeline;
      } catch (ee) {
        // final failure
      }
    }

    throw new Error('transformers did not initialize on window after loading module');
  })();

  return loadPromise;
}
