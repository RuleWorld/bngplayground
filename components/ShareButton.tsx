import React, { useState, useCallback } from 'react';
import { Button } from './ui/Button';
import { generateShareUrl } from '../src/utils/shareUrl';

interface ShareButtonProps {
    code: string;
    className?: string;
    modelName?: string | null;
    modelId?: string | null;
    onModelNameChange?: (name: string | null) => void;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ code, className, modelName, modelId, onModelNameChange }) => {
    const [copied, setCopied] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [shareUrl, setShareUrl] = useState('');
    const [nameInput, setNameInput] = useState(modelName ?? '');

    React.useEffect(() => {
        setNameInput(modelName ?? '');
    }, [modelName]);

    React.useEffect(() => {
        if (!showModal) return;
        const url = generateShareUrl(code, {
            name: nameInput.trim() || undefined,
            modelId: modelId ?? undefined,
        });
        setShareUrl(url);
    }, [showModal, code, nameInput, modelId]);

    const handleShare = useCallback(() => {
        setShowModal(true);
    }, []);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [shareUrl]);

    const handleClose = useCallback(() => {
        setShowModal(false);
        setCopied(false);
    }, []);

    const embedCode = `<iframe src="${shareUrl}" width="100%" height="600" frameborder="0"></iframe>`;

    return (
        <>
            <Button
                variant="subtle"
                onClick={handleShare}
                className={className}
                title="Share this model"
            >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
            </Button>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
                    <div
                        className="bg-white dark:bg-slate-900 dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                                Share Model
                            </h3>
                            <button
                                onClick={handleClose}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                aria-label="Close share modal"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Model Name (optional)
                                </label>
                                <input
                                    type="text"
                                    value={nameInput}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setNameInput(value);
                                        onModelNameChange?.(value.trim() ? value : null);
                                    }}
                                    placeholder="e.g., My custom model"
                                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 dark:border-slate-600 rounded-md text-slate-700 dark:text-slate-200"
                                />
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Set a custom name for sharing and embeds.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Shareable Link
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={shareUrl}
                                        className="flex-1 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-300 truncate"
                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                    />
                                    <Button onClick={handleCopy} variant={copied ? 'primary' : 'subtle'}>
                                        {copied ? 'Copied!' : 'Copy'}
                                    </Button>
                                </div>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Anyone with this link can view and run this model.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Embed Code
                                </label>
                                <textarea
                                    readOnly
                                    value={embedCode}
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800/50 dark:bg-slate-700 border border-slate-200 dark:border-slate-700 dark:border-slate-600 rounded-md text-slate-600 dark:text-slate-300 font-mono"
                                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                                />
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    Paste this into your website to embed the simulator.
                                </p>
                            </div>

                            {shareUrl.length > 2000 && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md">
                                    <p className="text-sm text-amber-700 dark:text-amber-300">
                                        ⚠️ This URL is very long ({(shareUrl.length / 1024).toFixed(1)} KB).
                                        Some browsers may not support URLs over 2KB. Consider using a URL shortener.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
