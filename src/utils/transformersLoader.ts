// Runtime loader for @xenova/transformers
// - In Node: use an indirect dynamic import to avoid bundlers resolving it into browser bundles
// - In Browser: prefer a preloaded UMD on window.transformers, try a local vendor copy at
//   `${import.meta.env.BASE_URL}vendor/transformers.min.js` (recommended), then fallback to CDN

type PipelineFactory = (task: string, model: string, opts?: any) => Promise<any>;

const CDN_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';
let loadPromise: Promise<PipelineFactory> | null = null;

export async function loadTransformersPipeline(): Promise<PipelineFactory> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // Node environment
    if (typeof window === 'undefined') {
      const moduleName = '@xenova/transformers';
      let imported: any;
      try {
        // Indirect dynamic import to avoid bundler static analysis
         
        imported = await new Function('moduleName', 'return import(moduleName)')(moduleName);
      } catch (e) {
        // Fallback to direct import (useful for test runners that mock the module)
        imported = await import(moduleName);
      }
      if (!imported || !imported.pipeline) throw new Error('Failed to import @xenova/transformers in Node');
      return imported.pipeline;
    }

    // Browser: prefer already-initialized UMD
    const tryWindow = () => {
      if ((window as any).transformers && (window as any).transformers.pipeline) {
        return (window as any).transformers.pipeline as PipelineFactory;
      }
      return null;
    };

    let pipeline = tryWindow();
    if (pipeline) return pipeline;

    // Helper to attempt importing an ES module (dynamic import) and fallback to inserting a module <script>
    const importModule = async (src: string) => {
      // Try dynamic import via an indirect Function to avoid bundler static resolution
      try {
         
        const mod = await new Function('s', 'return import(s)')(src);
        return mod;
      } catch (err) {
        // Fallback: inject a module script that assigns the module to a temporary window symbol
        const marker = '__xeno_transformers_temp__';
        if ((window as any)[marker]) delete (window as any)[marker];
        const s = document.createElement('script');
        s.type = 'module';
        s.textContent = `import * as m from ${JSON.stringify(src)}; window.${marker}=m;`;
        document.head.appendChild(s);
        // Wait for the marker to be set
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
    };

    // Try a local copy in public/vendor first (recommended to commit a pinned build for production)
    const rawBase = (import.meta as any).env?.BASE_URL || '/';
    // Ensure we pass an absolute URL to the URL constructor. Vite may set BASE_URL to a path like '/bngplayground/'.
    let baseUrl = rawBase;
    try {
      const isAbsolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(baseUrl) || baseUrl.startsWith('//');
      if (!isAbsolute) {
        // Make absolute using current origin
        baseUrl = window.location.origin + (baseUrl.startsWith('/') ? baseUrl : '/' + baseUrl);
      }
    } catch (e) {
      baseUrl = window.location.origin + '/';
    }
    const localSrc = new URL('vendor/transformers.min.js', baseUrl).toString();

    try {
      // Preflight: check resource exists and has JavaScript MIME to avoid blocked/malformed responses
      let ok = false;
      try {
        const head = await fetch(localSrc, { method: 'HEAD' });
        if (head.ok) {
          const ct = head.headers.get('content-type') || '';
          if (/javascript|ecmascript|module|text\/javascript|application\/javascript/.test(ct)) ok = true;
        }
      } catch (_headErr) {
        // HEAD may be blocked by some static hosts; try a range GET for a small payload
        try {
          const r = await fetch(localSrc, { method: 'GET', headers: { Range: 'bytes=0-0' } });
          const ct = r.headers.get('content-type') || '';
          if (r.ok && /javascript|ecmascript|module|text\/javascript|application\/javascript/.test(ct)) ok = true;
        } catch (_getErr) {
          ok = false;
        }
      }

      if (!ok) {
        console.debug(`[transformersLoader] Skipping local vendor ${localSrc} (missing or invalid MIME)`);
      } else {
        const mod = await importModule(localSrc);
        console.debug('[transformersLoader] Imported module from local vendor', Object.keys(mod || {}));
        pipeline = tryWindow() || mod?.pipeline || mod?.default?.pipeline || (mod?.transformers && mod.transformers.pipeline);
        if (pipeline) return pipeline;
      }
    } catch (e) {
      // ignore and try CDN
      console.debug('[transformersLoader] Local vendor import failed:', e);
    }

    // Fallback to CDN (try dynamic import first)
    try {
      // Preflight check CDN as well (helps short-circuit CORS/MIME issues)
      let ok = false;
      try {
        const head = await fetch(CDN_URL, { method: 'HEAD' });
        if (head.ok) {
          const ct = head.headers.get('content-type') || '';
          if (/javascript|ecmascript|module|text\/javascript|application\/javascript/.test(ct)) ok = true;
        }
      } catch (_headErr) {
        try {
          const r = await fetch(CDN_URL, { method: 'GET', headers: { Range: 'bytes=0-0' } });
          const ct = r.headers.get('content-type') || '';
          if (r.ok && /javascript|ecmascript|module|text\/javascript|application\/javascript/.test(ct)) ok = true;
        } catch (__getErr) { ok = false; }
      }

      if (!ok) console.debug('[transformersLoader] Skipping CDN dynamic import due to missing JS MIME on CDN');
      else {
        const mod = await importModule(CDN_URL);
        console.debug('[transformersLoader] Imported module from CDN', Object.keys(mod || {}));
        pipeline = tryWindow() || mod?.pipeline || mod?.default?.pipeline || (mod?.transformers && mod.transformers.pipeline);
        if (pipeline) return pipeline;
      }
    } catch (e) {
      console.debug('[transformersLoader] CDN dynamic import failed:', e);
      // If dynamic import failed, try classic script injection and hope the bundle defines global
      // (some older CDNs publish UMD bundles; we still try to inject then check window)
      const injectClassic = (src: string) => new Promise<void>((resolve, reject) => {
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
