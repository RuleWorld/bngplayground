import React, { useId } from 'react';

interface TooltipProps {
  children: React.ReactElement;
  content: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ children, content }) => {
  const tooltipId = useId();

  return (
    <div className="relative group flex items-center">
      {React.cloneElement(children as React.ReactElement<any>, {
        'aria-describedby': tooltipId,
      })}
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
