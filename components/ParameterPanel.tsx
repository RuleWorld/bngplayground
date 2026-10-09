import React, { useMemo, useState, useEffect, useRef } from 'react';
import { parseParameters, type Parameter } from '../src/utils/bnglManipulation';

interface ParameterPanelProps {
  code: string;
  onCodeChange: (newCode: string, options?: { immediate?: boolean }) => void;
}


// Helper to check if a line is inside parameter block
// and extract parameter info




interface LocalParameterState extends Parameter {
  initialValue: number; // The "anchor" value when the slider initialized
  sliderValue: number;  // The position of the slider (-1 to +1)
}

export const ParameterPanel: React.FC<ParameterPanelProps> = ({ code, onCodeChange }) => {
  const parsedParams = useMemo(() => parseParameters(code), [code]);

  // Local state for smooth slider movement
  // We use a log-scale slider where 0 is the initial value.
  const [localParams, setLocalParams] = useState<LocalParameterState[]>([]);

  const isEditingRef = useRef(false);
  // Newest code emitted by a slider, so concurrent slider moves never build on a stale prop.
  const latestCodeRef = useRef(code);

  useEffect(() => {
    latestCodeRef.current = code;
  }, [code]);
  // A drag can end outside the slider, so clear the editing flag globally.
  useEffect(() => {
    const release = () => {
      isEditingRef.current = false;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);
  useEffect(() => {
    // If we are actively dragging, ignore upstream echoes unless it seems like a new load.
    // However, after the drag finishes (and isEditingRef becomes false), we get a code update.
    // We must NOT reset the initialValue if the code update matches our current local value.

    if (!isEditingRef.current) {

      setLocalParams(prev => {
        const prevMap = new Map();
        for (const e of prev) {
          prevMap.set(e.name, e);
        }

        // Map new parsed params to local state
        return parsedParams.map(p => {
          const existing = prevMap.get(p.name);

          // Check if the value has changed significantly from what we have locally.
          // If it matches our local "current value", it's likely our own update echoing back.
          // In that case, we MUST preserve the initialValue and sliderValue to prevent "ratcheting".

          let isDifferent;
          if (existing) {
            const diff = Math.abs(p.value - existing.value);
            // Allow for small floating point differences or precision formatting
            // If value is 0, strict equality. Else relative error.
            if (p.value === 0) {
              isDifferent = diff > 1e-9;
            } else {
              isDifferent = (diff / Math.abs(p.value)) > 1e-3;
            }
          } else {
            // New parameter
            isDifferent = true;
          }

          if (isDifferent || !existing) {
            // External change or new param: Reset anchor to new value
            return {
              ...p,
              initialValue: p.value,
              sliderValue: 0
            };
          } else {
            // Our own update: Maintain anchor and slider position
            // But sync lineIndex and exact value from code to be safe
            return {
              ...existing,
              lineIndex: p.lineIndex,
              value: p.value
            };
          }
        });
      });
    }
  }, [parsedParams]);

  const emitParameterValue = (name: string, value: number) => {
    // Read the newest code we know about rather than the render-time prop, so two
    // sliders moved in the same frame both land.
    const baseCode = latestCodeRef.current;
    const baseParams = parseParameters(baseCode);
    const target = baseParams.find(p => p.name === name);
    if (!target) return;

    const lines = baseCode.split(/\r?\n/);
    const line = lines[target.lineIndex];
    if (line === undefined) return;

    const nameRegex = new RegExp(`(${target.name}\\s+)([\\d\\.eE\\-\\+]+)(.*)`);
    if (!nameRegex.test(line)) return;

    lines[target.lineIndex] = line.replace(nameRegex, `$1${value}$3`);
    const nextCode = lines.join('\n');
    latestCodeRef.current = nextCode;
    // `immediate` skips the editor-typing debounce so the plots track the slider.
    onCodeChange(nextCode, { immediate: true });
  };

  const handleSliderChange = (index: number, newSliderValue: number) => {
    const param = localParams[index];
    if (!param) return;

    isEditingRef.current = true;

    // Log scale calculation: Value = Initial * 10^(Slider)
    const raw = param.initialValue === 0
      ? newSliderValue // Simple linear around 0
      : param.initialValue * Math.pow(10, newSliderValue);
    const value = Number(raw.toPrecision(4));

    setLocalParams(prev => {
      const next = [...prev];
      next[index] = { ...next[index], sliderValue: newSliderValue, value };
      return next;
    });

    emitParameterValue(param.name, value);
  };

  const endSliderEdit = () => {
    isEditingRef.current = false;
  };

  if (localParams.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-3 mt-4 border-t border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 rounded-lg" aria-label="Parameter controls">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Parameter Sliders (Log Scale)
      </h3>
      <div className="flex flex-col gap-3 max-h-48 overflow-y-auto pr-2" role="region" aria-label="Parameter sliders">
        {localParams.map((param, i) => (
          <div key={`${param.name}-${i}`} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-400">{param.name}</span>
              <span className="font-mono text-slate-500 dark:text-slate-400">{param.value}</span>
            </div>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={param.sliderValue}
              onChange={(e) => handleSliderChange(i, parseFloat(e.target.value))}
              onKeyUp={endSliderEdit}
              onBlur={endSliderEdit}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-primary-500"
              aria-label={param.name}
            />
            <div className="flex justify-between text-[10px] text-slate-400 px-1">
              <span>{param.initialValue === 0 ? '-1' : (param.initialValue / 10).toPrecision(2)}</span>
              <span>{param.initialValue} (Initial)</span>
              <span>{param.initialValue === 0 ? '1' : (param.initialValue * 10).toPrecision(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
