import React, { Suspense, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  OrthographicCamera,
  ContactShadows,
  Environment,
  Float,
  Html,
  Text
} from '@react-three/drei';
import * as THREE from 'three';
import { Desk3D, Plant3D, BeanBag3D, ProductionSet3D } from './Office3D';
import PixelAvatar from './PixelAvatar';

/**
 * AvatarWrapper - Renders a 2D PixelAvatar in the 3D space using <Html />
 */
const AvatarWrapper = ({ member, isMeeting, position }) => {
  return (
    <group position={position}>
      <Html
        transform
        occlude
        distanceFactor={5}
        position={[0, 1.5, 0]}
        style={{
          transition: 'all 0.2s',
          pointerEvents: 'none'
        }}
      >
        <div className="flex flex-col items-center select-none">
          <div className="transition-transform hover:scale-110">
            <PixelAvatar
              member={member}
              state={isMeeting ? 'meeting' : 'working'}
            />
          </div>
          <div className="mt-2 px-3 py-1 bg-white/95 dark:bg-zinc-800/95 rounded-full border border-slate-200 dark:border-zinc-700 shadow-lg whitespace-nowrap">
             <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-200">{member.name}</span>
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
      <BeanBag3D position={[-1.5, 0, 0]} color="#fecaca" />
      <BeanBag3D position={[1.5, 0, 0]} color="#e9d5ff" />
      <BeanBag3D position={[0, 0, 1.5]} color="#bfdbfe" />

      {/* Small coffee table */}
      <Cylinder args={[0.6, 0.6, 0.05, 32]} position={[0, 0.3, 0]}>
        <meshStandardMaterial color="#ffffff" roughness={0.1} />
      </Cylinder>

      {/* Label */}
      <Text
        position={[0, 0.1, 2.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.4}
        color="#a1a1aa"
      >
        SYNC & REUNIONES
      </Text>
    </group>
  );
};

const Cylinder = ({ args, position, children }) => (
  <mesh position={position} castShadow receiveShadow>
    <cylinderGeometry args={args} />
    {children}
  </mesh>
);


const Box = ({ args, position, children }) => (
  <mesh position={position} castShadow receiveShadow>
    <boxGeometry args={args} />
    {children}
  </mesh>
);

const VirtualOffice = ({
  team = [],
  activeMeetings = [],
  productionActive = false,
  onMemberClick = () => {}
}) => {
  // 3D Grid for desks
  const deskPositions = useMemo(() => [
    [-4, 0, -3], [-1, 0, -3], [2, 0, -3],
    [-4, 0, 0],  [-1, 0, 0],  [2, 0, 0],
    [-4, 0, 3],  [-1, 0, 3],  [2, 0, 3],
  ], []);

  const meetingCenter = [8, 0, 4];

  return (
    <div className="w-full h-full bg-[#f8fafc] dark:bg-zinc-950 relative">
      <Canvas shadows dpr={[1, 2]}>
        <OrthographicCamera
          makeDefault
          position={[15, 15, 15]}
          zoom={45}
          near={0.1}
          far={1000}
        />

        {/* Environment & Lighting */}
        <Suspense fallback={null}>
          {/* We skip Environment preset "city" because it depends on external HDR assets which often fail in restricted sandbox/prod environments */}
          <ambientLight intensity={0.8} />
          <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
          <pointLight position={[-10, 5, -10]} intensity={0.5} color="#fdf2f8" />
          <spotLight
            position={[5, 20, 5]}
            intensity={1.5}
            angle={0.5}
            penumbra={0.5}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />

          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.3}
            scale={25}
            blur={2}
            far={4.5}
          />

          {/* Floor Grid - Soft Pastel */}
          <gridHelper args={[40, 40, "#fbcfe8", "#fdf2f8"]} position={[0, 0.01, 0]} />

          {/* Main Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#fdf2f8" roughness={1} />
          </mesh>

          {/* Functional Zones */}
          <MeetingZone position={[8, 0, 4]} />
          <ProductionSet3D isActive={productionActive} position={[8, 0, -6]} />

          {/* Decor: Plants */}
          <Plant3D position={[-8, 0, -8]} />
          <Plant3D position={[12, 0, 10]} />

          {/* Team Members & Desks */}
          {team.map((member, index) => {
            const isMeeting = activeMeetings.some(m => m.participants?.includes(member.id));
            const deskPos = deskPositions[index % deskPositions.length];

            // Layout logic for positions
            const finalPos = isMeeting
              ? [meetingCenter[0] + (Math.random() - 0.5) * 2, 0, meetingCenter[2] + (Math.random() - 0.5) * 2]
              : deskPos;

            return (
              <group key={member.id}>
                {!isMeeting && <Desk3D position={deskPos} color={index % 2 === 0 ? "#ffffff" : "#fffbeb"} />}

                <AvatarWrapper
                  member={member}
                  isMeeting={isMeeting}
                  position={[finalPos[0], 0, finalPos[2]]}
                />
              </group>
            );
          })}

          <OrbitControls
            enablePan={true}
            enableZoom={true}
            maxPolarAngle={Math.PI / 2.1}
            minZoom={20}
            maxZoom={100}
          />
        </Suspense>
      </Canvas>

      {/* Stats UI */}
      <div className="absolute top-24 left-8 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md p-5 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl space-y-3 pointer-events-none">
         <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">BRAIN-OS V2.0</h3>
         <div className="space-y-2">
           <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-slate-600">TALENTO ACTIVO: {team.length}</span>
           </div>
           <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-[11px] font-bold text-slate-600">EN REUNIÓN: {activeMeetings.length}</span>
           </div>
           {productionActive && (
             <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-ping" />
                <span className="text-[11px] font-bold text-slate-600">SET DE PROD: ON AIR</span>
             </div>
           )}
         </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-indigo-600/10 border border-indigo-600/20 px-6 py-2 rounded-full backdrop-blur-sm">
         <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Orbitar: Clic Izquierdo | Panear: Clic Derecho | Zoom: Scroll</p>
      </div>
    </div>
  );
};

export default VirtualOffice;
