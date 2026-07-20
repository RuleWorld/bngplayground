## 2024-07-20 - Missing Focus Styles on Interactive Elements
**Learning:** Custom interactive components, such as expand/collapse toggles and segmented controls (like the Custom Expressions Mode toggle), frequently lack `focus-visible` styling when they are built from scratch instead of standard button components. This makes keyboard navigation difficult.
**Action:** Always ensure that manually implemented interactive elements include explicit `focus-visible` outline or ring styles, along with appropriate `aria-label`s for screen readers.
