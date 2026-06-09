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
  dataTabIndex?: number;
}

export const Tab: React.FC<TabProps> = ({ children, isActive, onClick, dataTabIndex }) => {
  const activeClasses = 'border-primary text-primary dark:text-primary-300';
  const inactiveClasses = 'border-transparent text-slate-500 hover:text-slate-700 hover:border-stone-300 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:border-slate-500';
  return (
    <button
      id={`tab-${dataTabIndex}`}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`tabpanel-${dataTabIndex}`}
      onClick={onClick}
      data-tab-index={dataTabIndex}
      className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${isActive ? activeClasses : inactiveClasses}`}
    >
      {children}
    </button>
  );
};

Tab.displayName = 'Tab';

export const TabList: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabList must be used within a Tabs component');
  const { activeIndex, setActiveIndex } = context;
  const navRef = React.useRef<HTMLElement>(null);

  const items = flattenChildren(children);
  let currentTabIndex = 0;

  const getTabButtons = React.useCallback(() => {
    if (!navRef.current) return [] as HTMLElement[];
    return Array.from(navRef.current.querySelectorAll<HTMLElement>('[role="tab"]'));
  }, []);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    const tabs = getTabButtons();
    if (tabs.length === 0) return;

    const currentIdx = tabs.findIndex(tab => tab === document.activeElement);
    let nextIdx = 0;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        nextIdx = (currentIdx + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        e.preventDefault();
        nextIdx = 0;
        break;
      case 'End':
        e.preventDefault();
        nextIdx = tabs.length - 1;
        break;
      default:
        return;
    }

    tabs[nextIdx]?.focus();
    const dataIdx = tabs[nextIdx]?.getAttribute('data-tab-index');
    if (dataIdx !== null) {
      setActiveIndex(Number(dataIdx));
    }
  }, [getTabButtons, setActiveIndex]);

  return (
    <div className="border-b border-stone-200 dark:border-slate-700">
      <nav ref={navRef} className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs" role="tablist" onKeyDown={handleKeyDown}>
        {items.map((child, itemIdx) => {
          // Keys are required here because we're returning an array from `map`.
          const explicitKey = React.isValidElement(child) ? child.key : null;

          if (!isTabElement(child)) {
            // Allow non-tab elements (e.g., a "More" button) inside the row.
            if (!React.isValidElement(child)) return null;
            const key = explicitKey ?? `tablist-extra-${itemIdx}`;
            return React.cloneElement(child, { key });
          }

          const currentIndex = currentTabIndex;
          currentTabIndex++;

          const label = typeof child.props.children === 'string' ? child.props.children : undefined;
          const key = explicitKey ?? `tab-${label ?? currentIndex}`;

          return React.cloneElement(child, {
            key,
            isActive: currentIndex === activeIndex,
            onClick: () => setActiveIndex(currentIndex),
            dataTabIndex: currentIndex,
          });
        })}
      </nav>
    </div>
  );
};

export const TabPanels: React.FC<{ children: React.ReactNode[] | React.ReactNode }> = ({ children }) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabPanels must be used within a Tabs component');

  const items = flattenChildren(children);
  const activeItem = items[context.activeIndex];

  // Clone the active panel to add aria-labelledby
  if (React.isValidElement(activeItem)) {
    const tabId = `tab-${context.activeIndex}`;
    return (
      <div className="mt-4 flex-1 min-h-0 overflow-hidden">
        {React.cloneElement(activeItem as React.ReactElement<any>, {
          'aria-labelledby': tabId,
          id: `tabpanel-${context.activeIndex}`,
        })}
      </div>
    );
  }

  return <div className="mt-4 flex-1 min-h-0 overflow-hidden">{activeItem}</div>;
};

export const TabPanel: React.FC<{ children: React.ReactNode; className?: string; 'aria-labelledby'?: string; id?: string }> = ({ children, className, 'aria-labelledby': ariaLabelledBy, id }) => {
  return <div id={id} role="tabpanel" aria-labelledby={ariaLabelledBy} className={`h-full ${className || ''}`}>{children}</div>;
};
