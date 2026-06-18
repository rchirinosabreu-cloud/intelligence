
import React, { useMemo } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDeterministicColor, getClientInitials } from '@/utils/avatarUtils';

/**
 * ClientAvatar - Exclusive "Zero Image" Style for Clients.
 * Performance optimized with useMemo to prevent main-thread lag in large lists (Kanban).
 * Eliminates ERR_HTTP2_PROTOCOL_ERROR by removing all image requests.
 */
const ClientAvatar = ({ client, className, variant = "md", size: customSize }) => {

    // Standardized variants
    const variants = {
        sm: 32,
        md: 40,
        lg: 56
    };

    const size = customSize || variants[variant] || variants.md;

    // Aislación Crítica: Cálculo memoizado para evitar bucles de renderizado y latencia
    const avatarData = useMemo(() => {
        if (!client || !client.name) return null;

        // Hashing strictly based on immutable ID when possible
        const seed = client.id || client.name;

        return {
            initials: getClientInitials(client.name),
            color: getDeterministicColor(seed)
        };
    }, [client?.id, client?.name]);

    // Guard against missing client data
    if (!client || !client.name || !avatarData) {
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

    return (
        <div
            className={cn(
                "relative flex-shrink-0 rounded-full overflow-hidden border border-white/10 shadow-sm flex items-center justify-center transition-transform duration-300",
                className
            )}
            style={{
                width: size,
                height: size,
                backgroundColor: avatarData.color
            }}
            data-entity-type="client"
        >
            <span
                className="text-white font-black tracking-tighter select-none font-sans"
                style={{ fontSize: Math.max(size * 0.38, 11) }}
            >
                {avatarData.initials || <User size={size * 0.5} strokeWidth={2.5} />}
            </span>
        </div>
    );
};

export default ClientAvatar;
