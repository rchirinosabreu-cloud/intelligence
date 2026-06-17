
/**
 * BRAIN_COLORS - A professional and vibrant palette for deterministic client branding.
 */
export const BRAIN_COLORS = [
    "#F59E0B", // Amber 500
    "#3B82F6", // Blue 500
    "#10B981", // Emerald 500
    "#E11D48", // Rose 600
    "#8B5CF6", // Violet 500
    "#06B6D4", // Cyan 500
    "#EC4899", // Pink 500
    "#6366F1", // Indigo 500
    "#14B8A6", // Teal 500
    "#F43F5E", // Rose 500
];

/**
 * Generates a consistent hexadecimal color based on a string (ID or Name).
 */
export const getDeterministicColor = (input) => {
    if (!input) return BRAIN_COLORS[0];

    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = input.charCodeAt(i) + ((hash << 5) - hash);
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
