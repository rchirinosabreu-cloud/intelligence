import React from 'react';
import * as THREE from 'three';
import { Box, Cylinder, Sphere } from '@react-three/drei';

export const Desk3D = ({ position = [0, 0, 0], color = "#ffffff" }) => {
  return (
    <group position={position}>
      {/* Table Top - Chunky Habbo look */}
      <Box args={[2, 0.25, 1.2]} position={[0, 0.8, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.2} metalness={0.05} />
      </Box>

      {/* iMac-style Computer */}
      <group position={[0, 0.95, -0.25]}>
        {/* Stand */}
        <Box args={[0.2, 0.4, 0.1]} position={[0, 0, 0]} castShadow>
          <meshStandardMaterial color="#e2e8f0" metalness={0.8} />
        </Box>
        {/* Screen */}
        <group position={[0, 0.4, 0.05]}>
          <Box args={[0.9, 0.6, 0.08]} castShadow>
            <meshStandardMaterial color="#f8fafc" />
          </Box>
          {/* Display area */}
          <Box args={[0.82, 0.52, 0.02]} position={[0, 0.02, 0.04]}>
            <meshStandardMaterial color="#f0f9ff" emissive="#bae6fd" emissiveIntensity={0.3} />
          </Box>
        </group>
      </group>

      {/* Keyboard placeholder */}
      <Box args={[0.6, 0.02, 0.25]} position={[0, 0.935, 0.2]} castShadow>
        <meshStandardMaterial color="#e2e8f0" />
      </Box>

      {/* Mouse placeholder */}
      <Box args={[0.08, 0.02, 0.12]} position={[0.5, 0.935, 0.2]} castShadow>
        <meshStandardMaterial color="#e2e8f0" />
      </Box>

      {/* Legs - Voxel style */}
      {[[-0.85, 0.4, -0.45], [0.85, 0.4, -0.45], [-0.85, 0.4, 0.45], [0.85, 0.4, 0.45]].map((pos, i) => (
        <Box key={i} args={[0.2, 0.8, 0.2]} position={pos} castShadow>
          <meshStandardMaterial color="#cbd5e1" metalness={0.2} roughness={0.5} />
        </Box>
      ))}
    </group>
  );
};

export const Chair3D = ({ position = [0, 0, 0], color = "#818cf8" }) => {
  return (
    <group position={position}>
      {/* Seat base */}
      <Box args={[0.7, 0.15, 0.7]} position={[0, 0.5, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.8} />
      </Box>
      {/* Backrest */}
      <Box args={[0.7, 0.8, 0.15]} position={[0, 0.9, -0.3]} castShadow>
        <meshStandardMaterial color={color} roughness={0.8} />
      </Box>
      {/* Armrests */}
      <Box args={[0.1, 0.3, 0.5]} position={[-0.35, 0.65, 0]} castShadow>
        <meshStandardMaterial color="#475569" />
      </Box>
      <Box args={[0.1, 0.3, 0.5]} position={[0.35, 0.65, 0]} castShadow>
        <meshStandardMaterial color="#475569" />
      </Box>
      {/* Central Stand */}
      <Cylinder args={[0.06, 0.06, 0.5, 16]} position={[0, 0.25, 0]} castShadow>
        <meshStandardMaterial color="#334155" metalness={0.9} />
      </Cylinder>
      {/* Star Base */}
      <group position={[0, 0.05, 0]}>
        {[0, 72, 144, 216, 288].map((angle, i) => (
          <Box
            key={i}
            args={[0.6, 0.05, 0.1]}
            position={[Math.cos(angle * Math.PI / 180) * 0.3, 0, Math.sin(angle * Math.PI / 180) * 0.3]}
            rotation={[0, -angle * Math.PI / 180, 0]}
          >
            <meshStandardMaterial color="#334155" />
          </Box>
        ))}
      </group>
    </group>
  );
};

export const CoffeeMachine3D = ({ position = [0, 0, 0] }) => {
  return (
    <group position={position}>
      {/* Main Body */}
      <Box args={[0.8, 1.2, 0.7]} position={[0, 0.6, 0]} castShadow>
        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.2} />
      </Box>
      {/* Espresso Unit area */}
      <Box args={[0.6, 0.4, 0.4]} position={[0, 0.8, 0.2]} castShadow>
        <meshStandardMaterial color="#1e293b" />
      </Box>
      {/* Water Tank */}
      <Box args={[0.3, 0.9, 0.4]} position={[0.2, 0.6, -0.1]} castShadow>
        <meshStandardMaterial color="#bae6fd" transparent opacity={0.6} />
      </Box>
      {/* Drip Tray */}
      <Box args={[0.7, 0.1, 0.4]} position={[0, 0.1, 0.2]} castShadow>
        <meshStandardMaterial color="#94a3b8" />
      </Box>
      {/* Glowing Buttons */}
      <Sphere args={[0.05, 16, 16]} position={[-0.1, 1.0, 0.36]}>
        <meshStandardMaterial color="#86efac" emissive="#86efac" emissiveIntensity={0.5} />
      </Sphere>
      <Sphere args={[0.05, 16, 16]} position={[0.1, 1.0, 0.36]}>
        <meshStandardMaterial color="#fca5a5" emissive="#fca5a5" emissiveIntensity={0.2} />
      </Sphere>
    </group>
  );
};

export const Plant3D = ({ position = [0, 0, 0] }) => {
  return (
    <group position={position}>
      {/* Pot - Voxel style */}
      <Box args={[0.5, 0.5, 0.5]} position={[0, 0.25, 0]} castShadow>
        <meshStandardMaterial color="#f1f5f9" />
      </Box>
      {/* Soil */}
      <Box args={[0.45, 0.1, 0.45]} position={[0, 0.5, 0]}>
        <meshStandardMaterial color="#422006" />
      </Box>
      {/* Stem */}
      <Box args={[0.1, 0.8, 0.1]} position={[0, 0.8, 0]} castShadow>
        <meshStandardMaterial color="#166534" />
      </Box>
      {/* Leaves - Voxel blobs */}
      <Box args={[0.6, 0.6, 0.6]} position={[0, 1.3, 0]} castShadow>
        <meshStandardMaterial color="#86efac" />
      </Box>
      <Box args={[0.4, 0.4, 0.4]} position={[0.3, 1.1, 0.2]} castShadow>
        <meshStandardMaterial color="#4ade80" />
      </Box>
      <Box args={[0.4, 0.4, 0.4]} position={[-0.2, 1.4, -0.2]} castShadow>
        <meshStandardMaterial color="#22c55e" />
      </Box>
    </group>
  );
};

export const OfficeFloor = () => {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.05} />
      </mesh>
      {/* Elegant grid for volumetric depth */}
      <gridHelper args={[50, 50, "#fbcfe8", "#fdf2f8"]} position={[0, 0.01, 0]} />
    </group>
  );
};

