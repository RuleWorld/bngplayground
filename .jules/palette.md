## 2026-05-20 - Add aria-pressed to Scale Toggle Buttons
**Learning:** When UI elements function as visual toggles (like switching between Linear and Log scales) without standard checkbox/radio inputs, they require the `aria-pressed` attribute to explicitly convey their active toggle state to screen readers, fulfilling WCAG Success Criterion 4.1.2 (Name, Role, Value).
**Action:** Add `aria-pressed={condition}` to custom button-based toggles.
## 2024-05-21 - [Aria-pressed on toggle buttons]
**Learning:** Using `aria-pressed` for visual toggle buttons (like "Simulation Method" or "Network View Mode") correctly signals their mutually exclusive active states to screen readers. Grouping them with `role="group"` and an `aria-labelledby` or `aria-label` attribute provides the required semantic container.
**Action:** Always apply `aria-pressed` instead of modifying `aria-label` dynamically for standard state toggles to maintain consistency and adhere to WCAG standards.
