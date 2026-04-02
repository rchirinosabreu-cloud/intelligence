import React from 'react';
import { cn } from '@/lib/utils';

/**
 * ClientLogo - A consistent component for client logos with caching support.
 *
 * @param {Object} props
 * @param {Object} props.client - The client object containing `id`, `name`, and `logoUrl`.
 * @param {string} props.className - Tailwind classes for sizing/styling.
 */
export default function ClientLogo({ client, className }) {
  if (!client) return null;

  const logoUrl = client.logoUrl;
  const isPlaceholder = logoUrl?.includes('ui-avatars.com');

  const src = isPlaceholder
    ? logoUrl
    : `/api/clients/${client.id}/logo-image`;

  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-white/5", className)}>
      <img
        src={src}
        alt={client.name}
        title={client.name}
        className="h-full w-full object-cover"
        onError={(e) => {
          e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(client.name)}&background=random&color=fff`;
        }}
      />
    </div>
  );
}
