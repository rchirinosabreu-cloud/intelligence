
/**
 * BRAIN_COLORS - A professional and vibrant palette for deterministic client branding.
 * Restored to 10 colors to reduce visual collisions.
 */
export const BRAIN_COLORS = [
    "#F59E0B", // Amber 500
    "#3B82F6", // Blue 500
    "#10B981", // Emerald 500
    "#E11D48", // Rose 600
    "#009EB9",
    "#06B6D4", // Cyan 500
    "#EC4899", // Pink 500
    "#00AC8A",
    "#14B8A6", // Teal 500
    "#F43F5E", // Rose 500
];

/**
 * Generates a consistent hexadecimal color based on a string (strictly ID or Name).
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
