## 2026-06-02 - Fix DOM-based XSS in VSCodeExportModal
**Vulnerability:** Potential DOM-based XSS via window.location.href assignment in components/VSCodeExportModal.tsx.
**Learning:** Directly assigning arbitrary input to window.location.href can lead to XSS if the input is a javascript: URI.
**Prevention:** Always validate and sanitize URLs before using them in contexts like window.location.href, ensuring they use expected, safe schemes.

## 2025-02-28 - Insecure Storage Fallback using Base64
**Vulnerability:** A fallback mechanism within `SecureStorage.setItem` encoded plaintext values using `btoa()` and saved them to `localStorage` when `globalThis.crypto` or `globalThis.indexedDB` APIs were unavailable (e.g. in insecure HTTP contexts or unsupported environments). This allowed sensitive data that should have been encrypted via AES-GCM to be stored in an easily reversible format (base64 is not encryption).
**Learning:** Always verify the security posture of fallback mechanisms. If an environment cannot provide the required security primitives (like Web Crypto API) to encrypt sensitive data, it is far safer to abort the storage operation and notify the user than to default to insecure plaintext equivalents like Base64 encoding.
**Prevention:** Remove insecure fallbacks entirely. Instead, use graceful degradation: detect feature unavailability early, log a clear warning, and prevent the unsafe write. Maintain decryption fallback mechanisms strictly for reading legacy data to ensure backward compatibility and avoid breaking changes for users with existing data.
