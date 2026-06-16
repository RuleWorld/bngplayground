import React, { useEffect, useRef, useCallback } from 'react';
import { XIcon } from '../icons/XIcon';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'lg' }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  
  // Use a ref for the onClose callback to prevent unstable references from triggering useEffect churn
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => el.offsetParent !== null);
  }, []);

  // Effect 1: Programmatic focus-on-mount (only runs once when modal opens)
  useEffect(() => {
    if (!isOpen) return;

    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      const firstInput = focusable.find(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (firstInput) {
        firstInput.focus();
      } else {
        focusable[0].focus();
      }
    }
  }, [isOpen, getFocusableElements]);

  // Effect 2: Setup event listeners for accessibility key bindings (runs once per open lifecycle)
  useEffect(() => {
    if (!isOpen) return;

    // Store previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (event.shiftKey) {
        // Shift + Tab: if on first element, wrap to last
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener('keydown', handleEsc);
    window.addEventListener('keydown', handleTabKey);
    return () => {
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('keydown', handleTabKey);
      // Restore focus to previously focused element
      previousFocusRef.current?.focus();
    };
  }, [isOpen, getFocusableElements]);

  if (!isOpen) return null;

  const sizeClasses = {
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      '2xl': 'max-w-2xl',
      '3xl': 'max-w-3xl',
  };

   return (
    <div
          className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4"
          onClick={onClose}
          aria-modal="true"
          role="dialog"
          aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className={`bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-50 rounded-lg shadow-xl w-full ${sizeClasses[size]} flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className="flex justify-between items-center p-4 border-b border-stone-200 dark:border-slate-700">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close modal"
            title="Close modal"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto text-slate-700 dark:text-slate-100">
            {children}
        </div>
      </div>
    </div>
  );
};
