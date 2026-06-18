
import React, { useState } from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDeterministicColor, getClientInitials } from '@/utils/avatarUtils';

/**
 * ClientAvatar - A universal component for rendering client identities.
 * Protocol: Logo > Initials (Deterministic BG) > Generic User Icon.
 */
const ClientAvatar = ({ client, className, size = 40 }) => {
    const [imageError, setImageError] = useState(false);

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

    const isPlaceholder = client.logoUrl?.includes('ui-avatars.com');
    const proxyUrl = client.id ? `/api/clients/${client.id}/logo-image` : client.logoUrl;
    const finalSrc = isPlaceholder ? client.logoUrl : proxyUrl;

    return (
        <div
            className={cn(
                "relative flex-shrink-0 rounded-full overflow-hidden border border-white/10 shadow-sm flex items-center justify-center transition-all",
                className
            )}
            style={{ width: size, height: size, backgroundColor: !client.logoUrl || imageError ? bgColor : 'transparent' }}
        >
            {client.logoUrl && !imageError ? (
                <img
                    src={finalSrc}
                    alt={client.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        console.warn(`[ClientAvatar] Failed to load logo for: ${client.name}`);
                        setImageError(true);
                    }}
                />
            ) : (
                <span
                    className="text-white font-black tracking-tighter select-none"
                    style={{ fontSize: Math.max(size * 0.35, 10) }}
                >
                    {initials || <User size={size * 0.5} strokeWidth={2.5} />}
                </span>
            )}
        </div>
    );
};

export default ClientAvatar;
