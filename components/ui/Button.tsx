import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-50 disabled:pointer-events-none px-4 py-2';
    
    const variantClasses = {
      primary: 'bg-primary text-white hover:bg-primary-600 focus:ring-primary-500',
      secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600 focus:ring-slate-400 dark:focus:ring-slate-500',
      ghost: 'hover:bg-slate-100 dark:hover:bg-slate-700 focus:ring-slate-400 dark:focus:ring-slate-500 text-slate-800 dark:text-slate-200',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
    };

    const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${className}`;

    return <button className={combinedClasses} ref={ref} {...props} />;
  }
);
Button.displayName = 'Button';
