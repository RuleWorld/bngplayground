## 2026-05-20 - Add aria-pressed to Scale Toggle Buttons
**Learning:** When UI elements function as visual toggles (like switching between Linear and Log scales) without standard checkbox/radio inputs, they require the `aria-pressed` attribute to explicitly convey their active toggle state to screen readers, fulfilling WCAG Success Criterion 4.1.2 (Name, Role, Value).
**Action:** Add `aria-pressed={condition}` to custom button-based toggles.
