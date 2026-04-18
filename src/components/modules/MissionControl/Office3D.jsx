import React from 'react';
import * as THREE from 'three';
import { Box, Cylinder } from '@react-three/drei';

export const Desk3D = ({ position = [0, 0, 0], color = "#ffffff" }) => {
  return (
    <group position={position}>
      {/* Table Top */}
      <Box args={[1.8, 0.08, 1.0]} position={[0, 0.75, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.2} metalness={0.05} />
      </Box>

      {/* Desk Mat */}
      <Box args={[1.2, 0.01, 0.6]} position={[0, 0.795, 0]} receiveShadow>
        <meshStandardMaterial color="#f1f5f9" roughness={1} />
      </Box>

      {/* High-Fidelity Laptop (Open) */}
      <group position={[0, 0.8, -0.1]}>
        {/* Base */}
        <Box args={[0.5, 0.02, 0.35]} position={[0, 0.01, 0.1]} castShadow>
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
        </Box>
        {/* Screen */}
        <Box args={[0.5, 0.3, 0.02]} position={[0, 0.15, -0.07]} rotation={[-Math.PI / 6, 0, 0]} castShadow>
          <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} />
        </Box>
      </group>

      {/* Legs */}
      {[[-0.8, 0.375, -0.4], [0.8, 0.375, -0.4], [-0.8, 0.375, 0.4], [0.8, 0.375, 0.4]].map((pos, i) => (
        <Cylinder key={i} args={[0.04, 0.03, 0.75, 16]} position={pos} castShadow>
          <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.2} />
        </Cylinder>
      ))}
    </group>
  );
};

export const Plant3D = ({ position = [0, 0, 0] }) => {
  return (
    <group position={position}>
      {/* Pot */}
      <Cylinder args={[0.15, 0.1, 0.3, 16]} position={[0, 0.15, 0]} castShadow>
        <meshStandardMaterial color="#e2e8f0" />
      </Cylinder>
      {/* Soil */}
      <Cylinder args={[0.13, 0.13, 0.05, 16]} position={[0, 0.28, 0]}>
        <meshStandardMaterial color="#451a03" />
      </Cylinder>
      {/* Leaves (Simple spheres for pastel/cute look) */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial color="#86efac" />
      </mesh>
      <mesh position={[0.1, 0.4, 0.1]} castShadow>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#4ade80" />
      </mesh>
    </group>
  );
};

export const OfficeFloor = () => {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#fdf2f8" roughness={0.8} />
    </mesh>
  );
};

export const BeanBag3D = ({ position = [0, 0, 0], color = "#fca5a5" }) => {
  return (
    <group position={position}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <sphereGeometry args={[0.5, 32, 32, 0, Math.PI * 2, 0, Math.PI / 1.5]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  );
};

export const ProductionSet3D = ({ position = [0, 0, 0], isActive }) => {
  return (
    <group position={position}>
      {/* Curved Backdrop */}
      <mesh position={[0, 1.5, -2]} castShadow>
        <cylinderGeometry args={[3, 3, 3, 32, 1, true, 0, Math.PI]} />
        <meshStandardMaterial color={isActive ? "#fdf2f8" : "#f1f5f9"} side={THREE.DoubleSide} />
      </mesh>

      {/* Studio Lights */}
      <group position={[-1.5, 2.5, -0.5]} rotation={[0, Math.PI / 4, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.4, 0.4, 0.2]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        {isActive && <pointLight intensity={2} color="#ec4899" />}
      </group>
      <group position={[1.5, 2.5, -0.5]} rotation={[0, -Math.PI / 4, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.4, 0.4, 0.2]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
        {isActive && <pointLight intensity={2} color="#ec4899" />}
      </group>
    </group>
  );
};
