## 2024-05-26 - ARIA-Pressed for Toggle Buttons
**Learning:** For UI components acting as toggle buttons (like "Code" vs "Design" modes or "All" vs "Search" filters), standard `onClick` changes are not enough for screen readers. Using `aria-pressed={boolean}` explicitly communicates the "on/off" or "active/inactive" state.
**Action:** Ensure that anytime a button toggles state and visually indicates it is active, it includes a matching `aria-pressed` attribute reflecting that internal state variable.
