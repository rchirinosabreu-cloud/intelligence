import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Desk, MeetingTable, BeanBag, CoffeeStation, ProductionSet } from './OfficeFurniture';
import PixelAvatar from './PixelAvatar';

/**
 * VirtualOffice - The isometric world engine.
 * Maps team members to fixed desk coordinates and handles the overall layout.
 */
const VirtualOffice = ({
  team = [],
  activeMeetings = [],
  productionActive = false,
  productionClients = [],
  onMemberClick = () => {}
}) => {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  // Base grid layout for a 1000x800 canvas
  // We use a normalized coordinate system for easier mapping

  // FIXED DESKS COORDINATES (X, Y)
  // These will be assigned to team members dynamically but in a fixed sequence
  const deskLocations = [
    { x: 300, y: 300 }, // Pos 1
    { x: 450, y: 300 }, // Pos 2
    { x: 600, y: 300 }, // Pos 3
    { x: 300, y: 450 }, // Pos 4
    { x: 450, y: 450 }, // Pos 5
    { x: 600, y: 450 }, // Pos 6
    { x: 300, y: 600 }, // Pos 7
    { x: 450, y: 600 }, // Pos 8
    { x: 600, y: 600 }, // Pos 9
  ];

  const meetingZone = { x: 750, y: 450 };
  const coffeeZone = { x: 150, y: 200 };
  const relaxationZone = { x: 150, y: 550 };
  const productionZone = { x: 800, y: 150 };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing bg-sky-50 dark:bg-zinc-950 transition-colors">
      {/* World Canvas */}
      <motion.div
        drag
        dragConstraints={containerRef}
        className="relative w-[1200px] h-[900px] origin-center"
        style={{
          transformStyle: 'preserve-3d',
          transform: `perspective(2000px) rotateX(55deg) rotateZ(-45deg) scale(${zoom})`,
        }}
      >
        {/* Floor */}
        <div className="absolute inset-0 bg-[#fdf2f8] dark:bg-zinc-900 border-[10px] border-white/20 dark:border-white/5 rounded-[40px] shadow-2xl">
           {/* Grid Pattern */}
           <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
                style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        </div>

        {/* Walls (Implicit by shadow and position) */}

        {/* OFFICE ELEMENTS */}

        {/* Coffee Station */}
        <div className="absolute" style={{ left: coffeeZone.x, top: coffeeZone.y, transform: 'rotateZ(45deg)' }}>
          <CoffeeStation />
        </div>

        {/* Bean Bags & Mascot */}
        <div className="absolute flex gap-4" style={{ left: relaxationZone.x, top: relaxationZone.y, transform: 'rotateZ(45deg)' }}>
          <BeanBag color="purple" />
          <BeanBag color="blue" />
          <div className="relative">
            <BeanBag color="green" />
            {/* The Mascot: Pixel Cat */}
            <div className="absolute top-2 left-2 animate-bounce">
              <svg width="20" height="20" viewBox="0 0 10 10" fill="#64748b" style={{ imageRendering: 'pixelated' }}>
                <rect x="2" y="4" width="6" height="4" />
                <rect x="2" y="2" width="2" height="2" />
                <rect x="6" y="2" width="2" height="2" />
                <rect x="4" y="5" width="2" height="1" fill="#000" />
              </svg>
            </div>
          </div>
        </div>

        {/* Meeting Table */}
        <div className="absolute" style={{ left: meetingZone.x, top: meetingZone.y, transform: 'rotateZ(45deg)' }}>
           <MeetingTable />
        </div>

        {/* Production Set */}
        <div className="absolute" style={{ left: productionZone.x, top: productionZone.y, transform: 'rotateZ(45deg)' }}>
           <ProductionSet isActive={productionActive} clients={productionClients} />
        </div>

        {/* DESKS & TEAM MEMBERS */}
        {team.map((member, index) => {
          const isMeeting = activeMeetings.some(m => m.participants.includes(member.id));
          const deskPos = deskLocations[index % deskLocations.length];

          // If in meeting, offset position towards meeting table
          const finalPos = isMeeting ? { x: meetingZone.x + (index * 10 - 40), y: meetingZone.y + (index * 5 - 20) } : deskPos;

          return (
            <motion.div
              key={member.id}
              layout
              initial={false}
              className="absolute cursor-pointer"
              style={{ left: finalPos.x, top: finalPos.y, transform: 'rotateZ(45deg)' }}
              onClick={() => onMemberClick(member)}
            >
              {!isMeeting && <Desk color={index % 2 === 0 ? "#fff" : "#fefce8"} />}

              <div className="absolute -top-12 left-1/2 -translate-x-1/2 transition-transform hover:scale-125" style={{ transformStyle: 'preserve-3d', transform: 'rotateZ(-45deg) rotateX(-55deg)' }}>
                <PixelAvatar
                  member={member}
                  state={isMeeting ? 'meeting' : 'working'}
                />
                <div className="mt-1 px-2 py-0.5 bg-white/90 dark:bg-zinc-800/90 rounded-full border border-slate-200 dark:border-zinc-700 shadow-sm whitespace-nowrap">
                   <span className="text-[10px] font-bold text-slate-700 dark:text-zinc-200">{member.name.split(' ')[0]}</span>
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Neon Logo on "Wall" */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2" style={{ transform: 'rotateZ(45deg) rotateX(-90deg) translateZ(50px)' }}>
          <div className="px-6 py-2 border-2 border-indigo-400 rounded-full shadow-[0_0_20px_rgba(129,140,248,0.5)] bg-indigo-500/10">
            <span className="text-xl font-black text-indigo-400 italic tracking-tighter animate-pulse">BRAINSTUDIO</span>
          </div>
        </div>

      </motion.div>

      {/* UI Controls */}
      <div className="absolute bottom-8 right-8 flex flex-col gap-2">
         <button onClick={() => setZoom(z => Math.min(z + 0.2, 2))} className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-xl shadow-lg flex items-center justify-center font-bold text-lg">+</button>
         <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))} className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-xl shadow-lg flex items-center justify-center font-bold text-lg">-</button>
      </div>

      {/* Legend */}
      <div className="absolute top-24 left-8 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xl space-y-2">
         <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Activos: {team.length}</span>
         </div>
         <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider">En Reunión: {activeMeetings.length}</span>
         </div>
      </div>
    </div>
  );
};

export default VirtualOffice;
