import React, { useState, useCallback, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { toggleArrayMember } from '../../services/collections';

interface FigurePanelEntry {
  id: string;
  label: string;
  source: string;
  svgContent: string;
}

interface FigureBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  availablePanels: FigurePanelEntry[];
}

type ExportFormat = 'svg' | 'png' | 'tiff' | 'pdf';
type LayoutMode = 'horizontal' | 'vertical' | 'grid';
type JournalPreset = 'plos' | 'nature' | 'cell' | 'default';

const PANEL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

const PRESET_DESCRIPTIONS: Record<JournalPreset, string> = {
  plos: 'PLOS ONE — Arial 10pt, 86mm/178mm columns, 300 DPI TIFF',
  nature: 'Nature — Helvetica 7pt, 89mm/183mm columns, 300 DPI',
  cell: 'Cell — Arial 8pt, 85mm/174mm columns, 300 DPI',
  default: 'Default — Arial 12pt, flexible width, 300 DPI',
};

export const FigureBuilderModal: React.FC<FigureBuilderModalProps> = ({
  isOpen, onClose, availablePanels,
}) => {
  const [selectedPanels, setSelectedPanels] = useState<string[]>([]);
  const [layout, setLayout] = useState<LayoutMode>('horizontal');
  const [gridCols, setGridCols] = useState(2);
  const [preset, setPreset] = useState<JournalPreset>('plos');
  const [figureCaption, setFigureCaption] = useState('');
  const [figureNumber, setFigureNumber] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [totalWidth, setTotalWidth] = useState(178);

  const availablePanelsMap = useMemo(() => {
    const map = new Map<string, FigurePanelEntry>();
    for (const panel of availablePanels) {
      map.set(panel.id, panel);
    }
    return map;
  }, [availablePanels]);

  const togglePanel = useCallback((panelId: string) => {
    setSelectedPanels(prev => toggleArrayMember(prev, panelId));
  }, []);

  const movePanel = useCallback((panelId: string, direction: 'up' | 'down') => {
    setSelectedPanels(prev => {
      const idx = prev.indexOf(panelId);
      if (idx < 0) return prev;
      const newArr = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= newArr.length) return prev;
      [newArr[idx], newArr[swapIdx]] = [newArr[swapIdx], newArr[idx]];
      return newArr;
    });
  }, []);

  const handleExport = useCallback(async (format: ExportFormat) => {
    setIsExporting(true);
    try {
      const { composeFigure } = await import('../../src/services/figure/FigureCompositor');
      const { exportFigure, downloadFigure, generateLatexSnippet } = await import('../../src/services/figure/FigureExporter');

      const panels = selectedPanels.map((id, idx) => {
        const panel = availablePanelsMap.get(id);
        return {
          id,
          label: `(${PANEL_LABELS[idx] || String.fromCharCode(65 + idx)})`,
          svgContent: panel?.svgContent || '<svg></svg>',
          width: layout === 'horizontal' ? totalWidth / selectedPanels.length : totalWidth,
          height: 80,
          caption: panel?.source,
        };
      });

      const svg = composeFigure({
        panels,
        layout,
        gridCols: layout === 'grid' ? gridCols : undefined,
        totalWidth,
        figureNumber,
        caption: figureCaption,
        preset,
      });

      if (format === 'svg' || format === 'png' || format === 'tiff' || format === 'pdf') {
        const result = await exportFigure({
          svg,
          format,
          filename: `figure_${figureNumber}`,
          dpi: 300,
          widthMm: totalWidth,
          heightMm: totalWidth * 0.6,
        });
        downloadFigure(result);
      }

      // Also copy LaTeX snippet to clipboard
      const latex = generateLatexSnippet(
        `figure_${figureNumber}.${format === 'svg' ? 'pdf' : format}`,
        figureCaption,
        `fig:${figureNumber}`,
      );
      try { await navigator.clipboard.writeText(latex); } catch (e) { /* ignore */ }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [selectedPanels, availablePanelsMap, layout, gridCols, preset, totalWidth, figureCaption, figureNumber]);

  // Preview layout
  const previewLayout = useMemo(() => {
    if (selectedPanels.length === 0) return null;
    const nPanels = selectedPanels.length;
    const cols = layout === 'horizontal' ? nPanels :
                 layout === 'vertical' ? 1 :
                 gridCols;
    const rows = Math.ceil(nPanels / cols);
    return { cols, rows };
  }, [selectedPanels, layout, gridCols]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Publication Figure Builder" size="lg">
      <div className="flex gap-4 h-[70vh]">
        {/* Panel Gallery (left) */}
        <div className="w-48 shrink-0 overflow-auto border-r border-slate-200 dark:border-slate-700 pr-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Available Panels
          </h3>
          {availablePanels.length === 0 ? (
            <p className="text-xs text-slate-400">Run analyses to generate panels.</p>
          ) : (
            <div className="space-y-1">
              {availablePanels.map(panel => {
                const isSelected = selectedPanels.includes(panel.id);
                const idx = selectedPanels.indexOf(panel.id);
                return (
                  <button
                    key={panel.id}
                    onClick={() => togglePanel(panel.id)}
                    className={`w-full text-left p-2 rounded text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-600'
                        : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isSelected && (
                      <span className="font-bold text-blue-600 dark:text-blue-400 mr-1">
                        ({PANEL_LABELS[idx]})
                      </span>
                    )}
                    {panel.source}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Canvas Preview (center) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 p-4 overflow-auto">
            {selectedPanels.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Select panels from the gallery to compose your figure.
              </div>
            ) : previewLayout && (
              <div
                className="grid gap-2 w-full h-full"
                style={{
                  gridTemplateColumns: `repeat(${previewLayout.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${previewLayout.rows}, 1fr)`,
                }}
              >
                {selectedPanels.map((id, idx) => {
                  const panel = availablePanelsMap.get(id);
                  return (
                    <div
                      key={id}
                      className="border border-dashed border-slate-300 dark:border-slate-600 rounded p-2 flex flex-col"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          ({PANEL_LABELS[idx]})
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => movePanel(id, 'up')}
                            disabled={idx === 0}
                            className="text-xs px-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                            aria-label="Move panel left"
                            title="Move panel left"
                          >
                            ←
                          </button>
                          <button
                            onClick={() => movePanel(id, 'down')}
                            disabled={idx === selectedPanels.length - 1}
                            className="text-xs px-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                            aria-label="Move panel right"
                            title="Move panel right"
                          >
                            →
                          </button>
                          <button
                            onClick={() => togglePanel(id)}
                            className="text-xs px-1 text-red-400 hover:text-red-600"
                            aria-label="Remove panel"
                            title="Remove panel"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 bg-slate-50 dark:bg-slate-800 rounded flex items-center justify-center text-xs text-slate-400">
                        {panel?.source || id}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Caption editor */}
          <div className="mt-2">
            <label htmlFor="fb-caption" className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
              Figure Caption
            </label>
            <textarea
              id="fb-caption"
              value={figureCaption}
              onChange={e => setFigureCaption(e.target.value)}
              rows={2}
              placeholder="Enter figure caption..."
              className="w-full px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs resize-none"
            />
          </div>
        </div>

        {/* Style Controls (right) */}
        <div className="w-52 shrink-0 overflow-auto border-l border-slate-200 dark:border-slate-700 pl-3 space-y-3">
          <div>
            <label htmlFor="fb-preset" className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
              Journal Preset
            </label>
            <Select
              id="fb-preset"
              value={preset}
              onChange={e => setPreset(e.target.value as JournalPreset)}
            >
              {Object.keys(PRESET_DESCRIPTIONS).map(k => (
                <option key={k} value={k}>{k.toUpperCase()}</option>
              ))}
            </Select>
            <p className="text-[10px] text-slate-400 mt-0.5">{PRESET_DESCRIPTIONS[preset]}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
              Layout
            </label>
            <div className="flex gap-1">
              {(['horizontal', 'vertical', 'grid'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setLayout(l)}
                  className={`px-2 py-1 text-xs rounded ${
                    layout === l
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                  aria-label={`${l} layout`}
                  title={`${l.charAt(0).toUpperCase() + l.slice(1)} layout`}
                >
                  {l === 'horizontal' ? '→' : l === 'vertical' ? '↓' : '⊞'}
                </button>
              ))}
            </div>
          </div>

          {layout === 'grid' && (
            <div>
              <label htmlFor="fb-grid-cols" className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
                Grid Columns
              </label>
              <input
                id="fb-grid-cols"
                type="number"
                value={gridCols}
                onChange={e => setGridCols(Math.max(1, Math.min(4, Number(e.target.value))))}
                min={1} max={4}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
              Width (mm)
            </label>
            <div className="flex gap-1">
              <button onClick={() => setTotalWidth(86)}
                className={`px-2 py-1 text-xs rounded ${totalWidth === 86 ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>
                86 (1col)
              </button>
              <button onClick={() => setTotalWidth(178)}
                className={`px-2 py-1 text-xs rounded ${totalWidth === 178 ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}>
                178 (2col)
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="fb-figure-number" className="text-xs font-medium text-slate-600 dark:text-slate-300 block mb-1">
              Figure Number
            </label>
            <input
              id="fb-figure-number"
              type="number"
              value={figureNumber}
              onChange={e => setFigureNumber(Number(e.target.value))}
              min={1}
              className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs"
            />
          </div>

          {/* Export buttons */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Export</p>
            {(['svg', 'png', 'tiff', 'pdf'] as const).map(fmt => (
              <Button
                key={fmt}
                variant="secondary"
                className="w-full justify-center"
                onClick={() => handleExport(fmt)}
                disabled={isExporting || selectedPanels.length === 0}
              >
                {fmt.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
