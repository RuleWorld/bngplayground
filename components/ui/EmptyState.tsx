import React from 'react';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
        icon?: React.ReactNode;
    };
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    action,
    className = ""
}) => {
    return (
        <div className={`flex flex-col items-center justify-center p-8 text-center h-full min-h-[300px] ${className}`}>
            {icon && (
                <div className="mb-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 dark:text-slate-300">
                    {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-8 h-8" })}
                </div>
            )}

            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                {title}
            </h3>

            <p className="text-sm text-slate-500 dark:text-slate-300 max-w-sm mb-6 leading-relaxed">
                {description}
            </p>

            {action && (
                <button
                    onClick={action.onClick}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm transition-all active:scale-95"
                >
                    {action.icon}
                    {action.label}
                </button>
            )}
        </div>
    );
};
