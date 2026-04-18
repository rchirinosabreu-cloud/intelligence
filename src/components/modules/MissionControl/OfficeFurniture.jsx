import React from 'react';

/**
 * Isometric Furniture components for the Brainstudio Virtual Office.
 */

// Common isometric styles
const isoStyle = {
  transform: 'rotateX(60deg) rotateZ(45deg)',
  transformStyle: 'preserve-3d',
};

export const Desk = ({ color = "#f8fafc", children }) => (
  <div className="relative w-32 h-20 group transition-transform duration-500" style={{ transformStyle: 'preserve-3d' }}>
    {/* Table Top */}
    <div
      className="absolute inset-0 rounded-sm shadow-md border-b-4 border-slate-300 dark:border-zinc-700"
      style={{ backgroundColor: color, transform: 'translateZ(20px)' }}
    >
      {/* Computer Monitor */}
      <div className="absolute top-2 left-4 w-12 h-10 bg-zinc-800 rounded-sm border-2 border-zinc-900 flex items-center justify-center" style={{ transform: 'rotateX(-90deg) translateY(-20px) translateZ(10px)' }}>
        <div className="w-8 h-6 bg-sky-400/20 animate-pulse" />
      </div>

      {/* Keyboard */}
      <div className="absolute bottom-4 left-6 w-8 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-sm" />
    </div>

    {/* Legs */}
    <div className="absolute bottom-0 left-0 w-1 h-10 bg-slate-300 dark:bg-zinc-800" />
    <div className="absolute bottom-0 right-0 w-1 h-10 bg-slate-300 dark:bg-zinc-800" />

    {children}
  </div>
);

export const MeetingTable = () => (
  <div className="relative w-48 h-32 bg-amber-100/80 dark:bg-amber-900/20 rounded-full border-4 border-amber-200 dark:border-amber-800 flex items-center justify-center shadow-xl">
    <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
      Zona de Reuniones
    </div>
  </div>
);

export const BeanBag = ({ color = "purple" }) => {
  const colors = {
    purple: "bg-purple-200 border-purple-300 dark:bg-purple-900/40 dark:border-purple-800",
    blue: "bg-sky-200 border-sky-300 dark:bg-sky-900/40 dark:border-sky-800",
    green: "bg-emerald-200 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-800",
  };

  return (
    <div className={`w-12 h-12 rounded-full shadow-lg border-b-8 ${colors[color] || colors.purple} flex items-center justify-center transform hover:scale-110 transition-transform`}>
       {/* Small indentation for sitting */}
       <div className="w-6 h-6 rounded-full bg-black/5" />
    </div>
  );
};

export const CoffeeStation = () => (
  <div className="relative w-24 h-16 bg-white dark:bg-zinc-900 rounded-t-lg border-2 border-slate-200 dark:border-zinc-800 flex flex-col items-center justify-end p-2 shadow-md">
    <div className="w-8 h-12 bg-zinc-800 rounded-t-md mb-1 relative overflow-hidden">
      <div className="absolute top-2 left-2 w-4 h-4 rounded-full border-2 border-white/20" />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 bg-amber-900/50" />
    </div>
    <div className="text-[8px] font-bold text-slate-400 uppercase">Espresso Lab</div>
  </div>
);

export const ProductionSet = ({ isActive = false, clients = [] }) => (
  <div className={`relative w-40 h-40 rounded-xl border-2 border-dashed transition-all duration-700 ${isActive ? 'bg-indigo-50/50 border-indigo-400 shadow-[0_0_30px_rgba(79,70,229,0.2)]' : 'bg-slate-50 border-slate-200 opacity-40'}`}>
    <div className="absolute top-0 left-0 p-3">
      <div className={`flex items-center gap-2 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
        <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`} />
        <span className="text-[10px] font-bold uppercase tracking-tighter">Set de Producción</span>
      </div>
    </div>

    {/* Lights */}
    <div className="absolute -top-4 left-10 w-4 h-4 bg-zinc-800 rounded-sm" style={{ transform: 'rotate(45deg)' }}>
       <div className={`w-full h-full ${isActive ? 'shadow-[0_0_20px_white]' : ''}`} />
    </div>
    <div className="absolute -top-4 right-10 w-4 h-4 bg-zinc-800 rounded-sm" style={{ transform: 'rotate(-45deg)' }}>
       <div className={`w-full h-full ${isActive ? 'shadow-[0_0_20px_white]' : ''}`} />
    </div>

    {isActive && (
       <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
          <div className="text-xs font-black text-indigo-900 dark:text-indigo-200 uppercase">Grabando</div>
          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1 font-mono">{clients.join(' & ') || 'Producción'}</div>
       </div>
    )}
  </div>
);
