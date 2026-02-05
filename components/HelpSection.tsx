import React, { useState } from 'react';
import { InfoIcon } from './icons/InfoIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

interface HelpSectionProps {
  title: string;
  description: string;
  features?: string[];
  plotDescription?: string;
  className?: string;
}

export const HelpSection: React.FC<HelpSectionProps> = ({
  title,
  description,
  features,
  plotDescription,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`mb-4 overflow-hidden rounded-lg border border-blue-100 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-900/10 transition-all ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <InfoIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            About {title}
          </span>
        </div>
        <ChevronDownIcon 
          className={`h-4 w-4 text-blue-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>
      
      {isOpen && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
            {description}
          </p>
          
          {features && features.length > 0 && (
            <div className="space-y-1">
              <h5 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 opacity-70">
                Key Features
              </h5>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {features.map((feature, i) => (
                  <li key={i} className="text-xs text-blue-700 dark:text-blue-300 flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-blue-400" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {plotDescription && (
            <div className="rounded-md bg-white/60 dark:bg-slate-900/40 p-3 border border-blue-100/50 dark:border-blue-800/30">
              <h5 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 opacity-70 mb-1">
                Understanding the Plot
              </h5>
              <p className="text-xs text-blue-800 dark:text-blue-200 italic leading-relaxed">
                {plotDescription}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
