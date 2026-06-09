import React from 'react';

interface RadioGroupProps {
    name: string;
    options: { label: string; value: string }[];
    value: string;
    onChange: (value: string) => void;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({ name, options, value, onChange }) => (
    <div role="radiogroup" aria-label={name} className="flex items-center gap-4 py-1">
        {options.map(option => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                    type="radio"
                    name={name}
                    value={option.value}
                    checked={value === option.value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-4 w-4 text-primary focus:ring-primary-500 border-stone-300 dark:border-slate-600 dark:bg-slate-800"
                />
                <span>{option.label}</span>
            </label>
        ))}
    </div>
);
