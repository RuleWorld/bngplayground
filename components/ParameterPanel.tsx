
import React, { useMemo, useState, useEffect } from 'react';

interface ParameterPanelProps {
  code: string;
  onCodeChange: (newCode: string) => void;
}

interface Parameter {
  name: string;
  value: number;
  lineIndex: number; // 0-based line index in the code
}

// Helper to check if a line is inside parameter block
// and extract parameter info
function parseParameters(code: string): Parameter[] {
  const lines = code.split(/\r?\n/);
  const parameters: Parameter[] = [];
  let inParamBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('begin parameters')) {
      inParamBlock = true;
      continue;
    }
    if (line.startsWith('end parameters')) {
      inParamBlock = false;
      continue; // or break if we assume only one block
    }

    if (inParamBlock && line && !line.startsWith('#')) {
      // Parse "name value" or "name expression"
      // Regex: start with word, space, number
      // Simple parser: split by whitespace
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const name = parts[0];
        const valStr = parts[1];
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
          parameters.push({ name, value: val, lineIndex: i });
        }
      }
    }
  }
  return parameters;
}




interface LocalParameterState extends Parameter {
  initialValue: number; // The "anchor" value when the slider initialized
  sliderValue: number;  // The position of the slider (-1 to +1)
}

export const ParameterPanel: React.FC<ParameterPanelProps> = ({ code, onCodeChange }) => {
  const parsedParams = useMemo(() => parseParameters(code), [code]);

  // Local state for smooth slider movement
  // We use a log-scale slider where 0 is the initial value.
  const [localParams, setLocalParams] = useState<LocalParameterState[]>([]);

  const isEditingRef = React.useRef(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Sync upstream changes to local state
  useEffect(() => {
    // If we are actively dragging, ignore upstream echoes unless it seems like a new load.
    // However, after the drag finishes (and isEditingRef becomes false), we get a code update.
    // We must NOT reset the initialValue if the code update matches our current local value.

    if (!isEditingRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleSliderChange = (index: number, newSliderValue: number) => {
    isEditingRef.current = true;

    // Calculate new value immediately
    let computedValue: number;
    setLocalParams(prev => {
      const next = [...prev];
      const param = next[index];
      // Log scale calculation: Value = Initial * 10^(Slider)
      let val;
      if (param.initialValue === 0) {
        val = newSliderValue; // Simple linear around 0
      } else {
        val = param.initialValue * Math.pow(10, newSliderValue);
      }
      val = Number(val.toPrecision(4));
      computedValue = val; // Capture for timeout

      next[index] = { ...param, sliderValue: newSliderValue, value: val };
      return next;
    });

    // Debounce the heavy code update
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      // We use the computedValue captured from the drag event
      if (computedValue === undefined) return; // Should not happen

      // Find the parameter by name in the parsed parameters to get the correct line number
      const paramName = parsedParams[index]?.name;
      if (!paramName) return;

      const originalParam = parsedParams.find(p => p.name === paramName);

      if (originalParam) {
        const lines = code.split(/\r?\n/);
        const line = lines[originalParam.lineIndex];
        const nameRegex = new RegExp(`(${originalParam.name}\\s+)([\\d\\.eE\\-\\+]+)(.*)`);
        const match = line.match(nameRegex);

        if (match) {
          const newCodeLine = line.replace(nameRegex, `$1${computedValue}$3`);
          lines[originalParam.lineIndex] = newCodeLine;
          onCodeChange(lines.join('\n'));
        }
      }

      isEditingRef.current = false;
      timeoutRef.current = null;
    }, 100);
  };

  if (localParams.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-3 mt-4 border-t border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 dark:bg-slate-800/50 rounded-lg">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Parameter Sliders (Log Scale)
      </h3>
      <div className="flex flex-col gap-3 max-h-48 overflow-y-auto pr-2">
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
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-primary-500"
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
