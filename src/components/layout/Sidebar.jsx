
import React from 'react';
import { LayoutDashboard, Sparkles, CheckSquare, FileText, Users, UserCheck, User, Moon, Sun, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import ChaosMeter from './ChaosMeter';

const Sidebar = ({ onLogout }) => {
  const { theme, toggleTheme } = useTheme();
  const { logout, currentUser } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, path: '/' },
    { id: 'bria', label: 'Bria Intelligence', icon: Sparkles, path: '/bria' },
    { id: 'tasks-native', label: 'Gestión', icon: CheckSquare, path: '/gestion' },
    { id: 'minutes', label: 'Minutas', icon: FileText, path: '/minutas' },
    { id: 'clients', label: 'Clientes', icon: Users, path: '/clientes' },
    { id: 'team', label: 'Equipo', icon: UserCheck, path: '/equipo' },
  ];

  return (
    <aside className={cn(
      "w-64 h-screen fixed left-0 top-0 z-50 flex flex-col transition-all duration-300",
      // Light Mode: Glassmorphism
      "bg-white/70 border-r border-zinc-200/50 backdrop-blur-xl shadow-sm",
      // Dark Mode: Glassmorphism
      "dark:bg-zinc-900/60 dark:border-white/10 dark:backdrop-blur-xl dark:shadow-[4px_0_24px_-12px_rgba(0,0,0,0.5)]"
    )}>
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          <img src="/brainstudio-logo.png" alt="Brainstudio" className="w-8 h-8 object-contain" />
          <span className="text-xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-100 drop-shadow-sm transition-colors">
            Brainstudio
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 relative">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) => cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group relative overflow-hidden border",
                isActive
                  ? "bg-primary/10 text-primary border-primary/20 shadow-sm dark:text-white dark:bg-white/10 dark:border-white/10 dark:shadow-sm backdrop-blur-md"
                  : "text-zinc-500 hover:text-zinc-900 hover:bg-white/40 border-transparent dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/5 dark:hover:border-white/5"
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5 rounded-xl opacity-100"
                      initial={false}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}

                  <span className="relative z-10 flex items-center gap-3 w-full">
                    <Icon className={cn(
                      "w-5 h-5 transition-colors duration-300",
                      isActive
                        ? "text-primary dark:text-primary-foreground drop-shadow-sm"
                        : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                    )} />
                    {item.label}
                  </span>

                  {isActive && (
                    <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)] animate-pulse" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-200/50 dark:border-white/5 bg-white/30 dark:bg-zinc-900/30 backdrop-blur-md transition-colors space-y-4">
        <ChaosMeter />

        <div
          onClick={() => {
              logout();
              if (onLogout) onLogout();
              window.location.reload();
          }}
          className="flex items-center justify-between p-3 rounded-xl bg-white/60 border border-zinc-200/50 shadow-sm hover:shadow-md hover:border-zinc-300/50 dark:bg-white/5 dark:border-white/5 dark:hover:bg-white/10 dark:hover:border-white/10 transition-all duration-300 cursor-pointer group backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-zinc-100 border border-zinc-200 dark:bg-zinc-800/80 dark:border-white/10 flex items-center justify-center shadow-inner transition-colors group-hover:bg-red-50 dark:group-hover:bg-red-900/20">
              <User className="w-4 h-4 text-zinc-500 dark:text-zinc-400 group-hover:text-red-500 transition-colors" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-200 group-hover:text-red-500 transition-colors">Cerrar sesión</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-500 group-hover:text-red-400 transition-colors">
                {currentUser?.name || 'Usuario'}
              </span>
            </div>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleTheme();
            }}
            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-primary dark:hover:bg-white/10 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
          >
             {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
