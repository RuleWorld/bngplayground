## 2024-07-27 - Keyboard Navigation in Chart Controls
**Learning:** Interactive elements embedded within complex visual components (like toolbars below charts) are often overlooked for keyboard navigation support (focus rings). The primary buttons usually receive focus styling from UI components, but bespoke inline buttons often miss them.
**Action:** Always verify keyboard focus states (`focus-visible`) for custom inline controls (like scale toggles, filter toggles, and reset buttons) when building data visualization wrappers.
