import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Menu, User, LogOut, Settings, Bell, Search, Sun, Moon, MessageSquare, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import TeamAvatar from '../ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const AppLayout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- REACT QUERY: USER DATA (To sync avatar globaly) ---
  const { data: userData } = useQuery({
    queryKey: ['user-data', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const res = await fetch(`${getApiBaseUrl()}/api/user/profile`);
      if (!res.ok) throw new Error("Failed to fetch user profile");
      return await res.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 60000 // 1 minute
  });

  const displayUser = userData || currentUser;

  // --- REACT QUERY: NOTIFICATIONS ---
  const {
    data: notifications = [],
    isLoading: loadingNotifications,
    refetch: refetchNotifications
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/notifications`, { cache: 'no-store' });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  // --- REACT QUERY: UNREAD COUNT ---
  const {
    data: unreadData = { count: 0 },
    refetch: refetchUnreadCount
  } = useQuery({
    queryKey: ['unreadNotificationsCount'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/notifications/unread-count`, { cache: 'no-store' });
      if (!res.ok) throw new Error("Failed to fetch unread count");
      return await res.json();
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = unreadData?.count || 0;

  useEffect(() => {
    const handleNotificationsRead = () => {
        queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    window.addEventListener('notifications-read', handleNotificationsRead);
    return () => {
        window.removeEventListener('notifications-read', handleNotificationsRead);
    };
  }, [queryClient]);

  const markAllAsRead = async () => {
      if (unreadCount === 0) return;

      // Optimistic update
      queryClient.setQueryData(['unreadNotificationsCount'], { count: 0 });
      queryClient.setQueryData(['notifications'], (prev) => prev?.map(n => ({ ...n, isRead: true })));

      try {
          await fetch(`${getApiBaseUrl()}/api/notifications/read-all`, { method: 'POST' });
      } catch (error) {
          console.error("Error marking as read:", error);
      }
  };

  const handleNotificationClick = async (notif) => {
    try {
        await fetch(`${getApiBaseUrl()}/api/notifications/${notif.id}/read`, { method: 'PATCH' });
        window.dispatchEvent(new Event('notifications-read'));
    } catch (e) {
        console.error("Error marking notification as read:", e);
    }

    if (notif.type === 'GENERAL_CHAT_MENTION') {
        window.dispatchEvent(new CustomEvent('open-general-chat'));
    } else if (notif.type === 'CAMPFIRE_MENTION') {
        navigate(`/cliente/${notif.relatedId}?openChat=true`);
    } else if (notif.type === 'ANNOUNCEMENT_CLIENT') {
        navigate(`/cliente/${notif.relatedId}`);
    } else if (notif.type === 'ANNOUNCEMENT_GLOBAL') {
        navigate(`/`);
    } else if (notif.type === 'TASK_RETURNED') {
        navigate(`/gestion?showReturned=true&taskId=${notif.relatedId}`);
    } else if (notif.type === 'TASK_CORRECTED' || notif.type === 'TASK_UPDATED' || notif.type === 'TASK_ASSIGNED') {
        navigate(`/gestion?taskId=${notif.relatedId}`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-primary/20 relative transition-colors duration-300 font-sans">
      {/* Ambient Glow Background - Fixed, z-0 */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          {/* Top Left Orb - Primary */}
          <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] rounded-full blur-[140px] opacity-40 animate-pulse-slow
            bg-primary/30 mix-blend-multiply dark:bg-primary/10 dark:mix-blend-screen"
          />

          {/* Bottom Right Orb - Primary */}
          <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full blur-[140px] opacity-40 animate-pulse-slow delay-1000
            bg-primary/20 mix-blend-multiply dark:bg-primary/10 dark:mix-blend-screen"
          />

          {/* Center Orb (Optional, smaller) - Fuchsia */}
           <div className="absolute top-[30%] left-[30%] w-[500px] h-[500px] rounded-full blur-[120px] opacity-20
             bg-zinc-200/30 mix-blend-multiply dark:bg-zinc-500/5 dark:mix-blend-screen"
           />
      </div>

      {/* Sidebar - z-[60] (Internal) */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Header - z-50 */}
      <header className="h-16 lg:pl-64 fixed top-0 left-0 right-0 z-50 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5 transition-all">
        <div className="h-full px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Abrir menú"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-400 border border-transparent focus-within:border-primary/20 transition-all">
              <Search className="w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar algo..."
                className="bg-transparent border-none outline-none text-xs text-zinc-900 dark:text-zinc-100 w-48"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="rounded-full"
            >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            <DropdownMenu onOpenChange={async (open) => {
                if (open) {
                    await refetchNotifications();
                    markAllAsRead();
                }
            }}>
              <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full relative"
                >
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-white dark:border-zinc-950" />
                    )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden rounded-2xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl z-[80]">
                <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Bell className="w-4 h-4 text-primary" />
                        Notificaciones
                    </h4>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    {loadingNotifications && notifications.length === 0 ? (
                        <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-400 mx-auto" /></div>
                    ) : notifications.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-12 h-12 rounded-full bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center mx-auto mb-3">
                                <Bell className="w-6 h-6 text-zinc-300 dark:text-zinc-600" />
                            </div>
                            <p className="text-xs text-zinc-400">No hay notificaciones nuevas</p>
                        </div>
                    ) : (
                        notifications.map((notif) => (
                            <DropdownMenuItem
                                key={notif.id}
                                onClick={() => handleNotificationClick(notif)}
                                className="p-4 focus:bg-zinc-50 dark:focus:bg-zinc-800/50 cursor-pointer border-b border-zinc-50 dark:border-zinc-800/30 last:border-0"
                            >
                                <div className="flex gap-3 items-start w-full">
                                    <div className="p-1.5 bg-primary/10 rounded-xl shrink-0 mt-0.5">
                                        <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                                            {notif.message}
                                        </p>
                                        <span className="text-[10px] text-zinc-400 mt-1 block">
                                            {new Date(notif.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {!notif.isRead && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                                    )}
                                </div>
                            </DropdownMenuItem>
                        ))
                    )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 transition-all outline-none">
                  <TeamAvatar
                    member={{ name: displayUser?.name, avatarUrl: displayUser?.avatarUrl }}
                    className="w-8 h-8"
                  />
                  <div className="hidden sm:flex flex-col text-left mr-2">
                    <span className="text-xs font-bold leading-none">{displayUser?.name}</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{displayUser?.role}</span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
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
                <DropdownMenuItem onClick={handleLogout} className="text-red-500 focus:text-red-500">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Cerrar Sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div
            className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm lg:hidden transition-all duration-300"
            onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area - z-0 (above background) */}
      <main className="lg:ml-64 pt-20 px-4 pb-4 md:px-8 md:pb-8 min-h-screen relative z-0 transition-all">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
