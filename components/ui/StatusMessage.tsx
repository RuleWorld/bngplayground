import React, { useEffect } from 'react';
import { Status } from '../../types';
import { CheckCircleIcon } from '../icons/CheckCircleIcon';
import { ExclamationCircleIcon } from '../icons/ExclamationCircleIcon';
import { InfoIcon } from '../icons/InfoIcon';
import { XIcon } from '../icons/XIcon';

interface StatusMessageProps {
  status: Status;
  onClose: () => void;
}

const icons = {
  success: <CheckCircleIcon className="w-6 h-6 text-green-500" />,
  error: <ExclamationCircleIcon className="w-6 h-6 text-red-500" />,
  warning: <ExclamationCircleIcon className="w-6 h-6 text-yellow-500" />,
  info: <InfoIcon className="w-6 h-6 text-blue-500" />,
};

const colors = {
    success: 'bg-green-100 dark:bg-green-900/50 border-green-400 dark:border-green-600 text-green-800 dark:text-green-200',
    error: 'bg-red-100 dark:bg-red-900/50 border-red-400 dark:border-red-600 text-red-800 dark:text-red-200',
    warning: 'bg-yellow-100 dark:bg-yellow-900/50 border-yellow-400 dark:border-yellow-600 text-yellow-800 dark:text-yellow-200',
    info: 'bg-blue-100 dark:bg-blue-900/50 border-blue-400 dark:border-blue-600 text-blue-800 dark:text-blue-200',
}

export const StatusMessage: React.FC<StatusMessageProps> = ({ status, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 5000); // Auto-dismiss after 5 seconds
        return () => clearTimeout(timer);
    }, [onClose, status]);

    const isError = status.type === 'error';
    return (
        <div className={`flex items-center gap-4 p-4 rounded-lg border shadow-lg ${colors[status.type]} animate-fade-in-up`} role="alert" aria-live={isError ? "assertive" : "polite"}>
            {icons[status.type]}
            <p className="text-sm font-medium">{status.message}</p>
            <button 
              onClick={onClose} 
              className="ml-auto -mx-1.5 -my-1.5 p-1.5 rounded-lg focus:ring-2 inline-flex h-8 w-8 hover:bg-black/10 dark:hover:bg-white/10" 
              aria-label="Dismiss"
            >
                <XIcon className="w-5 h-5" />
            </button>
        </div>
    );
};
