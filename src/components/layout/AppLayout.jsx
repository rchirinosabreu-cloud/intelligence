import React from 'react';
import Sidebar from './Sidebar';

const AppLayout = ({ children, activeTab, setActiveTab }) => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/20">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <main className="ml-64 p-8 min-h-screen relative z-0">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
          {children}
        </div>

        {/* Background Gradients/Effects */}
        <div className="fixed inset-0 pointer-events-none z-[-1]">
            <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-900/10 blur-[120px] rounded-full mix-blend-screen opacity-30" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-900/10 blur-[120px] rounded-full mix-blend-screen opacity-20" />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
