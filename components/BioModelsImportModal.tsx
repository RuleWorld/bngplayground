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
      const url = `https://www.ebi.ac.uk/biomodels/model/${encodeURIComponent(trimmed)}/download?format=xml`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const contentDisposition = (res.headers.get('content-disposition') || '').toLowerCase();

      const blob = await res.blob();

      // If we received a zip/omex archive, attempt to unzip and extract an SBML file
      if (contentType.includes('zip') || contentType.includes('omex') || contentDisposition.includes('.zip') || contentDisposition.includes('.omex')) {
        try {
          // Dynamic import so tests/dev env that don't have JSZip aren't blocked
          const JSZipModule = await import('jszip');
          const JSZip = JSZipModule.default || JSZipModule;
          const zip = await JSZip.loadAsync(blob);
          const candidates = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.xml') || name.toLowerCase().endsWith('.sbml'));
          if (candidates.length === 0) throw new Error('No SBML/XML files found inside the archive');
          // Pick the first SBML/XML file
          const sbmlName = candidates[0];
          const sbmlText = await zip.file(sbmlName)!.async('string');
          const file = new File([sbmlText], `${trimmed}.xml`, { type: 'application/xml' });
          onImportSBML(file);
          onClose();
          return;
        } catch (zipErr) {
          console.warn('Failed to extract archive using JSZip:', zipErr);
          // Fall through to try to interpret blob as XML text
        }
      }

      // Otherwise treat as XML/SBML text
      const xml = await blob.text();
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