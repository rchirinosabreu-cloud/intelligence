import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, CheckSquare, Users, FileText, Settings, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

// Main Navigation Items
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'bria', label: 'Bria Intelligence', icon: MessageSquare, path: '/bria' },
  { id: 'tasks', label: 'Pendientes', icon: CheckSquare, path: '/tasks' },
  { id: 'clients', label: 'Clientes', icon: Users, path: '/clients' },
  { id: 'files', label: 'Archivos', icon: Folder, path: '/files', disabled: true }, // Placeholder
];

// Secondary Navigation (Bottom)
const BOTTOM_ITEMS = [
  { id: 'settings', label: 'Configuración', icon: Settings, path: '/settings', disabled: true },
];

const Sidebar = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  // Helper to determine active state
  // Active if exact match OR if it's a sub-route (e.g. /clients/sunpartners activates 'clients')
  const isActive = (path) => {
    if (path === '/dashboard' && currentPath === '/dashboard') return true;
    if (path !== '/dashboard' && currentPath.startsWith(path)) return true;
    return false;
  };

  return (
    <aside className="w-64 fixed inset-y-0 left-0 z-50 flex flex-col bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-r border-zinc-200 dark:border-zinc-800 transition-colors duration-300">

      {/* 1. Header / Logo Area */}
      <div className="h-16 flex items-center px-6 border-b border-zinc-100 dark:border-zinc-800/50">
        <div className="flex items-center gap-3 group cursor-pointer">
           <div className="relative">
             <div className="absolute inset-0 bg-indigo-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity duration-500 rounded-full"></div>
             <img src="/brainstudio-logo.png" alt="Brainstudio" className="w-8 h-8 relative z-10 rounded-lg shadow-sm" />
           </div>
           <div className="flex flex-col">
             <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm tracking-tight">Brainstudio</span>
             <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium tracking-wide">INTELLIGENCE</span>
           </div>
        </div>
      </div>

      {/* 2. Main Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 mb-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          Workspace
        </div>

        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;

          if (item.disabled) {
             return (
               <div key={item.id} className="flex items-center gap-3 px-3 py-2 text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-50">
                 <Icon className="w-4 h-4" />
                 <span className="text-sm font-medium">{item.label}</span>
               </div>
             )
          }

          return (
            <Link
              key={item.id}
              to={item.path}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group overflow-hidden",
                active
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200"
              )}
            >
              {active && (
                <div className="absolute left-0 w-1 h-6 bg-indigo-500 rounded-r-full" />
              )}

              <Icon className={cn(
                "w-4 h-4 transition-colors",
                active ? "text-indigo-600 dark:text-indigo-400" : "text-current"
              )} />

              <span className="text-sm font-medium relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 3. Footer / User Area */}
      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800/50 space-y-1">
        {BOTTOM_ITEMS.map((item) => (
           <div key={item.id} className="flex items-center gap-3 px-3 py-2 text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-50">
             <item.icon className="w-4 h-4" />
             <span className="text-sm font-medium">{item.label}</span>
           </div>
        ))}

        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold shadow-inner">
              TL
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">Team Lead</span>
              <span className="text-[10px] text-zinc-500">brainstudio.ai</span>
            </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
