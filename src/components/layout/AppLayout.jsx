import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Menu, User, LogOut, Settings, Bell, Search, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Link, useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import TeamAvatar from '../ui/TeamAvatar';
import { cn } from '@/lib/utils';

const AppLayout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

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

      {/* Sidebar - z-50 */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Header - z-[70] */}
      <header className="h-16 lg:pl-64 fixed top-0 left-0 right-0 z-[70] bg-white/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200 dark:border-white/5 transition-all">
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

            <Button
                variant="ghost"
                size="icon"
                className="rounded-full relative"
            >
                <Bell className="w-4 h-4" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-white dark:border-zinc-950" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 transition-all outline-none">
                  <TeamAvatar
                    member={{ name: currentUser?.name, avatarUrl: currentUser?.avatarUrl }}
                    className="w-8 h-8"
                  />
                  <div className="hidden sm:flex flex-col text-left mr-2">
                    <span className="text-xs font-bold leading-none">{currentUser?.name}</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{currentUser?.role}</span>
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
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-all duration-300"
            onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area - z-0 (above background) */}
      <main className="lg:ml-64 pt-20 p-4 md:p-8 min-h-screen relative z-0 transition-all">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
