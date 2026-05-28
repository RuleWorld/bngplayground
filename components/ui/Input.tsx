import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={`block w-full rounded-md border-stone-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm focus:border-primary-500 dark:focus:border-primary-400 focus:ring-primary-500 dark:focus:ring-primary-400 sm:text-sm select-text ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
