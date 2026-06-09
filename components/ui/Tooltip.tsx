import React from 'react';

interface TooltipProps {
  children: React.ReactElement;
  content: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ children, content }) => {
  const tooltipId = React.useId();

  return (
    <div className="relative group flex items-center">
      {React.cloneElement(children, { 'aria-describedby': tooltipId } as Record<string, unknown>)}
      <div
        id={tooltipId}
        role="tooltip"
        className="absolute bottom-full mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded-md px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10"
      >
        {content}
      </div>
    </div>
  );
};
