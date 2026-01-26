import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

// Note: BioModels provides a REST API (https://www.ebi.ac.uk/biomodels/docs/)
// We use the `GET /model/{modelId}/download` endpoint with `format=xml` when
// possible. Responses may be a single SBML XML file or a COMBINE/OMEX archive
// (zip-like). If an archive is returned, we extract it client-side and locate
// the first SBML/XML file to import.
//
// The import flow below will:
// 1. Fetch the model from BioModels as XML (prefer `format=xml`).
// 2. If Content-Type indicates an archive (zip/omex) or filename suggests an
//    archive, dynamically load `jszip` and extract the first `.xml`/`.sbml` file.
// 3. Create a `File` object named with the BioModels identifier (e.g.,
//    `BIOMD0000000123.xml`) and call `onImportSBML(file)`. The App will set
//    the loaded model title from the file name (see `App.tsx` comment).

interface BioModelsImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSBML: (file: File) => void;
}

export const BioModelsImportModal: React.FC<BioModelsImportModalProps> = ({ isOpen, onClose, onImportSBML }) => {
  const [id, setId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFromBioModels = async () => {
    const trimmed = id.trim();
    if (!trimmed) return setError('Enter a BioModels ID (e.g., BIOMD0000000001)');
    setError(null);
    setLoading(true);
    try {
      // Try requesting SBML/XML explicitly (server supports `format` parameter)
      const url = `/api/biomodels/model/download/${encodeURIComponent(trimmed)}?format=xml`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const contentDisposition = (res.headers.get('content-disposition') || '').toLowerCase();

      const blob = await res.blob();
      console.log(`[BioModels] Detected Content-Type: ${contentType}`);
      console.log(`[BioModels] Detected Content-Disposition: ${contentDisposition}`);

      // Robust archive detection:
      // 1. Headers (Zip/Omex)
      // 2. Binary Signature Check (Magic Bytes: 50 4B 03 04 for ZIP)
      const headerCheck = contentType.includes('zip') || contentType.includes('omex') ||
        contentDisposition.includes('.zip') || contentDisposition.includes('.omex');

      let isArchive = headerCheck;

      if (!isArchive) {
        // Sample first 4 bytes
        const buffer = await blob.slice(0, 4).arrayBuffer();
        const header = new Uint8Array(buffer);
        // ZIP magic bytes: PK\x03\x04
        if (header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04) {
          console.log('[BioModels] Binary signature matches ZIP archive. Overriding header-based type.');
          isArchive = true;
        }
      }

      if (isArchive) {
        console.log('[BioModels] Detected archive format. Attempting extraction...');
        try {
          const JSZipModule = await import('jszip');
          const JSZip = JSZipModule.default || JSZipModule;
          const zip = await JSZip.loadAsync(blob);
          const files = Object.keys(zip.files);
          console.log('[BioModels] Archive loaded. Files:', files);

          // Refined candidate selection:
          // 1. Exclude known metadata/manifest files
          // 2. Prefer .sbml over .xml if both exist
          // 3. Exclude directories
          const filtered = files.filter(name => {
            const lower = name.toLowerCase();
            return (lower.endsWith('.xml') || lower.endsWith('.sbml')) && 
                   !lower.endsWith('manifest.xml') && 
                   !lower.endsWith('metadata.rdf') &&
                   !zip.files[name].dir;
          });

          if (filtered.length === 0) throw new Error('No valid SBML/XML files found inside the archive');

          // Sort to prefer .sbml
          filtered.sort((a, b) => {
            if (a.toLowerCase().endsWith('.sbml') && !b.toLowerCase().endsWith('.sbml')) return -1;
            if (!a.toLowerCase().endsWith('.sbml') && b.toLowerCase().endsWith('.sbml')) return 1;
            return 0;
          });

          const sbmlName = filtered[0];
          console.log(`[BioModels] Extracting candidate: ${sbmlName}`);
          const sbmlText = await zip.file(sbmlName)!.async('string');

          const file = new File([sbmlText], `${trimmed}.xml`, { type: 'application/xml' });
          onImportSBML(file);
          onClose();
          return;
        } catch (zipErr) {
          console.error('[BioModels] Archive extraction failed:', zipErr);
          throw new Error(`Failed to extract model archive: ${zipErr instanceof Error ? zipErr.message : String(zipErr)}`);
        }
      }

      // Otherwise treat as XML/SBML text (strictly for non-archives)
      const xml = await blob.text();
      // Double check snippet to avoid binary junk
      if (xml.substring(0, 100).includes('PK\x03\x04')) {
         throw new Error('Fetched file is a ZIP archive despite isArchive=false. Aborting text parse.');
      }
      const file = new File([xml], `${trimmed}.xml`, { type: 'application/xml' });
      onImportSBML(file);
      onClose();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import from BioModels" size="md">
      <div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Enter a BioModels model ID (e.g., <span className="font-mono">BIOMD0000000001</span>) and click <strong>Fetch &amp; Import</strong>. The importer will fetch SBML (or a COMBINE archive) and import the primary SBML file.</p>
        <div className="mb-3">
          <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="BioModels ID" />
        </div>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={fetchFromBioModels} disabled={loading}>{loading ? 'Fetching...' : 'Fetch & Import'}</Button>
        </div>
      </div>
    </Modal>
  );
};