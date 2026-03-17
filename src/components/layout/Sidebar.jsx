
import React from 'react';
import { LayoutDashboard, Sparkles, CheckSquare, FileText, BarChart3, Users, UserCheck, User, Moon, Sun, Bell, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { NavLink, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import ChaosMeter from './ChaosMeter';
import TeamAvatar from '../ui/TeamAvatar';

const Sidebar = ({ isOpen, onClose }) => {
  const { theme, toggleTheme } = useTheme();
  const { currentUser } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, path: '/' },
    { id: 'bria', label: 'Bria Intelligence', icon: Sparkles, path: '/bria' },
    { id: 'tasks-native', label: 'Gestión', icon: CheckSquare, path: '/gestion' },
    { id: 'minutes', label: 'Minutas', icon: FileText, path: '/minutas' },
    { id: 'metrics', label: 'Métricas', icon: BarChart3, path: '/metricas' },
    { id: 'clients', label: 'Clientes', icon: Users, path: '/clientes' },
    { id: 'team', label: 'Equipo', icon: UserCheck, path: '/equipo' },
  ];

  return (
    <aside className={cn(
      "w-64 h-screen fixed left-0 top-0 z-50 flex flex-col transition-all duration-300 transform lg:translate-x-0 lg:static lg:h-full",
      isOpen ? "translate-x-0" : "-translate-x-full",
      // Light Mode: Glassmorphism
      "bg-white/70 border-r border-zinc-200/50 backdrop-blur-xl shadow-sm",
      // Dark Mode: Glassmorphism
      "dark:bg-zinc-900/60 dark:border-white/10 dark:backdrop-blur-xl dark:shadow-[4px_0_24px_-12px_rgba(0,0,0,0.5)]",
      // Mobile positioning
      "fixed lg:fixed"
    )}>
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/brainstudio-logo.png" alt="Brainstudio" className="w-8 h-8 object-contain" />
          <span className="text-xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-100 drop-shadow-sm transition-colors">
            Brainstudio
          </span>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 relative">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.id}
              to={item.path}
              onClick={() => {
                if (window.innerWidth < 1024) {
                  onClose();
                }
              }}
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

        {/* Simple User Indicator for Sidebar */}
        <div className="px-4 py-3 rounded-2xl bg-white/40 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <TeamAvatar
                    member={{ name: currentUser?.name, avatarUrl: currentUser?.avatarUrl }}
                    className="w-8 h-8"
                />
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{currentUser?.name}</span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Conectado</span>
                </div>
            </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
