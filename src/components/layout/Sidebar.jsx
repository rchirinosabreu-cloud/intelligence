
import React from 'react';
import { LayoutDashboard, Activity, CheckSquare, LayoutGrid, FileText, FolderOpen, Users, UserCheck, X, Zap, Map, FileBarChart, Brain, Palette, DollarSign, Target, ShieldCheck } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { NavLink } from 'react-router-dom';
import ChaosMeter from './ChaosMeter';
import SidebarProfile from './SidebarProfile';

/**
 * Menú lateral. En escritorio se puede **recoger a una franja estrecha** (`collapsed`): la barra no desaparece,
 * quedan los iconos de navegación y la foto de la persona, con el nombre del módulo en el tooltip
 * (decisión de Rodny, 21 de septiembre de 2026). En móvil sigue siendo off-canvas y siempre completo:
 * todo lo que cambia al recoger va en variantes `lg:`.
 */
const Sidebar = ({ isOpen, onClose, collapsed = false }) => {
  const { currentUser } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/', moduleKey: 'dashboard' },
    { id: 'brain-core', label: 'Manager', icon: Brain, path: '/manager', moduleKey: 'manager' },
    { id: 'tasks-native', label: 'Gestión', icon: CheckSquare, path: '/gestion', moduleKey: 'gestion' },
    { id: 'activity', label: 'Actividad', icon: Map, path: '/actividad', moduleKey: 'actividad' },
    { id: 'reports', label: 'Reportes', icon: FileBarChart, path: '/reportes', moduleKey: 'reportes' },
    { id: 'moodboard', label: 'Inspiración', icon: Palette, path: '/moodboard', moduleKey: 'inspiracion' },
    { id: 'content-grids', label: 'Parrillas', icon: LayoutGrid, path: '/parrillas', moduleKey: 'parrillas' },
    { id: 'minutes', label: 'Minutas', icon: FileText, path: '/minutas', moduleKey: 'minutas' },
    { id: 'drive', label: 'Drive', icon: FolderOpen, path: '/drive', moduleKey: 'minutas' },
    { id: 'crm', label: 'CRM', icon: Target, path: '/crm', moduleKey: 'crm' },
    { id: 'quotations', label: 'Cotizaciones', icon: DollarSign, path: '/cotizaciones', moduleKey: 'cotizaciones' },
    { id: 'financials', label: 'Financiero', icon: DollarSign, path: '/financiero', moduleKey: 'financiero' },
    { id: 'radar', label: 'Radar de Mérito', icon: Zap, path: '/radar', moduleKey: 'radar' },
    { id: 'clients', label: 'Clientes', icon: Users, path: '/clientes', moduleKey: 'clientes' },
    { id: 'team', label: 'Equipo', icon: UserCheck, path: '/equipo', moduleKey: 'equipo' },
    { id: 'operational-health', label: 'Salud Operativa', icon: Activity, path: '/salud-operativa', roles: ['ADMIN'] },
    { id: 'ai-governance', label: 'Gobierno de IA', icon: ShieldCheck, path: '/gobierno-ia', roles: ['ADMIN'] },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    // Admin always has access to everything
    if (currentUser?.role === 'ADMIN') return true;

    // Check Module Permissions first
    if (item.moduleKey) {
      const perms = currentUser?.modulePermissions || {};
      if (perms[item.moduleKey] !== true) return false;
    }

    // Role-based fallbacks for items without moduleKey
    if (item.roles && !item.roles.includes(currentUser?.role)) return false;
    if (item.hasFinancialAccess && currentUser?.hasFinancialAccess !== true) return false;

    return true;
  });

  return (
    <aside data-sidebar-collapsed={collapsed ? 'true' : undefined} className={cn(
      "fixed left-0 top-0 z-[60] flex h-[100dvh] w-[min(86vw,20rem)] flex-col overflow-hidden transition-[transform,width] duration-300",
      isOpen ? "translate-x-0" : "-translate-x-full",
      // Desktop: the sidebar never slides away; collapsed it becomes a rail of icons.
      "lg:translate-x-0",
      collapsed ? "lg:w-20" : "lg:w-64",
      "border-r border-zinc-200/70 bg-white shadow-xl lg:bg-white/70 lg:shadow-sm lg:backdrop-blur-xl",
      "dark:border-white/10 dark:bg-zinc-950 dark:shadow-[4px_0_24px_-12px_rgba(0,0,0,0.5)] lg:dark:bg-zinc-900/60 lg:dark:backdrop-blur-xl"
    )}>
      {/* Header */}
      <div className={cn("flex shrink-0 items-center justify-between px-5 py-4 sm:px-6 sm:py-5", collapsed && "lg:justify-center lg:px-0")}>
        <div className="flex items-center gap-3">
          <img src="/brainstudio-logo.png" alt="Brainstudio" className="w-8 h-8 object-contain" />
          <span className={cn(
            "text-xl font-bold tracking-tighter text-zinc-900 dark:text-zinc-100 drop-shadow-sm transition-colors",
            collapsed && "lg:hidden"
          )}>
            Brainstudio
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar menú"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 lg:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Person: photo, name and account menu, always visible above the navigation */}
      <SidebarProfile collapsed={collapsed} />

      {/* Navigation */}
      <nav className={cn("relative flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-4 py-3", collapsed && "lg:px-2")}>
        {filteredMenuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.id}
              to={item.path}
              // Collapsed: the module name is the tooltip, because the label is only for screen readers.
              title={collapsed ? item.label : undefined}
              onClick={() => {
                if (window.innerWidth < 1024) {
                  onClose();
                }
              }}
              className={({ isActive }) => cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group relative overflow-hidden border",
                collapsed && "lg:justify-center lg:gap-0 lg:px-0",
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

                  <span className={cn("relative z-10 flex items-center gap-3 w-full", collapsed && "lg:w-auto lg:gap-0")}>
                    <Icon className={cn(
                      "w-5 h-5 shrink-0 transition-colors duration-300",
                      isActive
                        ? "text-primary dark:text-primary-foreground drop-shadow-sm"
                        : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                    )} />
                    <span className={cn(collapsed && "lg:sr-only")}>{item.label}</span>
                  </span>

                  {isActive && (
                    <div className={cn(
                      "absolute right-3 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)] animate-pulse",
                      collapsed && "lg:hidden"
                    )} />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer: the streak widget needs its words, so the rail leaves it out (it returns when you expand). */}
      <div className={cn(
        "shrink-0 space-y-4 border-t border-zinc-200/50 bg-white/30 p-4 backdrop-blur-md transition-colors dark:border-white/5 dark:bg-zinc-900/30",
        collapsed && "lg:hidden"
      )}>
        <ChaosMeter />
      </div>
    </aside>
  );
};

export default Sidebar;
