import React from 'react';
import Sidebar from './Sidebar';

const AppLayout = ({ children, activeTab, setActiveTab }) => {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-indigo-500/20 overflow-hidden relative transition-colors duration-300">
      {/* Ambient Glow Background - Fixed, z-0 */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          {/* Top Left Orb - Indigo */}
          <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] rounded-full blur-[140px] opacity-40 animate-pulse-slow
            bg-indigo-300/30 mix-blend-multiply dark:bg-indigo-500/10 dark:mix-blend-screen"
          />

          {/* Bottom Right Orb - Violet */}
          <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full blur-[140px] opacity-40 animate-pulse-slow delay-1000
            bg-violet-300/30 mix-blend-multiply dark:bg-violet-600/10 dark:mix-blend-screen"
          />

          {/* Center Orb (Optional, smaller) - Fuchsia */}
           <div className="absolute top-[30%] left-[30%] w-[500px] h-[500px] rounded-full blur-[120px] opacity-20
             bg-fuchsia-200/30 mix-blend-multiply dark:bg-fuchsia-500/5 dark:mix-blend-screen"
           />
      </div>

      {/* Sidebar - z-50 */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area - z-10 (above background) */}
      <main className="ml-64 p-8 min-h-screen relative z-10">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
