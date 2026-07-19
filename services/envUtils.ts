/**
 * envUtils.ts — shared reader for Vite build-time environment variables.
 *
 * Several services read optional configuration (API base URLs, feature flags)
 * from `import.meta.env`. This centralises the access so the null/blank/trim
 * handling is consistent and the `import.meta.env` typing lives in one place.
 */

/**
 * Read a string environment variable from `import.meta.env`, returning the
 * trimmed value or `null` if it is missing, blank, or non-string. Never throws.
 */
export function getEnvString(name: string): string | null {
    try {
        const value = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.[name];
        return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
    } catch {
        return null;
    }
}
