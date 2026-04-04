import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { fetchBioModelsSbml } from '../services/bioModelsImport';

// Note: BioModels provides a REST API (https://www.ebi.ac.uk/biomodels/docs/)
// We use the public download endpoint under `/model/download/{modelId}` and
// prefer the direct `?filename={id}_url.xml` SBML payload. If an archive is
// returned, we extract the SBML entry client-side before import.
//
// The import flow below will:
// 1. Fetch the model from BioModels using `/model/download/{id}`.
// 2. Validate payload and, for OMEX archives, extract the primary SBML file.
// 3. Create a `File` object named with the BioModels identifier (e.g.,
//    `BIOMD0000000123.xml`) and call `onImportSBML(file)`. The App will set
//    the loaded model title from the file name (see `App.tsx` comment).

interface BioModelsImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSBML: (file: File) => void | Promise<void>;
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
      const { normalizedId, sbmlText } = await fetchBioModelsSbml(trimmed);
      const file = new File([sbmlText], `${normalizedId}.xml`, { type: 'application/xml' });
      await onImportSBML(file);
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