export const OfficeWalls = ({ size = 24 }) => {
  return (
    <group>
      {/* Back Wall */}
      <Box args={[size, 6, 0.5]} position={[0, 3, -size / 2]} receiveShadow>
        <meshStandardMaterial color="#fdf2f8" />
      </Box>
      {/* Left Wall */}
      <Box args={[0.5, 6, size]} position={[-size / 2, 3, 0]} receiveShadow>
        <meshStandardMaterial color="#fdf2f8" />
      </Box>

      {/* Window Cutouts logic */}
      <group position={[0, 3.5, -size / 2 + 0.26]}>
        <Box args={[10, 3, 0.1]}>
          <meshStandardMaterial color="#bae6fd" transparent opacity={0.2} metalness={1} roughness={0} />
        </Box>
        {/* Window Frame */}
        <Box args={[10.2, 0.2, 0.2]} position={[0, 1.6, 0]}>
          <meshStandardMaterial color="#ffffff" />
        </Box>
        <Box args={[10.2, 0.2, 0.2]} position={[0, -1.6, 0]}>
          <meshStandardMaterial color="#ffffff" />
        </Box>
      </group>
    </group>
  );
};

export const BeanBag3D = ({ position = [0, 0, 0], color = "#fca5a5" }) => {
  return (
    <group position={position}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <sphereGeometry args={[0.7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
    </group>
  );
};

export const ProductionSet3D = ({ position = [0, 0, 0], isActive }) => {
  return (
    <group position={position}>
      {/* Stage Floor */}
      <Box args={[6, 0.1, 4]} position={[0, 0.05, 0]} receiveShadow>
        <meshStandardMaterial color="#f8fafc" />
      </Box>

      {/* Background Curved Wall */}
      <group position={[0, 1.5, -1.5]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[3, 3, 3, 32, 1, true, 0, Math.PI]} />
          <meshStandardMaterial color={isActive ? "#fdf2f8" : "#f1f5f9"} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Studio Lights */}
      {[[-2.5, 3.5, 1], [2.5, 3.5, 1]].map((pos, i) => (
        <group key={i} position={pos} rotation={[0.4, i === 0 ? 0.5 : -0.5, 0]}>
          {/* Light Stand */}
          <Cylinder args={[0.05, 0.05, 3.5, 8]} position={[0, -1.75, 0]} castShadow>
            <meshStandardMaterial color="#334155" />
          </Cylinder>
          {/* Softbox */}
          <Box args={[0.8, 0.8, 0.4]} castShadow>
            <meshStandardMaterial color="#1e293b" />
          </Box>
          <Box args={[0.7, 0.7, 0.05]} position={[0, 0, 0.2]}>
            <meshStandardMaterial
              color={isActive ? "#fdf2f8" : "#cbd5e1"}
              emissive={isActive ? "#fdf2f8" : "#000000"}
              emissiveIntensity={isActive ? 2 : 0}
            />
          </Box>
          {isActive && <pointLight intensity={5} distance={10} color="#fdf2f8" />}
        </group>
      ))}

      {/* Label */}
      <group position={[0, 0.2, 1.5]} rotation={[-Math.PI / 2, 0, 0]}>
         <mesh>
           <planeGeometry args={[3, 0.6]} />
           <meshStandardMaterial color="#f472b6" transparent opacity={0.8} />
         </mesh>
      </group>
    </group>
  );
};
