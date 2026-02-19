import React from 'react';
import { LayoutDashboard, Sparkles, CheckSquare, FolderOpen, LogOut, Sun, Moon, User } from 'lucide-react';
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
    <aside className="w-64 h-screen fixed left-0 top-0 border-r border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl flex flex-col z-50">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tighter text-zinc-100">
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
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                isActive
                  ? "text-white bg-zinc-900 border border-zinc-800"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-zinc-800/50 rounded-xl"
                  initial={false}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}

              <span className="relative z-10 flex items-center gap-3">
                <Icon className={cn("w-5 h-5", isActive ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300")} />
                {item.label}
              </span>

              {isActive && (
                <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800/60">
        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:border-zinc-700 transition-colors cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
              <User className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">Admin User</span>
              <span className="text-xs text-zinc-500">Director</span>
            </div>
          </div>
          {/* Mock Toggle - just visual */}
          <div className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors">
            <Moon className="w-4 h-4" />
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
