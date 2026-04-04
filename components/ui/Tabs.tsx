import React, { createContext, useContext, useState, Children } from 'react';

interface TabsContextType {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  onActiveIndexChange?: (index: number) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

export const Tabs: React.FC<{ children: React.ReactNode; activeIndex?: number; onActiveIndexChange?: (idx: number) => void }> = ({ children, activeIndex: activeIndexProp, onActiveIndexChange }) => {
  const isControlled = typeof activeIndexProp === 'number';
  const [uncontrolledIndex, setUncontrolledIndex] = useState(0);

  const resolvedActiveIndex = isControlled ? (activeIndexProp as number) : uncontrolledIndex;

  const setActiveIndex = (idx: number) => {
    if (!isControlled) {
      setUncontrolledIndex(idx);
    }
    if (onActiveIndexChange) onActiveIndexChange(idx);
  };
  return (
    <TabsContext.Provider value={{ activeIndex: resolvedActiveIndex, setActiveIndex, onActiveIndexChange }}>
      <div className="flex h-full min-h-0 flex-col">{children}</div>
    </TabsContext.Provider>
  );
};

function flattenChildren(children: React.ReactNode): React.ReactNode[] {
  const out: React.ReactNode[] = [];

  Children.forEach(children, (child) => {
    if (!child) return;

    if (React.isValidElement(child) && child.type === React.Fragment) {
      out.push(...flattenChildren((child as React.ReactElement<{ children: React.ReactNode }>).props.children));
      return;
    }

    out.push(child);
  });

  return out;
}

function isTabElement(node: React.ReactNode): node is React.ReactElement<TabProps> {
  if (!React.isValidElement(node)) return false;

  if (node.type === Tab) return true;

  const anyType = node.type as any;
  const name = anyType?.displayName ?? anyType?.name;
  return name === 'Tab';
}

interface TabProps {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  id?: string;
  ariaControls?: string;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export const Tab: React.FC<TabProps> = React.forwardRef<HTMLButtonElement, TabProps>(({ children, isActive, onClick, id, ariaControls, tabIndex, onKeyDown }, ref) => {
  const activeClasses = 'border-primary text-primary dark:text-primary-400';
  const inactiveClasses = 'border-transparent text-slate-500 hover:text-slate-700 hover:border-stone-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600';
  return (
    <button
      role="tab"
      id={id}
      aria-selected={isActive}
      aria-controls={ariaControls}
      tabIndex={tabIndex ?? (isActive ? 0 : -1)}
      onClick={onClick}
      onKeyDown={onKeyDown}
      ref={ref}
      className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${isActive ? activeClasses : inactiveClasses}`}
    >
      {children}
    </button>
  );
});

Tab.displayName = 'Tab';

export const TabList: React.FC<{ children: React.ReactNode; 'aria-label'?: string }> = ({ children, 'aria-label': ariaLabel = "Tabs" }) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabList must be used within a Tabs component');
  const { activeIndex, setActiveIndex } = context;

  const items = flattenChildren(children);
  const tabElements = items.filter(isTabElement);
  let tabIndexCount = -1;

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex: number | null = null;
    const tabCount = tabElements.length;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % tabCount;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + tabCount) % tabCount;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabCount - 1;
        break;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      setActiveIndex(nextIndex);
      // Let the re-render happen, then focus
      setTimeout(() => {
        const nextTabId = `tab-${nextIndex}`;
        document.getElementById(nextTabId)?.focus();
      }, 0);
    }
  };

  return (
    <div className="border-b border-stone-200 dark:border-slate-700">
      <div role="tablist" className="-mb-px flex space-x-6 overflow-x-auto" aria-label={ariaLabel}>
        {items.map((child, itemIdx) => {
          // Keys are required here because we're returning an array from `map`.
          const explicitKey = React.isValidElement(child) ? child.key : null;

          if (!isTabElement(child)) {
            // Allow non-tab elements (e.g., a "More" button) inside the row.
            if (!React.isValidElement(child)) return null;
            const key = explicitKey ?? `tablist-extra-${itemIdx}`;
            return React.cloneElement(child, { key });
          }

          tabIndexCount += 1;
          const currentIndex = tabIndexCount;
          const label = typeof child.props.children === 'string' ? child.props.children : undefined;
          const key = explicitKey ?? `tab-${label ?? currentIndex}`;

          return React.cloneElement(child, {
            key,
            id: `tab-${currentIndex}`,
            ariaControls: `tabpanel-${currentIndex}`,
            isActive: currentIndex === activeIndex,
            onClick: () => setActiveIndex(currentIndex),
            onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, currentIndex),
          });
        })}
      </div>
    </div>
  );
};

export const TabPanels: React.FC<{ children: React.ReactNode[] | React.ReactNode }> = ({ children }) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabPanels must be used within a Tabs component');

  const items = flattenChildren(children);
  const activeChild = items[context.activeIndex];

  return (
    <div className="mt-4 flex-1 min-h-0 overflow-hidden">
      {React.isValidElement(activeChild)
        ? React.cloneElement(activeChild as React.ReactElement<any>, { index: context.activeIndex })
        : activeChild}
    </div>
  );
};

export const TabPanel: React.FC<{ children: React.ReactNode; className?: string; index?: number }> = ({ children, className, index }) => {
  return (
    <div
      role="tabpanel"
      id={index !== undefined ? `tabpanel-${index}` : undefined}
      aria-labelledby={index !== undefined ? `tab-${index}` : undefined}
      tabIndex={0}
      className={`h-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${className || ''}`}
    >
      {children}
    </div>
  );
};
