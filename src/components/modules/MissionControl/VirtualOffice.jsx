import React, { Suspense, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  OrthographicCamera,
  ContactShadows,
  Float,
  Html,
  Text
} from '@react-three/drei';
import * as THREE from 'three';
import { Desk3D, Plant3D, BeanBag3D, ProductionSet3D, Chair3D, OfficeWalls, CoffeeMachine3D, OfficeFloor } from './Office3D';
import PixelAvatar from './PixelAvatar';

/**
 * AvatarWrapper - Renders a 2D PixelAvatar in the 3D space using <Html />
 */
const AvatarWrapper = ({ member, isMeeting, position, onClick }) => {
  return (
    <group position={position}>
      <Html
        transform
        occlude
        distanceFactor={6}
        position={[0, 2.2, 0]}
        style={{
          transition: 'all 0.2s',
        }}
      >
        <div
          className="flex flex-col items-center select-none cursor-pointer group"
          onClick={onClick}
        >
          <div className="transition-all duration-300 group-hover:scale-125 group-hover:-translate-y-2">
            <PixelAvatar
              member={member}
              state={isMeeting ? 'meeting' : 'working'}
              size={80}
            />
          </div>
          <div className="mt-2 px-4 py-1.5 bg-white/95 dark:bg-zinc-800/95 rounded-2xl border border-slate-200 dark:border-zinc-700 shadow-xl whitespace-nowrap group-hover:bg-indigo-600 group-hover:border-indigo-500 transition-colors">
             <span className="text-[12px] font-black text-slate-700 dark:text-zinc-200 group-hover:text-white uppercase tracking-tight">{member.name}</span>
          </div>
        </div>
      </Html>
    </group>
  );
};

