## 2024-03-24 - Icon Button Accessibility
**Learning:** Icon-only close buttons in modals often miss `aria-label`s, rendering them inaccessible to screen readers. Adding `aria-hidden="true"` to the SVG and `aria-label` to the button is a critical accessibility pattern for all modals.
**Action:** Always check modal/overlay components for close buttons and ensure they have semantic labels.
