import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Menu, User, LogOut, Settings, Bell, Search, Sun, Moon, MessageSquare, Loader2, RotateCcw, CheckCircle2, Zap, Star, Check, Eye } from '@/components/ui/icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import TeamAvatar from '../ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { getNotificationDisplayParts } from '@/utils/notificationUtils';

const AppLayout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isSidebarOpen ? 'hidden' : '';

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSidebarOpen]);

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

  // Keep local storage synchronized with latest backend profile permissions
  useEffect(() => {
    if (userData) {
      localStorage.setItem('currentUser', JSON.stringify(userData));
      sessionStorage.setItem('currentUser', JSON.stringify(userData));
    }
  }, [userData]);

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
    enabled: !!currentUser?.id,
    refetchInterval: currentUser?.id ? () => (document.hidden ? false : 60000) : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

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
    setIsNotificationsOpen(false);

    if (!notif.isRead) {
        try {
            await fetch(`${getApiBaseUrl()}/api/notifications/${notif.id}/read`, { method: 'PATCH' });
            queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
            queryClient.setQueryData(['notifications'], (prev) =>
                prev?.map(n => n.id === notif.id ? { ...n, isRead: true } : n)
            );
        } catch (e) {
            console.error("Error marking notification as read:", e);
        }
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
    } else if (notif.type === 'TASK_CORRECTED' || notif.type === 'TASK_UPDATED' || notif.type === 'TASK_ASSIGNED' || notif.type === 'TASK_MENTION' || notif.type === 'TASK_COMMENT' || notif.type === 'TASK_COMMENT_REPLY') {
        navigate(`/gestion?taskId=${notif.taskId || notif.relatedId}`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-primary/20 relative transition-colors duration-300 font-sans">
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
                aria-label="Buscar en Brainstudio"
                onChange={(e) => {
                    window.dispatchEvent(new CustomEvent('global-search-changed', { detail: { query: e.target.value } }));
                }}
                className="bg-transparent border-none outline-none text-xs text-zinc-900 dark:text-zinc-100 w-48"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="rounded-full h-11 w-11"
                aria-label="Cambiar tema"
            >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            <DropdownMenu open={isNotificationsOpen} onOpenChange={async (open) => {
                setIsNotificationsOpen(open);
                if (open) {
                    await refetchNotifications();
                }
            }}>
              <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full relative h-11 w-11"
                    aria-label="Abrir notificaciones"
                >
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-white dark:border-zinc-950 animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
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
                        notifications.map((notif) => {
                            const display = getNotificationDisplayParts(notif);
                            let Icon = MessageSquare;
                            let bgColor = "bg-primary/10";
                            let iconColor = "text-primary";

                            if (notif.type === 'TASK_RETURNED') {
                                Icon = RotateCcw;
                                bgColor = "bg-red-500/10";
                                iconColor = "text-red-500";
                            } else if (notif.type === 'TASK_CORRECTED' || notif.type === 'TASK_COMPLETED') {
                                Icon = CheckCircle2;
                                bgColor = "bg-emerald-500/10";
                                iconColor = "text-emerald-500";
                            } else if (notif.type === 'TASK_ASSIGNED' && notif.message.includes('PRIORITARIA')) {
                                Icon = Zap;
                                bgColor = "bg-orange-500/10";
                                iconColor = "text-orange-500";
                            } else if (notif.type === 'TASK_ASSIGNED' && notif.message.includes('ESPECIAL')) {
                                Icon = Star;
                                bgColor = "bg-purple-500/10";
                                iconColor = "text-purple-500";
                            } else if (notif.type === 'TASK_UPDATED') {
                                if (notif.message.includes('PRIORITARIA')) {
                                    Icon = Zap;
                                    bgColor = "bg-orange-500/10";
                                    iconColor = "text-orange-500";
                                } else if (notif.message.includes('ESPECIAL')) {
                                    Icon = Star;
                                    bgColor = "bg-purple-500/10";
                                    iconColor = "text-purple-500";
                                }
                            }

                            return (
                                <DropdownMenuItem
                                    key={notif.id}
                                    onClick={() => handleNotificationClick(notif)}
                                    className={cn(
                                        "p-4 focus:bg-zinc-50 dark:focus:bg-zinc-800/50 cursor-pointer border-b border-zinc-50 dark:border-zinc-800/30 last:border-0 relative group/item",
                                        notif.isRead ? "opacity-60" : "bg-primary/[0.02]"
                                    )}
                                >
                                    <div className="flex gap-3 items-start w-full pr-12">
                                        {!notif.isRead && (
                                            <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2 animate-pulse" />
                                        )}
                                        <div className={cn("p-1.5 rounded-xl shrink-0 mt-0.5", bgColor)}>
                                            <Icon className={cn("w-3.5 h-3.5", iconColor)} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="space-y-0.5">
                                                <p className={cn(
                                                    "text-xs leading-snug transition-colors font-black",
                                                    notif.isRead ? "text-zinc-600 dark:text-zinc-300" : "text-zinc-900 dark:text-white"
                                                )}>
                                                    {display.title}
                                                </p>
                                                {display.context && (
                                                    <p className={cn(
                                                        "text-[11px] leading-snug font-semibold line-clamp-2",
                                                        notif.isRead ? "text-zinc-500 dark:text-zinc-500" : "text-zinc-700 dark:text-zinc-300"
                                                    )}>
                                                        {display.context}
                                                    </p>
                                                )}
                                                {display.body && (
                                                    <p className={cn(
                                                        "text-[11px] leading-snug font-medium line-clamp-2",
                                                        notif.isRead ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-600 dark:text-zinc-400"
                                                    )}>
                                                        {display.body}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-zinc-400 mt-1 block font-medium">
                                                {new Date(notif.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Inline Actions */}
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100 sm:group-focus-within/item:opacity-100 transition-opacity">
                                        {notif.taskId && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="min-w-11 min-h-11 rounded-full bg-white dark:bg-zinc-800 shadow-sm border border-zinc-100 dark:border-zinc-700"
                                                aria-label="Ver tarea"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    setIsNotificationsOpen(false);
                                                    navigate(`/gestion?taskId=${notif.taskId}`);
                                                }}
                                                title="Ver tarea"
                                            >
                                                <Eye className="w-3.5 h-3.5 text-zinc-500" />
                                            </Button>
                                        )}
                                        {!notif.isRead && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="min-w-11 min-h-11 rounded-full bg-white dark:bg-zinc-800 shadow-sm border border-zinc-100 dark:border-zinc-700"
                                                aria-label="Marcar notificación como leída"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    try {
                                                        await fetch(`${getApiBaseUrl()}/api/notifications/${notif.id}/read`, { method: 'PATCH' });
                                                        queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount'] });
                                                        queryClient.setQueryData(['notifications'], (prev) =>
                                                            prev?.map(n => n.id === notif.id ? { ...n, isRead: true } : n)
                                                        );
                                                    } catch (err) {
                                                        console.error("Error marking as read:", err);
                                                    }
                                                }}
                                                title="Marcar como leída"
                                            >
                                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                            </Button>
                                        )}
                                    </div>
                                </DropdownMenuItem>
                            );
                        })
                    )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex min-h-11 items-center gap-3 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 transition-all outline-none"
                  aria-label="Abrir menú de cuenta"
                >
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
      <main className="relative z-0 min-h-screen min-w-0 overflow-x-clip px-4 pb-4 pt-20 transition-all md:px-8 md:pb-8 lg:ml-64">
        <div className="mx-auto min-w-0 max-w-7xl space-y-8 animate-in fade-in duration-700">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
