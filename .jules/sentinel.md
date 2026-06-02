## 2026-06-02 - Fix DOM-based XSS in VSCodeExportModal
**Vulnerability:** Potential DOM-based XSS via window.location.href assignment in components/VSCodeExportModal.tsx.
**Learning:** Directly assigning arbitrary input to window.location.href can lead to XSS if the input is a javascript: URI.
**Prevention:** Always validate and sanitize URLs before using them in contexts like window.location.href, ensuring they use expected, safe schemes.
