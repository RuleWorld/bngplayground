import React, { useState, useRef, useEffect } from 'react';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  direction?: 'up' | 'down';
  align?: 'left' | 'right';
}

import ReactDOM from 'react-dom';

export const Dropdown: React.FC<DropdownProps> = ({ trigger, children, direction = 'down', align = 'right' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Calculate position
  const updatePosition = React.useCallback(() => {
    if (isOpen && triggerRef.current && dropdownRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const dropdownRect = dropdownRef.current.getBoundingClientRect();
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

      // Default: align right edge of dropdown with right edge of trigger
      let left = align === 'left'
        ? triggerRect.left + scrollLeft
        : triggerRect.right + scrollLeft - dropdownRect.width;

      // Default: appear below
      let top = triggerRect.bottom + scrollTop + 4;
      let effectiveDirection: 'up' | 'down' = direction;

      if (direction === 'up') {
        top = triggerRect.top + scrollTop - dropdownRect.height - 4;
      }

      // Auto-flip if dropdown would overflow viewport
      const viewportTop = scrollTop + 4;
      const viewportBottom = scrollTop + window.innerHeight - 4;
      const wouldOverflowBottom = top + dropdownRect.height > viewportBottom;
      const wouldOverflowTop = top < viewportTop;

      if (effectiveDirection === 'down' && wouldOverflowBottom) {
        const upTop = triggerRect.top + scrollTop - dropdownRect.height - 4;
        if (upTop >= viewportTop) {
          top = upTop;
          effectiveDirection = 'up';
        }
      } else if (effectiveDirection === 'up' && wouldOverflowTop) {
        const downTop = triggerRect.bottom + scrollTop + 4;
        if (downTop + dropdownRect.height <= viewportBottom) {
          top = downTop;
          effectiveDirection = 'down';
        }
      }

      // Safety check: prevent going off-screen left
      if (left < scrollLeft + 4) {
        left = scrollLeft + 4;
      }
      // Safety check: prevent going off-screen right
      if (left + dropdownRect.width > window.innerWidth + scrollLeft - 4) {
        left = window.innerWidth + scrollLeft - dropdownRect.width - 4;
      }

      setCoords({ top, left });
    }
  }, [isOpen, direction, align]);

  // Initial calculation and listeners
  React.useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  return (
    <>
       <div className="inline-block" ref={triggerRef}>
        {React.isValidElement<{ onClick?: React.MouseEventHandler, 'aria-expanded'?: boolean, 'aria-haspopup'?: string, tabIndex?: number }>(trigger)
          ? React.cloneElement(trigger, {
              onClick: (e: React.MouseEvent) => {
                setIsOpen((prev) => !prev);
                // Call the original onClick if it exists
                if (trigger.props.onClick) {
                  trigger.props.onClick(e);
                }
              },
              'aria-expanded': isOpen,
              'aria-haspopup': 'menu',
              tabIndex: 0,
            })
          : <span onClick={() => setIsOpen((prev) => !prev)} tabIndex={0}>{trigger}</span>}
      </div>
      {isOpen && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          style={{
            top: coords.top,
            left: coords.left,
            position: 'absolute',
            zIndex: 9999
          }}
          className="w-auto min-w-[14rem] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-lg ring-1 ring-black/5 focus:outline-none"
          onClick={() => setIsOpen(false)}
        >
          <div className="py-1" role="menu" aria-orientation="vertical">
            {children}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export const DropdownItem: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => {
  return (
    <button
      {...props}
      className="block w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 focus:bg-slate-100 dark:focus:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
      role="menuitem"
    />
  );
};