const MeetingZone = ({ position = [8, 0, 4] }) => {
  return (
    <group position={position}>
      {/* Bean Bags for Sync */}
      <BeanBag3D position={[-2, 0, -1]} color="#fecaca" />
      <BeanBag3D position={[2, 0, -1]} color="#e9d5ff" />
      <BeanBag3D position={[0, 0, 1.5]} color="#bfdbfe" />

      {/* Large Coffee Table */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.2, 1.2, 0.1, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.1} />
      </mesh>

      {/* Label */}
      <Text
        position={[0, 0.1, 3.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.6}
        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGkyMZhrib2Bg-4.woff"
        color="#94a3b8"
        fontWeight="bold"
      >
        SYNC & REUNIONES
      </Text>
    </group>
  );
};

const VirtualOffice = ({
  team = [],
  activeMeetings = [],
  productionActive = false,
  onMemberClick = () => {}
}) => {
  // Fixed Grid for 9 members
  const deskPositions = useMemo(() => [
    [-6, 0, -4], [-2, 0, -4], [2, 0, -4],
    [-6, 0, 0],  [-2, 0, 0],  [2, 0, 0],
    [-6, 0, 4],  [-2, 0, 4],  [2, 0, 4],
  ], []);

  const meetingCenter = [8, 0, 4];

  return (
    <div className="w-full h-full bg-[#f8fafc] dark:bg-zinc-950 relative">
      <Canvas shadows dpr={[1, 2]}>
        <OrthographicCamera
          makeDefault
          position={[20, 20, 20]}
          zoom={40}
          near={0.1}
          far={2000}
        />

        {/* Environment & Lighting: Pastel Aesthetic */}
        <Suspense fallback={null}>
          <ambientLight intensity={1} />

          {/* Main Directional Light for Shadows */}
          <directionalLight
            position={[10, 20, 10]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />

          {/* Pastel Rim Lights */}
          <pointLight position={[-15, 10, -15]} intensity={0.8} color="#fdf2f8" />
          <pointLight position={[15, 10, 5]} intensity={0.5} color="#eff6ff" />
          <pointLight position={[0, 10, 15]} intensity={0.3} color="#faf5ff" />

          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.4}
            scale={40}
            blur={2.5}
            far={10}
          />

          {/* Main Floor & Walls */}
          <OfficeFloor />
          <OfficeWalls size={32} />

          {/* Functional Zones */}
          <MeetingZone position={[10, 0, 6]} />
          <ProductionSet3D isActive={productionActive} position={[10, 0, -8]} />

          {/* Decor: Plants & Coffee */}
          <Plant3D position={[-14, 0, -14]} />
          <Plant3D position={[14, 0, 14]} />
          <Plant3D position={[-14, 0, 14]} />
          <CoffeeMachine3D position={[-12, 0, 0]} />

          {/* Espresso Lab Label */}
          <Text
            position={[-12, 0.1, 1.5]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.4}
            color="#94a3b8"
            fontWeight="bold"
          >
            ESPRESSO LAB
          </Text>

          {/* Team Members & Desks */}
          {team.map((member, index) => {
            const isMeeting = activeMeetings.some(m => m.participants?.includes(member.id));
            const deskPos = deskPositions[index % deskPositions.length];

            // Layout logic for positions
            const finalPos = isMeeting
              ? [10 + (Math.random() - 0.5) * 4, 0, 6 + (Math.random() - 0.5) * 4]
              : deskPos;

            return (
              <group key={member.id}>
                {!isMeeting && (
                  <>
                    <Desk3D position={deskPos} color={index % 2 === 0 ? "#ffffff" : "#fffbeb"} />
                    <Chair3D position={[deskPos[0], 0, deskPos[2] + 0.8]} color={index % 3 === 0 ? "#818cf8" : "#f472b6"} />
                  </>
                )}

                <AvatarWrapper
                  member={member}
                  isMeeting={isMeeting}
                  position={[finalPos[0], 0, finalPos[2]]}
                  onClick={() => onMemberClick(member)}
                />
              </group>
            );
          })}

          <OrbitControls
            enablePan={true}
            enableZoom={true}
            maxPolarAngle={Math.PI / 2.2}
            minZoom={15}
            maxZoom={80}
            makeDefault
          />
        </Suspense>
      </Canvas>

      {/* Stats UI Overlay */}
      <div className="absolute top-24 left-8 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-6 rounded-[2rem] border border-slate-200/50 dark:border-zinc-800/50 shadow-2xl space-y-4 pointer-events-none">
         <div className="flex items-center gap-3 border-b border-slate-100 dark:border-zinc-800 pb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
               <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
            </div>
            <div>
               <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mission Control</h3>
               <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">BRAIN-OS V2.0</p>
            </div>
         </div>
         <div className="space-y-3">
           <div className="flex items-center justify-between gap-8">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Talento Activo</span>
              <span className="text-xs font-black text-indigo-600">{team.length}</span>
           </div>
           <div className="flex items-center justify-between gap-8">
              <span className="text-[10px] font-bold text-slate-500 uppercase">En Reunión</span>
              <span className="text-xs font-black text-amber-500">{activeMeetings.length}</span>
           </div>
           {productionActive && (
             <div className="pt-2">
                <div className="px-3 py-1 bg-pink-50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-900/30 rounded-full flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping" />
                   <span className="text-[9px] font-black text-pink-600 dark:text-pink-400 uppercase tracking-tighter">Production: On Air</span>
                </div>
             </div>
           )}
         </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/60 dark:bg-zinc-900/60 border border-slate-200/50 dark:border-zinc-800/50 px-6 py-2.5 rounded-2xl backdrop-blur-md shadow-lg">
         <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-4">
           <span>Orbitar: Clic Izquierdo</span>
           <span className="w-1 h-1 bg-slate-300 rounded-full" />
           <span>Panear: Clic Derecho</span>
           <span className="w-1 h-1 bg-slate-300 rounded-full" />
           <span>Zoom: Scroll</span>
         </p>
      </div>
    </div>
  );
};

export default VirtualOffice;
