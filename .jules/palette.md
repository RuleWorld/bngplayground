## 2024-05-16 - Added missing ARIA labels to various buttons
**Learning:** Found a pattern where multiple buttons in `FIMTab.tsx` and dropdown triggers across the app lacked accessible names, meaning screen reader users would hear identical or non-descriptive names for actions like exporting data.
**Action:** When creating new icon-only buttons or buttons whose text content is context-dependent or identical to others on the same page, always ensure a descriptive `aria-label` is included to maintain accessibility.
