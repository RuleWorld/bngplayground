## 2024-05-14 - Accessibility for icon-only removal buttons
**Learning:** Icon-only removal buttons (using characters like "×" or "✕") must explicitly include `aria-label` attributes to ensure screen readers do not announce them confusingly (e.g., as "multiplication X").
**Action:** Always add `aria-label` to removal buttons and ensure consistency across similar components (like `VerificationTab.tsx` and `ExpressionEvaluatorTab.tsx`).
