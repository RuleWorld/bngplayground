import React from 'react';

interface ModelExplorerTabProps {
  onLoadModel?: (code: string, name: string, id: string) => void;
}

import { useEffect, useState } from 'react';
import { loadModelCode } from '../../services/modelLoader';
import { findCatalogExampleByQuery } from '../../services/modelCatalog';

export const ModelExplorerTab: React.FC<ModelExplorerTabProps> = ({ onLoadModel }) => {
    const [iframeUrl, setIframeUrl] = useState('');

    useEffect(() => {
        const base = document.baseURI || window.location.origin + '/';
        const url = new URL('umap.html', base);
        setIframeUrl(url.toString());
    }, []);

    useEffect(() => {
        const handleMessage = async (event: MessageEvent) => {
            // SECURITY: Validate message origin to prevent cross-origin message spoofing
            if (event.origin !== window.location.origin) return;

            if (event.data?.type === 'LOAD_MODEL' && event.data.id) {
                const example = await findCatalogExampleByQuery(event.data.id);
                if (example) {
                    const code = example.code ?? await loadModelCode(example.id);
                    onLoadModel?.(code, example.name, example.id);
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onLoadModel]);

    if (!iframeUrl) return null;

    return (
        <div className="h-full w-full min-h-0 flex flex-col pb-4 rounded-2xl overflow-hidden relative">
            <iframe
                src={iframeUrl}
                className="w-full h-full border-0 bg-slate-900"
                title="Model Explorer"
            />
        </div>
    );
};

export default ModelExplorerTab;
