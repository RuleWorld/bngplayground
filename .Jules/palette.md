## 2024-05-19 - Run Button Disabled State Title
**Learning:** Found that when buttons are dynamically disabled due to missing state (e.g., waiting for model or simulating), providing a generic "Run simulation" title is unhelpful. Screen readers and users hovering won't know *why* the button is disabled.
**Action:** When a button is conditionally disabled, the title (native tooltip) should adapt to explicitly explain the blocking condition (e.g., 'Provide a valid model to run simulation' instead of just 'Run simulation').
