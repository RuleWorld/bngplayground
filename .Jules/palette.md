## 2023-10-18 - Missing focus styles
**Learning:** Interactive list items/buttons that rely on visual grouping and hover states often inadvertently drop `focus-visible` styling, hindering keyboard accessibility (e.g. `RuleCartoon.tsx`).
**Action:** Always test components by tabbing through them to ensure clear focus visibility using `focus-visible:ring-2`.
