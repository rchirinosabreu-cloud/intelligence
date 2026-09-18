import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LogOut, Settings, User } from '@/components/ui/icons';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';

const ACCOUNT_ROLE_LABELS = {
  ADMIN: 'Administración',
  PROJECT_MANAGER: 'Project manager',
  EDITOR: 'Equipo',
  MEMBER: 'Equipo'
};

// The team role («Director», «Community Manager») is what people recognise; the account role is only a fallback.
export const displayRoleFor = (user) => {
  const teamRole = typeof user?.teamRole === 'string' ? user.teamRole.trim() : '';
  if (teamRole) return teamRole;
  const role = user?.role;
  if (!role) return '';
  return ACCOUNT_ROLE_LABELS[role] || String(role).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
};

/**
 * Foto, nombre y rol de la persona, siempre visibles arriba del menú lateral, sin caja detrás.
 * También es el único menú de cuenta de la plataforma (Perfil, Ajustes, Cerrar sesión).
 */
const SidebarProfile = ({ className }) => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  // Same key as the shell so the avatar stays in sync after a profile update without a second request.
  const { data: userData } = useQuery({
    queryKey: ['user-data', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/user/profile`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error('Failed to fetch user profile');
      return response.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 60000
  });

  const user = userData || currentUser;
  if (!user) return null;
  const role = displayRoleFor(user);

  const handleLogout = () => {
    logout();
    navigate('/login');
    window.location.reload();
  };

  return (
    <div className={cn('flex flex-col items-center px-4 pb-3 pt-1 text-center', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Abrir menú de cuenta"
            className="group flex min-h-11 w-full flex-col items-center gap-2 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-white/50 focus-visible:ring-2 focus-visible:ring-primary/40 dark:hover:bg-white/5"
          >
            <span className="rounded-full p-1 transition-transform duration-300 group-hover:scale-[1.03]">
              <TeamAvatar
                member={{ id: user.id, userId: user.id, name: user.name, avatarUrl: user.avatarUrl }}
                size={72}
                ring
                showTitle={false}
                className="h-[72px] w-[72px] border-0 [&>span]:text-2xl"
              />
            </span>
            <span className="mt-1 max-w-full truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{user.name}</span>
            <span className="flex max-w-full items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              <span className="truncate">{role}</span>
              <ChevronDown className="h-3 w-3 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-56">
          <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/perfil')}>
            <User className="mr-2 h-4 w-4" />
            <span>Perfil</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/perfil')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Ajustes</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive brain-destructive-text focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Cerrar sesión</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default SidebarProfile;
