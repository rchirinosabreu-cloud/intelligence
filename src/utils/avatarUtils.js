
/**
 * BRAIN_COLORS - A professional and vibrant palette for deterministic client branding.
 * Limited to 5 primary corporate colors for consistent "Zero Image" style.
 */
export const BRAIN_COLORS = [
    "#F59E0B", // Amber 500
    "#3B82F6", // Blue 500
    "#10B981", // Emerald 500
    "#8B5CF6", // Violet 500
    "#E11D48", // Rose 600
];

/**
 * Generates a consistent hexadecimal color based on a string (strictly ID or Name).
 * Uses a modulo of 5 to align with the refined palette.
 */
export const getDeterministicColor = (input) => {
    if (!input) return BRAIN_COLORS[0];

    // Ensure input is a string
    const str = String(input);

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % BRAIN_COLORS.length;
    return BRAIN_COLORS[index];
};

/**
 * Extracts uppercase initials from a client name.
 */
export const getClientInitials = (name) => {
    if (!name || typeof name !== 'string') return "";

    const trimmed = name.trim();
    if (!trimmed) return "";

    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();

    // Take first letter of first and last word
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
