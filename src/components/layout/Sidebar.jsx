import React from 'react';
import { LayoutDashboard, Sparkles, CheckSquare, FolderOpen, User, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'bria', label: 'Bria Intelligence', icon: Sparkles },
    { id: 'tasks', label: 'Pendientes', icon: CheckSquare },
    { id: 'files', label: 'Archivos', icon: FolderOpen },
  ];

  return (
    <aside className="w-64 h-screen fixed left-0 top-0 z-50 flex flex-col border-r border-white/5 bg-zinc-950/40 backdrop-blur-xl shadow-[4px_0_24px_-12px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tighter text-zinc-100 drop-shadow-sm">
            Brainstudio
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 group relative overflow-hidden",
                isActive
                  ? "text-white bg-white/5 border border-white/10 shadow-sm backdrop-blur-md"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5 hover:border-white/5 border border-transparent"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-violet-500/5 rounded-xl opacity-100"
                  initial={false}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}

              <span className="relative z-10 flex items-center gap-3">
                <Icon className={cn("w-5 h-5 transition-colors duration-300", isActive ? "text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "text-zinc-500 group-hover:text-zinc-300")} />
                {item.label}
              </span>

              {isActive && (
                <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 bg-zinc-950/20 backdrop-blur-sm">
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all duration-300 cursor-pointer group shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-zinc-800/80 flex items-center justify-center border border-white/10 shadow-inner">
              <User className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">Admin User</span>
              <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition-colors">Director</span>
            </div>
          </div>
          {/* Mock Toggle - just visual */}
          <div className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors">
            <Moon className="w-4 h-4" />
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
