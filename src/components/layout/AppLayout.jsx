import React from 'react';
import Sidebar from './Sidebar';

const AppLayout = ({ children, activeTab, setActiveTab }) => {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-indigo-500/20 overflow-hidden relative transition-colors duration-300">
      {/* Ambient Glow Background - Fixed, z-0 (Dark Mode Only) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden hidden dark:block">
          {/* Top Left Orb - Indigo */}
          <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-indigo-500/10 blur-[140px] rounded-full opacity-40 mix-blend-screen animate-pulse-slow" />

          {/* Bottom Right Orb - Violet */}
          <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] bg-violet-600/10 blur-[140px] rounded-full opacity-40 mix-blend-screen animate-pulse-slow delay-1000" />

          {/* Center Orb (Optional, smaller) - Fuchsia */}
           <div className="absolute top-[30%] left-[30%] w-[500px] h-[500px] bg-fuchsia-500/5 blur-[120px] rounded-full opacity-20 mix-blend-screen" />
      </div>

      {/* Sidebar - z-50 */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area - z-10 (above background) */}
      <main className="ml-64 p-8 min-h-screen relative z-10">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700 slide-in-from-bottom-4">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
