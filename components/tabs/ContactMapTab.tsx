import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { BNGLModel, SimulationResults } from '../../types';
import { ContactMapViewer } from '../ContactMapViewer';
import { buildContactMap } from '../../services/visualization/contactMapBuilder';
import { buildRuleOverlays } from '../../services/visualization/buildRuleOverlays';
import type { RuleOverlay } from '../../services/visualization/ruleOverlay';
import { buildContactMapSnapshots, ContactMapSnapshot } from '../../services/visualization/dynamicContactMap';

interface ContactMapTabProps {
    model: BNGLModel | null;
    results?: SimulationResults | null;
    onSelectRule?: (ruleId: string) => void;
}

const getRuleId = (rule: { name?: string }, index: number): string => rule.name ?? `rule_${index + 1}`;
const getRuleLabel = (rule: { name?: string }, index: number): string => rule.name ?? `Rule ${index + 1}`;

export const ContactMapTab: React.FC<ContactMapTabProps> = ({ model, results, onSelectRule }) => {
    const [selectedOverlayIndex, setSelectedOverlayIndex] = useState<number | null>(null);
    const [timeIndex, setTimeIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [dynamicEnabled, setDynamicEnabled] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const contactMap = useMemo(() => {
        if (!model) {
            return { nodes: [], edges: [] };
        }
        return buildContactMap(model.reactionRules, model.moleculeTypes, {
            getRuleId,
            getRuleLabel,
        });
    }, [model]);

    const ruleOverlays = useMemo(() => {
        if (!model || model.reactionRules.length === 0) return [];
        return buildRuleOverlays(model.reactionRules, model.moleculeTypes);
    }, [model]);

    const snapshots = useMemo(() => {
        if (!results || !model) return [];
        return buildContactMapSnapshots(results, model.moleculeTypes);
    }, [results, model]);

    // Track previous model/results to reset state immediately during render if they change.
    // This avoids "stale" animation frames from firing for the old model during transitions.
    const prevModelRef = useRef<BNGLModel | null>(model);
    const prevResultsRef = useRef<SimulationResults | null>(results || null);
    if (prevModelRef.current !== model || prevResultsRef.current !== (results || null)) {
        prevModelRef.current = model;
        prevResultsRef.current = results || null;
        if (isPlaying) setIsPlaying(false);
        if (dynamicEnabled) setDynamicEnabled(false);
        if (selectedOverlayIndex !== null) setSelectedOverlayIndex(null);
        if (timeIndex !== 0) setTimeIndex(0);
    }

    // Auto-play animation
    const handlePlayPause = useCallback(() => {
        setIsPlaying(prev => !prev);
    }, []);

    useEffect(() => {
        if (isPlaying && snapshots.length > 1) {
            intervalRef.current = setInterval(() => {
                setTimeIndex(prev => {
                    // Safe guard: if snapshots changed out from under us, stop.
                    if (snapshots.length === 0) {
                        setIsPlaying(false);
                        return 0;
                    }
                    if (prev >= snapshots.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, 200);
        }
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [isPlaying, snapshots.length]);

    // Mutual exclusion: rule overlay uses CSS classes, dynamic uses inline styles.
    // Both active at once causes inline styles to win, breaking rule highlights.
    const selectedOverlay: RuleOverlay | null =
        (!dynamicEnabled && selectedOverlayIndex !== null)
            ? (ruleOverlays[selectedOverlayIndex] ?? null)
            : null;

    const currentSnapshot: ContactMapSnapshot | null =
        (dynamicEnabled && selectedOverlayIndex === null && snapshots.length > 0)
            ? (snapshots[timeIndex] ?? null)
            : null;

    if (!model) {
        return <div className="text-slate-500 dark:text-slate-400">Parse a model to view the contact map.</div>;
    }

    return (
        <div className="flex h-full flex-col gap-3">
            {/* Rule Overlay Selector */}
            {ruleOverlays.length > 0 && (
                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        Rule Overlay:
                    </label>
                    <select
                        className="flex-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1 truncate"
                        value={selectedOverlayIndex ?? ''}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                                setSelectedOverlayIndex(null);
                            } else {
                                setSelectedOverlayIndex(parseInt(val, 10));
                                setDynamicEnabled(false);
                            }
                        }}
                    >
                        <option value="">None (show all)</option>
                        {ruleOverlays.map((overlay) => (
                            <option key={overlay.ruleIndex} value={overlay.ruleIndex}>
                                {overlay.ruleName}
                            </option>
                        ))}
                    </select>
                    {selectedOverlay && (
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-full bg-[#e74c3c]" />
                                {selectedOverlay.center.stateChanges.size
                                    + selectedOverlay.center.bondsAdded.length
                                    + selectedOverlay.center.bondsRemoved.length
                                    + selectedOverlay.center.moleculesAdded.size
                                    + selectedOverlay.center.moleculesRemoved.size} changes
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="inline-block w-2 h-2 rounded-full bg-[#3498db]" />
                                {selectedOverlay.context.testedComponents.size
                                    + selectedOverlay.context.requiredBonds.length} tested
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Dynamic Contact Map Controls */}
            {snapshots.length > 0 && (
                <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-md border border-slate-200 dark:border-slate-700">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <input
                            type="checkbox"
                            checked={dynamicEnabled}
                            onChange={(e) => {
                                setDynamicEnabled(e.target.checked);
                                if (e.target.checked) setSelectedOverlayIndex(null);
                            }}
                            className="rounded border-slate-300 text-teal-600"
                        />
                        Dynamic
                    </label>
                    {dynamicEnabled && (
                        <>
                            <button
                                onClick={handlePlayPause}
                                className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                            >
                                {isPlaying ? '⏸ Pause' : '▶ Play'}
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={snapshots.length - 1}
                                value={timeIndex}
                                onChange={(e) => {
                                    setTimeIndex(parseInt(e.target.value, 10));
                                    setIsPlaying(false);
                                }}
                                className="flex-1"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                                t = {currentSnapshot?.time.toFixed(2) ?? '0'}
                            </span>
                        </>
                    )}
                </div>
            )}

            {/* Contact Map */}
            <section className="h-full flex flex-col">
                <div className="flex-1 min-h-[500px] border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden relative">
                    <ContactMapViewer
                        contactMap={contactMap}
                        onSelectRule={onSelectRule}
                        ruleOverlay={selectedOverlay}
                        dynamicSnapshot={currentSnapshot}
                    />
                </div>
            </section>
        </div>
    );
};
