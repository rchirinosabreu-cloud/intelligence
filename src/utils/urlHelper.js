/**
 * Ensures a URL has a protocol (defaults to https://).
 * @param {string} url - The URL string to sanitize.
 * @returns {string} - The sanitized URL.
 */
export const sanitizeUrl = (url) => {
    if (!url) return "";
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return `https://${trimmed}`;
};
