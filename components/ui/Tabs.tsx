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
      out.push(...flattenChildren(child.props.children));
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
}

export const Tab: React.FC<TabProps> = ({ children, isActive, onClick }) => {
  const activeClasses = 'border-primary text-primary dark:text-primary-400';
  const inactiveClasses = 'border-transparent text-slate-500 hover:text-slate-700 hover:border-stone-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600';
  return (
    <button
      onClick={onClick}
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

  const items = flattenChildren(children);
  let tabIndex = -1;

  return (
    <div className="border-b border-stone-200 dark:border-slate-700">
      <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Tabs">
        {items.map((child) => {
          if (!isTabElement(child)) {
            // Allow non-tab elements (e.g., a "More" button) inside the row.
            return React.isValidElement(child) ? child : null;
          }

          tabIndex += 1;
          const currentIndex = tabIndex;

          return React.cloneElement(child, {
            isActive: currentIndex === activeIndex,
            onClick: () => setActiveIndex(currentIndex),
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
  return <div className="mt-4 flex-1 min-h-0 overflow-hidden">{items[context.activeIndex]}</div>;
};

export const TabPanel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  return <div className={`h-full ${className || ''}`}>{children}</div>;
};
