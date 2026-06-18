
import React from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDeterministicColor, getClientInitials } from '@/utils/avatarUtils';

/**
 * ClientAvatar - "Zero Image" Style.
 * Renders exclusively using deterministic initials and corporate colors.
 * Protocol: Initials (Deterministic BG) > Generic User Icon.
 */
const ClientAvatar = ({ client, className, variant = "md", size: customSize }) => {

    // Standardized variants
    const variants = {
        sm: 32,
        md: 40,
        lg: 56
    };

    const size = customSize || variants[variant] || variants.md;

    // Guard against missing client data
    if (!client || !client.name) {
        return (
            <div
                className={cn(
                    "flex items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700",
                    className
                )}
                style={{ width: size, height: size }}
            >
                <User size={size * 0.5} strokeWidth={2.5} />
            </div>
        );
    }

    const initials = getClientInitials(client.name);

    // Deterministic Rule: Strictly use ID as the primary hash seed for perpetual color consistency.
    const bgColor = getDeterministicColor(client.id || client.name);

    return (
        <div
            className={cn(
                "relative flex-shrink-0 rounded-full overflow-hidden border border-white/10 shadow-sm flex items-center justify-center transition-all",
                className
            )}
            style={{
                width: size,
                height: size,
                backgroundColor: bgColor
            }}
        >
            <span
                className="text-white font-black tracking-tighter select-none font-sans"
                style={{ fontSize: Math.max(size * 0.38, 11) }}
            >
                {initials || <User size={size * 0.5} strokeWidth={2.5} />}
            </span>
        </div>
    );
};

export default ClientAvatar;
