/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import { useGesture } from '@use-gesture/react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { 
  TreePine, 
  TreeDeciduous,
  Calendar, 
  BookOpen, 
  Users, 
  CheckCircle2, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Wind,
  Droplets,
  Sun,
  Leaf,
  Sparkles,
  Quote,
  PenLine,
  CloudRain,
  Trash2,
  Search,
  MapPin,
  X,
  Loader2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DAILY_READINGS } from './readings';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function triggerHaptic(pattern: number | number[]) {
  if (typeof window !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore errors
    }
  }
}

function getLocalDayKey(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- Design Constants ---
const STAGES = [
  { name: 'Seed', minDays: 0, maxDays: 7, description: 'A small beginning, full of potential.' },
  { name: 'Sprout', minDays: 8, maxDays: 30, description: 'Breaking through the surface.' },
  { name: 'Sapling', minDays: 31, maxDays: 90, description: 'Finding strength and stability.' },
  { name: 'Young Tree', minDays: 91, maxDays: 180, description: 'Branching out into new habits.' },
  { name: 'Mature Tree', minDays: 181, maxDays: 364, description: 'Strong, resilient, and enduring.' },
  { name: 'Ancient Oak', minDays: 365, maxDays: Infinity, description: 'A legacy of strength.' },
];

const PALETTE = {
  bg: '#F5F7F2', // Soft off-white green
  ink: '#2D3328', // Deep forest charcoal
  primary: '#5A7D4D', // Sage green
  secondary: '#8BA888', // Muted leaf green
  accent: '#D4A373', // Earthy clay
  sky: '#E0F2F1', // Pale morning sky
};

// --- Components ---

const SPECIES_CONFIG = [
  { species: 'Oak', icon: TreeDeciduous, color: '#5A7D4D', bg: 'bg-[#5A7D4D]/20', border: 'border-[#5A7D4D]/40' },
  { species: 'Pine', icon: TreePine, color: '#6B8E9B', bg: 'bg-[#6B8E9B]/20', border: 'border-[#6B8E9B]/40' },
  { species: 'Birch', icon: TreeDeciduous, color: '#8BA888', bg: 'bg-[#8BA888]/20', border: 'border-[#8BA888]/40' },
  { species: 'Maple', icon: Leaf, color: '#D4A373', bg: 'bg-[#D4A373]/20', border: 'border-[#D4A373]/40' },
  { species: 'Willow', icon: TreeDeciduous, color: '#A3C49E', bg: 'bg-[#A3C49E]/20', border: 'border-[#A3C49E]/40' },
];

type TreeProfile = {
  trunk: string;
  bark: string;
  foliageA: string;
  foliageB: string;
  canopyStyle: 'round' | 'cone' | 'weeping';
};

const TREE_PROFILES: Record<string, TreeProfile> = {
  oak: {
    trunk: '#5B4031',
    bark: '#3F2A1F',
    foliageA: '#5A7D4D',
    foliageB: '#6C935E',
    canopyStyle: 'round',
  },
  pine: {
    trunk: '#5D4638',
    bark: '#473223',
    foliageA: '#4D6D5B',
    foliageB: '#628578',
    canopyStyle: 'cone',
  },
  birch: {
    trunk: '#E4E8E2',
    bark: '#A9B3AA',
    foliageA: '#86A78A',
    foliageB: '#9CB8A1',
    canopyStyle: 'round',
  },
  maple: {
    trunk: '#6A4A35',
    bark: '#513623',
    foliageA: '#C47A48',
    foliageB: '#D3935E',
    canopyStyle: 'round',
  },
  willow: {
    trunk: '#5C4A39',
    bark: '#423123',
    foliageA: '#8FAF8B',
    foliageB: '#A6C2A1',
    canopyStyle: 'weeping',
  },
};

const CANOPY_CLUSTERS: Array<[number, number, number, number]> = [
  [0, 0.95, 0, 0.9],
  [-0.72, 0.58, 0.28, 0.62],
  [0.74, 0.52, -0.2, 0.64],
  [0.32, 1.25, 0.45, 0.54],
  [-0.26, 1.1, -0.54, 0.5],
  [0.05, 0.7, 0.72, 0.58],
  [-0.56, 0.8, -0.42, 0.52],
];

/**
 * Maps days-into-current-year to a 0–1 visual growth ratio.
 * Each stage milestone occupies ~25 % of the visual range so that
 * every stage looks meaningfully different on screen.
 *
 *   0– 7 days  →  0.00 – 0.12  (seed / tiny sprout)
 *   7–30 days  →  0.12 – 0.32  (young tree)
 *  30–90 days  →  0.32 – 0.65  (growing tree)
 * 90–365 days  →  0.65 – 1.00  (mature / full tree)
 */
function computeStageRatio(days: number): number {
  if (days <= 0)   return 0;
  if (days <= 7)   return (days / 7) * 0.12;
  if (days <= 30)  return 0.12 + ((days - 7)  / 23)  * 0.20;
  if (days <= 90)  return 0.32 + ((days - 30) / 60)  * 0.33;
  return Math.min(1, 0.65 + ((days - 90) / 275) * 0.35);
}

const ProceduralTree = ({ daysInYear, treeType, yaw }: { daysInYear: number, treeType: string, yaw: number }) => {
  const profile = TREE_PROFILES[treeType] || TREE_PROFILES.oak;
  const treeRef = useRef<THREE.Group>(null);
  const canopyRef = useRef<THREE.Group>(null);
  const swayOffset = useMemo(() => Math.random() * Math.PI * 2, []);

  // Stage-aware ratio: each milestone gets proportional visual weight
  const r = computeStageRatio(daysInYear);

  // Geometry scales: at r=0 the tree is a tiny seedling; at r=1 it is fully mature
  const trunkHeight      = 0.45 + r * 2.85;   // 0.45 → 3.30
  const trunkTopRadius   = 0.03 + r * 0.095;   // thin sprout → mature trunk
  const trunkBottomRadius = 0.06 + r * 0.17;
  const canopyScale      = 0.25 + r * 0.85;    // tiny bud → full canopy
  const branchLength     = 0.30 + r * 0.90;

  // Progressive branch unlock:
  //  • seed  (< 7 d):  no branches
  //  • sprout (7–30 d): 1 branch
  //  • growing (30–90 d): 3 branches
  //  • mature (90+ d):  all 4 branches
  const BRANCH_ANGLES = [-1.25, -0.55, 0.5, 1.2] as const;
  const activeBranches = r < 0.12 ? 0 : r < 0.32 ? 1 : r < 0.65 ? 3 : 4;

  // Show canopy only once the sprout stage begins (7+ days)
  const showCanopy = r >= 0.12;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (treeRef.current) {
      treeRef.current.rotation.y = yaw + Math.sin(t * 0.25 + swayOffset) * 0.08;
      treeRef.current.rotation.z = Math.sin(t * 0.65 + swayOffset) * 0.025;
    }
    if (canopyRef.current) {
      canopyRef.current.rotation.y = Math.sin(t * 0.4 + swayOffset) * 0.06;
    }
  });

  return (
    <group ref={treeRef} position={[0, -1.65, 0]}>
      {/* Main trunk */}
      <mesh castShadow receiveShadow position={[0, trunkHeight * 0.5, 0]}>
        <cylinderGeometry args={[trunkTopRadius, trunkBottomRadius, trunkHeight, 18]} />
        <meshStandardMaterial color={profile.trunk} roughness={0.96} metalness={0.04} />
      </mesh>

      {/* Root flare — only worth showing once there's real trunk */}
      {r >= 0.12 && (
        <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
          <cylinderGeometry args={[trunkBottomRadius * 1.5, trunkBottomRadius * 1.15, 0.34, 18]} />
          <meshStandardMaterial color={profile.bark} roughness={0.98} metalness={0.02} />
        </mesh>
      )}

      {/* Branches — unlock progressively with stage */}
      {BRANCH_ANGLES.slice(0, activeBranches).map((angle, index) => {
        const branchSize = branchLength * (0.84 - index * 0.08);
        return (
          <group
            key={`${angle}-${index}`}
            position={[0, trunkHeight * (0.42 + index * 0.1), 0]}
            rotation={[0.18 + index * 0.06, angle, angle > 0 ? -0.52 : 0.52]}
          >
            <mesh castShadow receiveShadow position={[0, branchSize * 0.5, 0]}>
              <cylinderGeometry args={[0.03 + r * 0.012, 0.07 + r * 0.012, branchSize, 10]} />
              <meshStandardMaterial color={profile.bark} roughness={0.95} metalness={0.03} />
            </mesh>
          </group>
        );
      })}

      {/* Canopy — hidden during seed stage, grows in all subsequent stages */}
      {showCanopy && profile.canopyStyle === 'cone' && (
        <group ref={canopyRef} position={[0, trunkHeight * 0.74, 0]} scale={[canopyScale, canopyScale, canopyScale]}>
          <mesh castShadow position={[0, 1.25, 0]}>
            <coneGeometry args={[0.6, 1.45, 16]} />
            <meshStandardMaterial color={profile.foliageB} roughness={0.84} metalness={0.02} />
          </mesh>
          <mesh castShadow position={[0, 0.84, 0]}>
            <coneGeometry args={[0.85, 1.35, 16]} />
            <meshStandardMaterial color={profile.foliageA} roughness={0.84} metalness={0.02} />
          </mesh>
          <mesh castShadow position={[0, 0.46, 0]}>
            <coneGeometry args={[1.05, 1.25, 16]} />
            <meshStandardMaterial color={profile.foliageB} roughness={0.84} metalness={0.02} />
          </mesh>
        </group>
      )}

      {showCanopy && profile.canopyStyle === 'weeping' && (
        <group ref={canopyRef} position={[0, trunkHeight * 0.8, 0]} scale={[canopyScale, canopyScale, canopyScale]}>
          <mesh castShadow position={[0, 0.66, 0]}>
            <sphereGeometry args={[0.94, 20, 20]} />
            <meshStandardMaterial color={profile.foliageA} roughness={0.88} metalness={0.02} />
          </mesh>
          {[-1.3, -0.7, -0.2, 0.25, 0.7, 1.2].map((angle, index) => (
            <mesh
              key={`${angle}-${index}`}
              castShadow
              position={[Math.sin(angle) * 0.76, -0.06, Math.cos(angle) * 0.4]}
              rotation={[0, angle, 0.1 * Math.sin(angle)]}
            >
              <cylinderGeometry args={[0.05, 0.02, 0.72 + index * 0.06, 8]} />
              <meshStandardMaterial color={index % 2 === 0 ? profile.foliageA : profile.foliageB} roughness={0.9} metalness={0.01} />
            </mesh>
          ))}
        </group>
      )}

      {showCanopy && profile.canopyStyle === 'round' && (
        <group ref={canopyRef} position={[0, trunkHeight * 0.76, 0]} scale={[canopyScale, canopyScale, canopyScale]}>
          {CANOPY_CLUSTERS.map(([x, y, z, radius], index) => (
            <mesh key={`${x}-${y}-${z}-${radius}`} castShadow position={[x, y, z]}>
              <icosahedronGeometry args={[radius, 1]} />
              <meshStandardMaterial
                color={index % 2 === 0 ? profile.foliageA : profile.foliageB}
                roughness={0.86}
                metalness={0.01}
              />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
};

const TreeVisual = ({ stage, rotation, daysInYear, zoom = 1, treeType = 'oak' }: { stage: string, rotation: number, daysInYear: number, zoom?: number, treeType?: string }) => {
  // Use stage-aware ratio for the outer container scale too, so the
  // motion.div wrapper itself grows with the tree geometry.
  const stageRatio = computeStageRatio(daysInYear);
  const treeScale = (0.72 + stageRatio * 0.40) * Math.max(0.7, Math.min(1.35, zoom));
  const yaw = (rotation * Math.PI) / 180;

  return (
    // Slightly larger canvas makes tree the unmistakable focal point
    <motion.div
      className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center"
      animate={{ scale: treeScale }}
      transition={{ type: 'spring', stiffness: 60, damping: 18 }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/70 to-transparent rounded-full blur-2xl" />
      <div className="absolute bottom-1 w-44 h-10 bg-[#5C4A39]/20 rounded-[100%] blur-md" />

      <Canvas
        className="w-full h-full pointer-events-none"
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 1.8, 6.6], fov: 44 }}
        gl={{ antialias: true, alpha: true }}
      >
        <fog attach="fog" args={['#E9F1E7', 5, 14]} />
        <hemisphereLight args={['#FCF6E9', '#4F5E4A', 0.75]} />
        <ambientLight intensity={0.4} />
        <directionalLight
          castShadow
          position={[4.5, 7, 2.6]}
          intensity={1.35}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0001}
        />
        <directionalLight position={[-4, 3, -4]} intensity={0.5} color="#d6e5d1" />

        <mesh receiveShadow position={[0, -1.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[3.6, 64]} />
          <meshStandardMaterial color="#7A654F" roughness={0.98} metalness={0.02} />
        </mesh>

        <mesh receiveShadow position={[0, -1.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.2, 2.95, 56]} />
          <meshStandardMaterial
            color="#4F3D2D"
            roughness={1}
            metalness={0}
            transparent
            opacity={0.22}
            side={THREE.DoubleSide}
          />
        </mesh>

        <ProceduralTree daysInYear={daysInYear} treeType={treeType} yaw={yaw} />
      </Canvas>
    </motion.div>
  );
};

type ViewType = 'home' | 'forest' | 'checkin' | 'meeting' | 'journal' | 'journal-list' | 'history' | 'reading';

const ActionButton = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <motion.button
    whileTap={{ scale: 0.95 }}
    onClick={() => {
      triggerHaptic(10);
      onClick?.();
    }}
    className={cn(
      /* Slightly more padding and gap for a polished tab-bar feel */
      "flex flex-col items-center justify-center gap-1.5 p-2 rounded-2xl border transition-all duration-300 flex-1 min-w-0",
      active 
        ? "bg-[#5A7D4D] border-[#5A7D4D] shadow-lg shadow-[#5A7D4D]/25" 
        : "bg-white/90 backdrop-blur-md border-black/5 shadow-sm hover:shadow-md hover:bg-white"
    )}
  >
    <div className={cn(
      "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
      active ? "bg-white/20 text-white" : "bg-[#EFF4EC] text-[#5A7D4D]"
    )}>
      <Icon size={17} />
    </div>
    <span className={cn(
      "text-[8px] font-bold uppercase tracking-[0.05em] transition-colors whitespace-nowrap",
      active ? "text-white" : "text-[#2D3328]/50"
    )}>{label}</span>
  </motion.button>
);

// --- Page Components ---

const PageWrapper = ({ children, id }: { children: React.ReactNode, id: string }) => (
  <motion.div
    key={id}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
    className="absolute inset-0 w-full h-full px-6 overflow-y-auto no-scrollbar flex flex-col items-center"
  >
    <div className="flex-1 w-full" />
    <div className="w-full flex flex-col items-center py-4 shrink-0">
      {children}
    </div>
    <div className="flex-1 w-full" />
  </motion.div>
);

const SettingsOverlay = ({ 
  isOpen, 
  onClose, 
  recoveryDate, 
  setRecoveryDate,
  setResetDate,
  treeName,
  setTreeName,
}: { 
  isOpen: boolean, 
  onClose: () => void,
  recoveryDate: string,
  setRecoveryDate: (date: string) => void,
  setResetDate: (date: string) => void,
  treeName: string,
  setTreeName: (name: string) => void,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  // Reset confirm state when modal closes
  useEffect(() => {
    if (!isOpen) setShowConfirm(false);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-8 overflow-y-auto max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-serif italic text-[#2D3328]">Settings</h2>
              <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full"><ChevronLeft className="rotate-90" /></button>
            </div>

            <section className="space-y-6">
              {/* Tree name */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#5A7D4D] mb-2">Tree Name</h3>
                <p className="text-sm text-gray-500 mb-4">Give your tree a personal name. It will appear on the home screen.</p>
                <input
                  type="text"
                  value={treeName}
                  onChange={e => setTreeName(e.target.value)}
                  placeholder="Your Tree"
                  maxLength={32}
                  className="w-full p-4 bg-[#F5F7F2] rounded-2xl text-lg font-serif outline-none focus:ring-2 focus:ring-[#5A7D4D]/20 border border-black/5"
                />
              </div>

              <div className="border-t border-black/5" />

              {/* Recovery date */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-[#5A7D4D] mb-2">Recovery Date</h3>
                <p className="text-sm text-gray-500 mb-4">Set the date your journey began. Your tree's growth is based on this date.</p>
                <input 
                  type="date" 
                  value={recoveryDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setRecoveryDate(e.target.value);
                    }
                  }}
                  className="w-full p-4 bg-[#F5F7F2] rounded-2xl text-lg font-serif outline-none focus:ring-2 focus:ring-[#5A7D4D]/20 border border-black/5"
                />
              </div>

              <div className="pt-4 border-t border-black/5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-red-500 mb-2">Reset Journey</h3>
                <p className="text-sm text-gray-500 mb-4">If you need to start over, you can reset your recovery date to today. Your previous check-ins and meetings will remain in your history.</p>
                
                {!showConfirm ? (
                  <button 
                    onClick={() => setShowConfirm(true)}
                    className="w-full py-4 bg-red-50 text-red-600 rounded-2xl font-bold uppercase tracking-widest text-xs border border-red-100 hover:bg-red-100 transition-colors"
                  >
                    Reset Date to Today
                  </button>
                ) : (
                  <div className="space-y-3 p-4 bg-red-50 rounded-2xl border border-red-100">
                    <p className="text-sm font-bold text-red-600 text-center">Are you sure?</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setShowConfirm(false)}
                        className="flex-1 py-3 bg-white text-gray-600 rounded-xl font-bold uppercase tracking-widest text-[10px] border border-gray-200"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setRecoveryDate(today);
                          setResetDate(today);
                          setShowConfirm(false);
                          onClose();
                        }}
                        className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold uppercase tracking-widest text-[10px]"
                      >
                        Yes, Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const WeatherEffects = ({ weather }: { weather: 'sun' | 'rain' }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
      <AnimatePresence mode="wait">
        {weather === 'sun' && (
          <motion.div
            key="sun"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
          >
            <motion.div 
              className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#F9E5C9] rounded-full blur-[100px]"
              animate={{ 
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3]
              }}
              transition={{ 
                duration: 8, 
                repeat: Infinity,
                ease: "easeInOut" 
              }}
            />
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-[#D4A373] rounded-full blur-[100px] opacity-10" />
          </motion.div>
        )}
        {weather === 'rain' && (
          <motion.div
            key="rain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
          >
            <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-[#6B8E9B] rounded-full blur-[120px] opacity-20" />
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-[1px] h-16 bg-gradient-to-b from-transparent via-[#5A7D4D]/30 to-transparent"
                style={{
                  left: `${5 + Math.random() * 90}%`,
                  top: `-10%`,
                }}
                animate={{
                  y: ['0vh', '110vh'],
                }}
                transition={{
                  duration: 1.5 + Math.random() * 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                  ease: "linear"
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ForestView = ({ completedTrees }: { completedTrees: any[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollXProgress } = useScroll({ container: scrollRef });
  
  // Parallax transforms for background elements
  const bgX1 = useTransform(scrollXProgress, [0, 1], ['0%', '-20%']);
  const bgX2 = useTransform(scrollXProgress, [0, 1], ['0%', '-40%']);
  const bgX3 = useTransform(scrollXProgress, [0, 1], ['0%', '-60%']);

  return (
    <PageWrapper id="forest">
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {/* Parallax Background Elements */}
        <motion.div 
          style={{ x: bgX1 }}
          className="absolute top-1/4 left-10 w-64 h-64 bg-[#8BA888]/10 rounded-full blur-[80px] pointer-events-none"
        />
        <motion.div 
          style={{ x: bgX2 }}
          className="absolute bottom-1/4 left-1/2 w-80 h-80 bg-[#D4A373]/10 rounded-full blur-[100px] pointer-events-none"
        />
        <motion.div 
          style={{ x: bgX3 }}
          className="absolute top-1/2 right-10 w-72 h-72 bg-[#6B8E9B]/10 rounded-full blur-[90px] pointer-events-none"
        />

        {/* Foreground Scrolling Container */}
        <div 
          ref={scrollRef}
          className="flex gap-8 overflow-x-auto pb-12 pt-8 snap-x no-scrollbar w-full px-12 items-end relative z-10"
        >
          {completedTrees.length === 0 ? (
            <div className="w-full text-center opacity-50 font-serif italic">
              Your forest is waiting to grow.
            </div>
          ) : (
            completedTrees.map((tree) => (
              <div key={tree.year} className="snap-center flex-shrink-0 flex flex-col items-center">
                <div className={cn("w-48 h-64 rounded-3xl border backdrop-blur-sm flex items-center justify-center relative overflow-hidden shadow-lg shadow-black/[0.08]", tree.bg, tree.border)}>
                  <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent" />
                  <tree.icon size={72} color={tree.color} className="opacity-80 drop-shadow-md relative z-10" />
                </div>
                <p className="mt-4 font-serif italic text-lg">{tree.year}</p>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">{tree.season} {tree.species}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </PageWrapper>
  );
};

export default function App() {
  const [recoveryDate, setRecoveryDate] = useState(() => {
    const saved = localStorage.getItem('recoveryDate');
    if (saved) return saved;
    const d = new Date();
    d.setDate(d.getDate() - 42); // default to 42 days ago
    return d.toISOString().split('T')[0];
  });

  // Tree name — displayed below the 3-D tree on the home screen
  const [treeName, setTreeName] = useState(() => {
    return localStorage.getItem('treeName') || '';
  });

  const [resetDate, setResetDate] = useState(() => {
    return localStorage.getItem('resetDate') || '';
  });

  useEffect(() => {
    localStorage.setItem('recoveryDate', recoveryDate);
  }, [recoveryDate]);

  useEffect(() => {
    localStorage.setItem('treeName', treeName);
  }, [treeName]);

  useEffect(() => {
    if (resetDate) {
      localStorage.setItem('resetDate', resetDate);
    }
  }, [resetDate]);

  const daysClean = Math.max(0, Math.floor((new Date().getTime() - new Date(recoveryDate).getTime()) / (1000 * 60 * 60 * 24)));
  
  const completedYears = Math.floor(daysClean / 365);
  const startYear = new Date(recoveryDate).getFullYear();
  
  const completedTrees = Array.from({ length: completedYears }).map((_, i) => {
    const config = SPECIES_CONFIG[i % SPECIES_CONFIG.length];
    return {
      year: startYear + i,
      season: 'Completed',
      ...config
    };
  });

  const currentYearIndex = Math.floor(daysClean / 365);
  const currentTreeConfig = SPECIES_CONFIG[currentYearIndex % SPECIES_CONFIG.length];
  const currentTreeType = currentTreeConfig.species.toLowerCase();
  
  const daysIntoCurrentYear = daysClean % 365;
  const growthPercent = Math.min(100, Math.round((daysIntoCurrentYear / 365) * 100));

  const [checkIns, setCheckIns] = useState(() => {
    const saved = localStorage.getItem('checkIns');
    return saved ? parseInt(saved, 10) : 12;
  });

  useEffect(() => {
    localStorage.setItem('checkIns', checkIns.toString());
  }, [checkIns]);

  const [view, setView] = useState<ViewType>('home');
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [isSpecOpen, setIsSpecOpen] = useState(false);
  const [weather, setWeather] = useState<'sun' | 'rain'>('sun');
  
  const [meetings, setMeetings] = useState<any[]>(() => {
    const saved = localStorage.getItem('meetings');
    if (saved) {
      try {
        const parsedMeetings = JSON.parse(saved);
        if (!Array.isArray(parsedMeetings)) return [];

        const hasLegacyDefaultMeetings =
          parsedMeetings.length === 2 &&
          parsedMeetings.some((meeting) => meeting?.name === 'Serenity Circle' && meeting?.time === '7:00 PM') &&
          parsedMeetings.some((meeting) => meeting?.name === 'Steps in the Park' && meeting?.time === '8:30 PM');

        return hasLegacyDefaultMeetings ? [] : parsedMeetings;
      } catch {
        return [];
      }
    }
    return [];
  });

  const [checkInHistory, setCheckInHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('checkInHistory');
    if (saved) return JSON.parse(saved);
    return [];
  });

  const [journalEntries, setJournalEntries] = useState<any[]>(() => {
    const saved = localStorage.getItem('journalEntries');
    if (saved) return JSON.parse(saved);
    return [];
  });

  const [readingMoments, setReadingMoments] = useState<any[]>(() => {
    const saved = localStorage.getItem('readingMoments');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [newJournal, setNewJournal] = useState('');
  const [historyFilter, setHistoryFilter] = useState<string>('All');

  useEffect(() => {
    localStorage.setItem('meetings', JSON.stringify(meetings));
  }, [meetings]);

  useEffect(() => {
    localStorage.setItem('checkInHistory', JSON.stringify(checkInHistory));
  }, [checkInHistory]);

  useEffect(() => {
    localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
  }, [journalEntries]);

  useEffect(() => {
    localStorage.setItem('readingMoments', JSON.stringify(readingMoments));
  }, [readingMoments]);

  const [isAddingMeeting, setIsAddingMeeting] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ name: '', time: '', day: 'Today', type: 'Online' });
  const [editingMeeting, setEditingMeeting] = useState<any | null>(null);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [checkInNote, setCheckInNote] = useState('');
  const [meetingTab, setMeetingTab] = useState<'my' | 'find'>('my');
  const [zipSearch, setZipSearch] = useState('');
  const [meetingSearchResults, setMeetingSearchResults] = useState<any[]>([]);
  const [meetingSearchLoading, setMeetingSearchLoading] = useState(false);
  const [meetingSearchError, setMeetingSearchError] = useState('');
  const [meetingSearchDone, setMeetingSearchDone] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showReadingCelebration, setShowReadingCelebration] = useState(false);
  const readingCelebrationTimer = useRef<number | null>(null);

  // --- "Water Your Tree" feature ---
  // Each entry records the day key, optional note, and ISO timestamp.
  // Migrates gracefully from the old string[] format.
  type WateredEntry = { dayKey: string; note: string; date: string };
  const [wateredDays, setWateredDays] = useState<WateredEntry[]>(() => {
    const saved = localStorage.getItem('wateredDays');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      // Migrate old string entries to the new object shape
      return parsed.map((entry: unknown) =>
        typeof entry === 'string'
          ? { dayKey: entry, note: '', date: entry }
          : (entry as WateredEntry)
      );
    } catch { return []; }
  });
  const [showWaterCelebration, setShowWaterCelebration] = useState(false);
  const [showWaterInput, setShowWaterInput] = useState(false);  // inline note expanded
  const [waterNote, setWaterNote] = useState('');               // textarea value
  const waterCelebrationTimer = useRef<number | null>(null);

  // Milestone rewards
  const MILESTONES = [
    { days: 7,   emoji: '🌱', label: '7 Days Strong!' },
    { days: 30,  emoji: '🌿', label: '30 Days Strong!' },
    { days: 90,  emoji: '🌳', label: '90 Days Strong!' },
    { days: 365, emoji: '🌟', label: 'One Full Year!' },
  ];
  const [seenMilestones, setSeenMilestones] = useState<number[]>(() => {
    const saved = localStorage.getItem('seenMilestones');
    if (!saved) return [];
    try { return JSON.parse(saved); } catch { return []; }
  });
  const [activeMilestone, setActiveMilestone] = useState<{ days: number; emoji: string; label: string } | null>(null);
  const milestoneTimer = useRef<number | null>(null);

  // Persist watered days to localStorage
  useEffect(() => {
    localStorage.setItem('wateredDays', JSON.stringify(wateredDays));
  }, [wateredDays]);

  // Save state on close
  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.setItem('recoveryDate', recoveryDate);
      if (resetDate) localStorage.setItem('resetDate', resetDate);
      localStorage.setItem('checkIns', checkIns.toString());
      localStorage.setItem('meetings', JSON.stringify(meetings));
      localStorage.setItem('checkInHistory', JSON.stringify(checkInHistory));
      localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
      localStorage.setItem('readingMoments', JSON.stringify(readingMoments));
      localStorage.setItem('wateredDays', JSON.stringify(wateredDays));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [recoveryDate, resetDate, checkIns, meetings, checkInHistory, journalEntries, readingMoments]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (readingCelebrationTimer.current !== null) {
        window.clearTimeout(readingCelebrationTimer.current);
      }
    };
  }, []);

  // Cleanup water celebration timer on unmount
  useEffect(() => {
    return () => {
      if (waterCelebrationTimer.current !== null) {
        window.clearTimeout(waterCelebrationTimer.current);
      }
    };
  }, []);

  // Check for newly reached milestones
  useEffect(() => {
    const hit = MILESTONES.find(m => daysClean >= m.days && !seenMilestones.includes(m.days));
    if (hit) {
      setSeenMilestones(prev => {
        const next = [...prev, hit.days];
        localStorage.setItem('seenMilestones', JSON.stringify(next));
        return next;
      });
      setActiveMilestone(hit);
      if (milestoneTimer.current !== null) window.clearTimeout(milestoneTimer.current);
      milestoneTimer.current = window.setTimeout(() => setActiveMilestone(null), 5000);
    }
  }, [daysClean]);

  // Cleanup milestone timer on unmount
  useEffect(() => {
    return () => {
      if (milestoneTimer.current !== null) window.clearTimeout(milestoneTimer.current);
    };
  }, []);
  
  // Calculate day of year (1-365) to select the reading
  const getDayOfYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  };
  
  const currentReadingIndex = (getDayOfYear() - 1) % DAILY_READINGS.length;
  const [readingOverride, setReadingOverride] = useState<number | null>(null);
  const currentReading = DAILY_READINGS[readingOverride ?? currentReadingIndex];
  const todayDayKey = getLocalDayKey();
  const hasReadingSunToday = readingMoments.some((entry) => entry.dayKey === todayDayKey);

  // True if the user already watered their tree today (prevents double-watering)
  const hasWateredToday = wateredDays.some(e => e.dayKey === todayDayKey);

  const searchMeetingsByZip = async () => {
    const zip = zipSearch.trim();
    if (!/^\d{5}$/.test(zip)) {
      setMeetingSearchError('Please enter a valid 5-digit US zip code.');
      return;
    }
    setMeetingSearchLoading(true);
    setMeetingSearchError('');
    setMeetingSearchResults([]);
    setMeetingSearchDone(false);
    try {
      // Step 1: Convert zip to lat/lng
      const geoRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!geoRes.ok) {
        setMeetingSearchError('Zip code not found. Please try another.');
        return;
      }
      const geoData = await geoRes.json();
      const place = geoData.places?.[0];
      if (!place) {
        setMeetingSearchError('Location not found for this zip code.');
        return;
      }
      const lat = parseFloat(place.latitude);
      const lng = parseFloat(place.longitude);

      // Step 2: Find AA/recovery meetings (nested try so CORS failures degrade gracefully)
      let results: any[] = [];
      try {
        const controller = new AbortController();
        const tid = window.setTimeout(() => controller.abort(), 10000);
        const meetRes = await fetch(
          `https://api.meeting-guide.org/meetings/?lat=${lat}&lng=${lng}`,
          { signal: controller.signal }
        );
        window.clearTimeout(tid);
        if (meetRes.ok) {
          const payload = await meetRes.json();
          const arr = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.meetings)
              ? payload.meetings
              : [];
          results = arr.slice(0, 30);
        }
      } catch {
        // Meeting Guide API unavailable (likely CORS) – show external links below
      }

      setMeetingSearchResults(results);
      if (results.length === 0) {
        setMeetingSearchError('No results found in our database for this area.');
      }
    } catch {
      setMeetingSearchError('Could not look up this zip code. Please check your connection.');
    } finally {
      setMeetingSearchDone(true);
      setMeetingSearchLoading(false);
    }
  };

  const removeMeeting = (meetingToRemove: any, indexToRemove: number) => {
    triggerHaptic(10);
    setMeetings((prevMeetings) => prevMeetings.filter((meeting, index) => {
      if (meetingToRemove.createdAt) {
        return meeting.createdAt !== meetingToRemove.createdAt;
      }
      return index !== indexToRemove;
    }));
  };

  const deleteHistoryItem = (item: any) => {
    triggerHaptic(10);
    if (item.type === 'checkin') {
      setCheckInHistory(prev => prev.filter(c => c.date !== item.data.date));
    } else if (item.type === 'meeting') {
      setMeetings(prev => prev.filter(m => !(m.name === item.data.name && m.createdAt === item.data.createdAt)));
    } else if (item.type === 'journal') {
      setJournalEntries(prev => prev.filter(j => j.date !== item.data.date));
    } else if (item.type === 'reading') {
      setReadingMoments(prev => prev.filter(r => r.date !== item.data.date));
    } else if (item.type === 'water') {
      setWateredDays(prev => prev.filter(w => w.date !== item.data.date));
    }
  };

  const handleReadingAffirmation = () => {
    const now = new Date();
    const dayKey = getLocalDayKey(now);

    triggerHaptic([20, 40, 20, 40, 20]);
    setWeather('sun');
    setShowReadingCelebration(true);

    setReadingMoments((prevMoments) => {
      const alreadyLoggedToday = prevMoments.some((entry) => entry.dayKey === dayKey);
      if (alreadyLoggedToday) {
        return prevMoments;
      }
      return [
        {
          date: now.toISOString(),
          dayKey,
          quote: currentReading,
        },
        ...prevMoments,
      ];
    });

    if (readingCelebrationTimer.current !== null) {
      window.clearTimeout(readingCelebrationTimer.current);
    }

    readingCelebrationTimer.current = window.setTimeout(() => {
      setShowReadingCelebration(false);
      setView('home');
      readingCelebrationTimer.current = null;
    }, 1600);
  };

  // Water the tree: saves entry with optional note, shows celebration.
  // Only one watering is allowed per calendar day.
  const handleWaterTree = (note: string) => {
    if (hasWateredToday) return;
    triggerHaptic([20, 40, 60]);
    setWateredDays(prev => [
      { dayKey: todayDayKey, note: note.trim(), date: new Date().toISOString() },
      ...prev,
    ]);
    setShowWaterInput(false);
    setWaterNote('');
    setShowWaterCelebration(true);
    if (waterCelebrationTimer.current !== null) {
      window.clearTimeout(waterCelebrationTimer.current);
    }
    waterCelebrationTimer.current = window.setTimeout(() => {
      setShowWaterCelebration(false);
      waterCelebrationTimer.current = null;
    }, 2500);
  };

  const currentStage = STAGES.find(s => daysIntoCurrentYear >= s.minDays && daysIntoCurrentYear <= s.maxDays) || STAGES[0];

  // Handle drag and pinch gestures
  const bind = useGesture(
    {
      onDrag: ({ delta: [dx] }) => {
        setRotation((prev) => {
          const next = prev + dx * 0.5;
          if (Math.abs(Math.floor(next / 15) - Math.floor(prev / 15)) > 0) {
            triggerHaptic(10);
          }
          return next;
        });
      },
      onPinch: ({ offset: [d] }) => {
        setZoom((prev) => {
          if (Math.abs(Math.floor(d * 10) - Math.floor(prev * 10)) > 0) {
            triggerHaptic(10);
          }
          return d;
        });
      },
      onWheel: ({ delta: [, dy] }) => {
        setZoom((prev) => {
          const next = Math.max(0.5, Math.min(3, prev - dy * 0.01));
          if (Math.abs(Math.floor(next * 10) - Math.floor(prev * 10)) > 0) {
            triggerHaptic(10);
          }
          return next;
        });
      },
    },
    {
      drag: { filterTaps: true },
      pinch: { scaleBounds: { min: 0.5, max: 3 }, modifierKey: null },
    }
  );

  const renderView = () => {
    switch (view) {
      case 'home':
        return (
          <PageWrapper id="home">
            <WeatherEffects weather={weather} />

            {/* Tree interaction area — drag to rotate, pinch to zoom */}
            <div
              {...(bind() as any)}
              style={{ touchAction: 'none' }}
              className="cursor-grab active:cursor-grabbing relative z-10"
            >
              {/* Watered-today: soft blue-green glow ring under the tree */}
              <AnimatePresence>
                {hasWateredToday && (
                  <motion.div
                    key="water-glow"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      background: 'radial-gradient(circle, rgba(107,173,187,0.22) 0%, transparent 70%)',
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Brief scale-pulse on the tree when watering animation fires */}
              <motion.div
                animate={showWaterCelebration ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
              >
                <TreeVisual stage={currentStage.name} rotation={rotation} daysInYear={daysIntoCurrentYear} zoom={zoom} treeType={currentTreeType} />
              </motion.div>

              {/* Sun badge — shown when today's daily reading was completed */}
              <AnimatePresence>
                {hasReadingSunToday && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.6 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.6 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="absolute top-6 right-2 sm:right-6"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                      className="w-14 h-14 rounded-full bg-[#F9E5C9]/80 border border-[#D4A373]/30 shadow-lg shadow-[#D4A373]/30 flex items-center justify-center"
                    >
                      <Sun size={24} className="text-[#D4A373]" />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Water-drop badge — shown when tree has been watered today */}
              <AnimatePresence>
                {hasWateredToday && (
                  <motion.div
                    key="water-badge"
                    initial={{ opacity: 0, y: 10, scale: 0.6 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.6 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="absolute top-6 left-2 sm:left-6"
                  >
                    <motion.div
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-14 h-14 rounded-full bg-[#D4F0F7]/80 border border-[#6BADBBA]/30 shadow-lg shadow-[#6BADBB]/20 flex items-center justify-center"
                    >
                      <Droplets size={24} className="text-[#4A9BAA]" />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tree name: shown below the 3-D tree, tap the pencil to rename */}
            <div className="flex items-center justify-center gap-2 mt-2 mb-1">
              <h2 className="text-2xl font-serif italic text-[#2D3328] tracking-tight">
                {treeName.trim() || 'Your Tree'}
              </h2>
              <button
                onClick={() => setIsSpecOpen(true)}
                className="p-1.5 rounded-full text-gray-300 hover:text-[#5A7D4D] transition-colors"
                aria-label="Rename tree"
              >
                <PenLine size={13} />
              </button>
            </div>

            {/* Stats: glass-morphism cards for Days Clean + Check-ins */}
            <div className="mt-2 text-center w-full max-w-xs mx-auto space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 bg-white/75 backdrop-blur-sm rounded-2xl py-4 px-3 shadow-sm border border-black/[0.05]">
                  <motion.div className="text-4xl font-serif italic text-[#2D3328] leading-none">{daysClean}</motion.div>
                  <p className="text-[9px] uppercase tracking-[0.25em] font-bold text-[#5A7D4D] mt-1.5">Days Clean</p>
                </div>
                <div className="flex-1 bg-white/75 backdrop-blur-sm rounded-2xl py-4 px-3 shadow-sm border border-black/[0.05]">
                  <motion.div className="text-4xl font-serif italic text-[#2D3328] leading-none">{checkInHistory.length}</motion.div>
                  <p className="text-[9px] uppercase tracking-[0.25em] font-bold text-[#5A7D4D] mt-1.5">Check-ins</p>
                </div>
              </div>

              {/* Growth progress bar */}
              <div className="bg-white/75 backdrop-blur-sm rounded-2xl px-5 py-3.5 shadow-sm border border-black/[0.05] flex flex-col gap-2">
                <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${growthPercent}%` }}
                    className="h-full bg-gradient-to-r from-[#5A7D4D] to-[#8BA888] rounded-full"
                  />
                </div>
                {/* Stage name + description — animated when stage changes */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStage.name}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col items-center gap-0.5"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#5A7D4D]">
                      {currentStage.name} &bull; {growthPercent}% to Maturity
                    </p>
                    <p className="text-[9px] text-gray-400 font-serif italic text-center leading-snug">
                      {currentStage.description}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* ── Water Your Tree ── */}
              <AnimatePresence mode="wait">
                {showWaterCelebration ? (
                  // Confirmation shown for 2.5 s after submitting
                  <motion.div
                    key="watered-confirm"
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.95 }}
                    transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                    className="flex items-center justify-center gap-2.5 bg-[#D4F0F7]/70 backdrop-blur-sm border border-[#6BADBB]/25 rounded-2xl py-4 px-5 shadow-sm"
                  >
                    <Droplets size={18} className="text-[#4A9BAA] shrink-0" />
                    <p className="text-sm font-serif italic text-[#2D3328]">
                      Your tree has been watered 🌱
                    </p>
                  </motion.div>

                ) : hasWateredToday ? (
                  // Already-watered: muted pill for the rest of the day
                  <motion.div
                    key="watered-done"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2 bg-black/[0.03] border border-black/[0.05] rounded-2xl py-3.5 px-5"
                  >
                    <Droplets size={15} className="text-[#4A9BAA]" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Watered Today ✓
                    </p>
                  </motion.div>

                ) : showWaterInput ? (
                  // ── Inline check-in note expanded ──
                  <motion.div
                    key="water-input"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="bg-white/80 backdrop-blur-sm border border-black/[0.06] rounded-2xl p-4 shadow-sm space-y-3"
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Droplets size={15} className="text-[#4A9BAA]" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#4A9BAA]">
                          Water Your Tree
                        </p>
                      </div>
                      {/* Cancel collapses the input without watering */}
                      <button
                        onClick={() => { setShowWaterInput(false); setWaterNote(''); }}
                        className="p-1 rounded-full text-gray-300 hover:text-gray-500 transition-colors"
                        aria-label="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Note textarea — optional, placeholder nudges reflection */}
                    <textarea
                      value={waterNote}
                      onChange={e => setWaterNote(e.target.value)}
                      placeholder="How are you feeling today? (optional)"
                      rows={3}
                      autoFocus
                      className="w-full p-3 bg-[#F5F7F2] rounded-xl border border-black/5 text-sm font-serif outline-none focus:ring-2 focus:ring-[#4A9BAA]/20 resize-none text-[#2D3328] placeholder:text-gray-300"
                    />

                    {/* Submit — watering doesn't require a note */}
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleWaterTree(waterNote)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-[#4A9BAA] to-[#6BADBB] text-white rounded-xl font-bold uppercase tracking-widest text-xs shadow-md shadow-[#4A9BAA]/20"
                    >
                      <Droplets size={14} />
                      Water My Tree
                    </motion.button>
                  </motion.div>

                ) : (
                  // Primary button — click opens the note input
                  <motion.button
                    key="water-btn"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowWaterInput(true)}
                    className="w-full flex items-center justify-center gap-2.5 py-4 bg-gradient-to-r from-[#4A9BAA] to-[#6BADBB] text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-md shadow-[#4A9BAA]/25 hover:shadow-lg hover:shadow-[#4A9BAA]/30 transition-shadow"
                  >
                    <Droplets size={16} />
                    Water Your Tree Today
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </PageWrapper>
        );
      case 'forest':
        return <ForestView completedTrees={completedTrees} />;
      case 'checkin':
        return (
          <PageWrapper id="checkin">
            <div className="text-center space-y-6 max-w-xs">
              <div className="w-20 h-20 bg-[#5A7D4D]/10 rounded-full flex items-center justify-center mx-auto text-[#5A7D4D]">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-3xl font-serif italic">Daily Check-in</h2>
              <p className="text-sm text-gray-400 font-serif italic leading-relaxed">"How is your spirit feeling today? Every breath is a new beginning."</p>
              <div className="grid grid-cols-3 gap-4 pt-4">
                {['Calm', 'Restless', 'Strong'].map(mood => (
                  <button 
                    key={mood} 
                    onClick={() => {
                      triggerHaptic(10);
                      setSelectedMood(mood);
                    }}
                    className={cn(
                      /* Tactile mood buttons with hover lift */
                      "p-4 rounded-2xl border transition-all duration-200 text-[10px] font-bold uppercase tracking-wider",
                      selectedMood === mood 
                        ? "bg-[#5A7D4D] border-[#5A7D4D]/30 text-white shadow-md shadow-[#5A7D4D]/25" 
                        : "bg-white border-black/5 hover:border-[#5A7D4D]/20 hover:bg-[#5A7D4D]/5 text-gray-500 hover:text-[#5A7D4D]"
                    )}
                  >
                    {mood}
                  </button>
                ))}
              </div>
              <div className="w-full text-left space-y-2">
                <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Or describe how you feel</label>
                <textarea
                  value={checkInNote}
                  onChange={e => setCheckInNote(e.target.value)}
                  placeholder="Write anything that's on your mind…"
                  rows={3}
                  className="w-full p-3 bg-white rounded-2xl border border-black/5 text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20 resize-none text-gray-700 placeholder:text-gray-300"
                />
              </div>
              <button 
                onClick={() => {
                  if (!selectedMood && !checkInNote.trim()) return;
                  triggerHaptic([30, 50, 30]);
                  setCheckIns(prev => prev + 1);
                  setCheckInHistory([{ date: new Date().toISOString(), mood: selectedMood, note: checkInNote.trim() || undefined }, ...checkInHistory]);
                  setWeather(selectedMood === 'Restless' ? 'rain' : 'sun');
                  setSelectedMood(null);
                  setCheckInNote('');
                  setView('home');
                }}
                disabled={!selectedMood && !checkInNote.trim()}
                className="w-full py-4 bg-[#5A7D4D] text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-[#5A7D4D]/20 disabled:opacity-50 transition-opacity"
              >
                Complete Check-in
              </button>
            </div>
          </PageWrapper>
        );
      case 'meeting':
        if (editingMeeting) {
          return (
            <PageWrapper id="meeting-edit">
              <div className="text-center space-y-6 w-full max-w-sm">
                <div className="w-20 h-20 bg-[#D4A373]/10 rounded-full flex items-center justify-center mx-auto text-[#D4A373]">
                  <PenLine size={40} />
                </div>
                <h2 className="text-3xl font-serif italic">Edit Meeting</h2>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-6 rounded-3xl border border-black/5 space-y-4 text-left shadow-sm"
                >
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Meeting Name</label>
                    <input
                      type="text"
                      value={editingMeeting.name}
                      onChange={e => setEditingMeeting({ ...editingMeeting, name: e.target.value })}
                      className="w-full mt-1 p-3 bg-[#F5F7F2] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20"
                      placeholder="e.g. Morning Reflections"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Day</label>
                      <input
                        type="text"
                        value={editingMeeting.day}
                        onChange={e => setEditingMeeting({ ...editingMeeting, day: e.target.value })}
                        className="w-full mt-1 p-3 bg-[#F5F7F2] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20"
                        placeholder="e.g. Today, Monday"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Time</label>
                      <input
                        type="text"
                        value={editingMeeting.time}
                        onChange={e => setEditingMeeting({ ...editingMeeting, time: e.target.value })}
                        className="w-full mt-1 p-3 bg-[#F5F7F2] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Type</label>
                    <select
                      value={editingMeeting.type}
                      onChange={e => setEditingMeeting({ ...editingMeeting, type: e.target.value })}
                      className="w-full mt-1 p-3 bg-[#F5F7F2] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20"
                    >
                      <option>Online</option>
                      <option>In-person</option>
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setEditingMeeting(null)}
                      className="flex-1 py-3 rounded-xl font-bold uppercase tracking-widest text-[10px] text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (editingMeeting.name && editingMeeting.time) {
                          triggerHaptic([30, 50, 30]);
                          
                          const updatedMeetings = meetings.map(m =>
                            m.createdAt === editingMeeting.createdAt
                              ? editingMeeting
                              : m
                          );
                          setMeetings(updatedMeetings);
                          setEditingMeeting(null);
                        }
                      }}
                      className="flex-1 py-3 bg-[#5A7D4D] text-white rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-md shadow-[#5A7D4D]/20 disabled:opacity-50"
                      disabled={!editingMeeting.name || !editingMeeting.time}
                    >
                      Save
                    </button>
                  </div>
                </motion.div>
              </div>
            </PageWrapper>
          );
        }
        return (
          <PageWrapper id="meeting">
            <div className="text-center space-y-6 w-full max-w-sm">
              <div className="w-20 h-20 bg-[#D4A373]/10 rounded-full flex items-center justify-center mx-auto text-[#D4A373]">
                <Users size={40} />
              </div>
              <h2 className="text-3xl font-serif italic">Community</h2>

              {/* Tab switcher */}
              <div className="flex bg-black/5 rounded-2xl p-1 gap-1">
                <button
                  onClick={() => setMeetingTab('my')}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors",
                    meetingTab === 'my' ? "bg-white text-[#5A7D4D] shadow-sm" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  My Meetings
                </button>
                <button
                  onClick={() => setMeetingTab('find')}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors",
                    meetingTab === 'find' ? "bg-white text-[#5A7D4D] shadow-sm" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  Find Meetings
                </button>
              </div>

              {meetingTab === 'my' ? (
                <>
                  {isAddingMeeting ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className="bg-white p-6 rounded-3xl border border-black/5 space-y-4 text-left shadow-sm"
                    >
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Meeting Name</label>
                        <input 
                          type="text" 
                          value={newMeeting.name}
                          onChange={e => setNewMeeting({...newMeeting, name: e.target.value})}
                          className="w-full mt-1 p-3 bg-[#F5F7F2] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20"
                          placeholder="e.g. Morning Reflections"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Day</label>
                          <input 
                            type="text" 
                            value={newMeeting.day}
                            onChange={e => setNewMeeting({...newMeeting, day: e.target.value})}
                            className="w-full mt-1 p-3 bg-[#F5F7F2] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20"
                            placeholder="e.g. Today, Monday"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Time</label>
                          <input 
                            type="time" 
                            value={newMeeting.time}
                            onChange={e => setNewMeeting({...newMeeting, time: e.target.value})}
                            className="w-full mt-1 p-3 bg-[#F5F7F2] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Type</label>
                        <select 
                          value={newMeeting.type}
                          onChange={e => setNewMeeting({...newMeeting, type: e.target.value})}
                          className="w-full mt-1 p-3 bg-[#F5F7F2] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20"
                        >
                          <option>Online</option>
                          <option>In-person</option>
                        </select>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button 
                          onClick={() => setIsAddingMeeting(false)}
                          className="flex-1 py-3 rounded-xl font-bold uppercase tracking-widest text-[10px] text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => {
                            if (newMeeting.name && newMeeting.time) {
                              triggerHaptic([30, 50, 30]);
                              
                              let formattedTime = newMeeting.time;
                              try {
                                const [hours, minutes] = newMeeting.time.split(':');
                                const h = parseInt(hours);
                                const ampm = h >= 12 ? 'PM' : 'AM';
                                const h12 = h % 12 || 12;
                                formattedTime = `${h12}:${minutes} ${ampm}`;
                              } catch(e) {}

                              setMeetings([{ ...newMeeting, time: formattedTime, createdAt: new Date().toISOString() }, ...meetings]);
                              setCheckIns(prev => prev + 1);
                              setIsAddingMeeting(false);
                              setNewMeeting({ name: '', time: '', day: 'Today', type: 'Online' });
                            }
                          }}
                          className="flex-1 py-3 bg-[#5A7D4D] text-white rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-md shadow-[#5A7D4D]/20 disabled:opacity-50"
                          disabled={!newMeeting.name || !newMeeting.time}
                        >
                          Save
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <>
                      <div className="space-y-3 pb-4 w-full">
                        {meetings.length === 0 ? (
                          <p className="text-sm text-gray-400 italic text-center py-8">No meetings logged yet.</p>
                        ) : (
                          meetings.map((m, i) => (
                            <div key={m.createdAt || `${m.name}-${m.time}-${i}`} className="p-4 bg-white rounded-2xl border border-black/5 shadow-sm flex justify-between items-center text-left">
                              <div>
                                <p className="text-xs font-bold text-[#5A7D4D]">{m.day} • {m.time}</p>
                                <p className="font-serif text-lg">{m.name}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">{m.type}</span>
                                <button
                                  onClick={() => setEditingMeeting(m)}
                                  className="p-2 -m-2 text-gray-400 hover:text-gray-600"
                                  aria-label="Edit meeting"
                                >
                                  <PenLine size={14} />
                                </button>
                                <button
                                  onClick={() => removeMeeting(m, i)}
                                  className="p-2 -m-2 text-gray-400 hover:text-red-500"
                                  aria-label="Delete meeting"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          triggerHaptic(10);
                          setIsAddingMeeting(true);
                        }}
                        className="w-full py-4 border-2 border-dashed border-[#5A7D4D]/20 text-[#5A7D4D] rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-[#5A7D4D]/5 transition-colors"
                      >
                        + Log New Meeting
                      </button>
                    </>
                  )}
                </>
              ) : (
                /* Find Meetings tab */
                <div className="space-y-4 w-full text-left">
                  <p className="text-xs text-gray-500 text-center italic">Search for AA &amp; recovery meetings near a zip code.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={zipSearch}
                      onChange={e => {
                        setZipSearch(e.target.value.replace(/\D/g, ''));
                        setMeetingSearchError('');
                        setMeetingSearchDone(false);
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') searchMeetingsByZip(); }}
                      placeholder="Enter zip code"
                      className="flex-1 p-3 bg-white rounded-2xl border border-black/5 text-sm outline-none focus:ring-2 focus:ring-[#5A7D4D]/20"
                    />
                    <button
                      onClick={searchMeetingsByZip}
                      disabled={meetingSearchLoading}
                      className="px-4 py-3 bg-[#5A7D4D] text-white rounded-2xl flex items-center gap-2 text-xs font-bold uppercase tracking-widest shadow-md shadow-[#5A7D4D]/20 disabled:opacity-60 transition-opacity"
                    >
                      {meetingSearchLoading
                        ? <Loader2 size={16} className="animate-spin" />
                        : <Search size={16} />
                      }
                    </button>
                  </div>

                  {meetingSearchError && !meetingSearchLoading && (
                    <p className="text-xs text-red-400 text-center">{meetingSearchError}</p>
                  )}

                  {/* External fallback – shown whenever a search has been done */}
                  {meetingSearchDone && !meetingSearchLoading && (
                    <div className="rounded-2xl border border-[#D4A373]/30 bg-[#D4A373]/10 p-4 space-y-2">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-[#D4A373] text-center">Search directly</p>
                      <a
                        href={`https://www.google.com/maps/search/AA+meetings+near+${zipSearch}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-white rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors border border-black/5"
                      >
                        <Search size={12} /> Google Maps — AA meetings near {zipSearch}
                      </a>
                      <a
                        href="https://www.aa.org/find-aa-resources/meetings"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-white rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors border border-black/5"
                      >
                        <Users size={12} /> AA Official Meeting Finder
                      </a>
                    </div>
                  )}

                  {meetingSearchLoading && (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <Loader2 size={28} className="animate-spin text-[#5A7D4D]" />
                      <p className="text-xs text-gray-400">Searching for nearby meetings…</p>
                    </div>
                  )}

                  {!meetingSearchLoading && meetingSearchResults.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 text-center">{meetingSearchResults.length} meetings found</p>
                      {meetingSearchResults.map((m: any, i: number) => {
                        const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const dayLabel = typeof m.day === 'number' ? DAYS[m.day] : (m.day || '');
                        let timeLabel = m.time || '';
                        try {
                          if (/^\d{2}:\d{2}$/.test(timeLabel)) {
                            const [h, min] = timeLabel.split(':').map(Number);
                            const ampm = h >= 12 ? 'PM' : 'AM';
                            timeLabel = `${h % 12 || 12}:${String(min).padStart(2, '0')} ${ampm}`;
                          }
                        } catch {}
                        const types: string[] = Array.isArray(m.types) ? m.types : [];
                        const address = [m.address, m.city, m.state].filter(Boolean).join(', ');
                        return (
                          <div key={`${m.slug || m.name}-${i}`} className="p-4 bg-white rounded-2xl border border-black/5 shadow-sm text-left space-y-1">
                            <p className="font-serif text-base leading-snug">{m.name}</p>
                            <p className="text-xs font-bold text-[#5A7D4D]">{dayLabel}{dayLabel && timeLabel ? ' · ' : ''}{timeLabel}</p>
                            {address && (
                              <div className="flex items-start gap-1 text-xs text-gray-500">
                                <MapPin size={11} className="mt-0.5 shrink-0" />
                                <span>{address}</span>
                              </div>
                            )}
                            {types.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {types.slice(0, 4).map(t => (
                                  <span key={t} className="px-2 py-0.5 bg-[#5A7D4D]/10 text-[#5A7D4D] rounded-full text-[9px] font-bold uppercase tracking-widest">{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </PageWrapper>
        );
      case 'journal':
        return (
          <PageWrapper id="journal">
            <div className="w-full max-w-sm space-y-6 flex flex-col py-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#8BA888]/10 rounded-full flex items-center justify-center text-[#8BA888]">
                  <PenLine size={24} />
                </div>
                <h2 className="text-3xl font-serif italic">Journal</h2>
              </div>
              <textarea 
                value={newJournal}
                onChange={(e) => setNewJournal(e.target.value)}
                placeholder="Write your thoughts here..."
                className="w-full min-h-[200px] p-6 bg-white rounded-3xl border border-black/5 focus:outline-none focus:ring-2 focus:ring-[#5A7D4D]/20 font-serif text-lg resize-none"
              />
              <button 
                onClick={() => {
                  if (!newJournal.trim()) return;
                  triggerHaptic(10);
                  setJournalEntries([{ date: new Date().toISOString(), text: newJournal }, ...journalEntries]);
                  setNewJournal('');
                  setView('journal-list');
                }}
                className="w-full py-4 bg-[#2D3328] text-white rounded-2xl font-bold uppercase tracking-widest text-xs disabled:opacity-50"
                disabled={!newJournal.trim()}
              >
                Save Reflection
              </button>
            </div>
          </PageWrapper>
        );
      case 'journal-list':
        return (
          <PageWrapper id="journal-list">
            <div className="w-full max-w-sm space-y-6 flex flex-col py-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#8BA888]/10 rounded-full flex items-center justify-center text-[#8BA888]">
                    <BookOpen size={20} />
                  </div>
                  <h2 className="text-2xl font-serif italic">My Journal</h2>
                </div>
                <button
                  onClick={() => { triggerHaptic(10); setView('journal'); }}
                  className="px-4 py-2 bg-[#8BA888]/15 text-[#5A7D4D] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#8BA888]/25 transition-colors"
                >
                  + New Entry
                </button>
              </div>
              {journalEntries.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-12">Your reflections will appear here.</p>
              ) : (
                <div className="space-y-5 pb-20">
                  {journalEntries.map((entry, i) => {
                    const d = new Date(entry.date);
                    const dateStr = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                    const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                    return (
                      <div key={entry.date} className="bg-white rounded-3xl border border-black/5 shadow-md shadow-black/[0.04] overflow-hidden">
                        <div className="px-5 pt-4 pb-3 border-b border-black/5 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-[#5A7D4D]">{dateStr}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{timeStr}</p>
                          </div>
                          <button
                            onClick={() => deleteHistoryItem({ type: 'journal', date: d, data: entry })}
                            className="p-1.5 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
                            aria-label="Delete entry"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <p className="font-serif text-base leading-relaxed text-[#2D3328] px-5 py-4 whitespace-pre-wrap">{entry.text}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </PageWrapper>
        );
      case 'history':
        const allHistory = [
          ...checkInHistory.map(c => ({ type: 'checkin', date: new Date(c.date), data: c })),
          ...meetings.map(m => ({ type: 'meeting', date: new Date(m.createdAt || new Date()), data: m })),
          ...journalEntries.map(j => ({ type: 'journal', date: new Date(j.date), data: j })),
          ...readingMoments.map(r => ({ type: 'reading', date: new Date(r.date), data: r })),
          ...wateredDays.filter(w => w.note).map(w => ({ type: 'water', date: new Date(w.date), data: w }))
        ].sort((a, b) => b.date.getTime() - a.date.getTime());

        const availableMonths = ['All', ...Array.from(new Set(allHistory.map(item => 
          item.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        )))];

        const filteredHistory = historyFilter === 'All' 
          ? allHistory 
          : allHistory.filter(item => item.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) === historyFilter);

        return (
          <PageWrapper id="history">
            <div className="w-full max-w-sm space-y-6 flex flex-col py-8">
              <h2 className="text-3xl font-serif italic">Your Journey</h2>
              
              {availableMonths.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4">
                  {availableMonths.map(month => (
                    <button
                      key={month}
                      onClick={() => {
                        triggerHaptic(10);
                        setHistoryFilter(month);
                      }}
                      className={cn(
                        "px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors",
                        historyFilter === month
                          ? "bg-[#5A7D4D] text-white"
                          : "bg-white border border-black/5 text-gray-500 hover:bg-gray-50"
                      )}
                    >
                      {month}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-4 pb-20 w-full">
                {filteredHistory.length === 0 ? (
                  <p className="text-gray-400 text-center italic mt-10">Your journey history will appear here.</p>
                ) : filteredHistory.map((item, i) => (
                  <div
                    key={i}
                    /* Colored left accent border coded by entry type */
                    className="flex gap-4 items-start bg-white p-4 rounded-2xl border border-black/5 shadow-sm border-l-[3px]"
                    style={{ borderLeftColor: item.type === 'checkin' ? '#5A7D4D' : item.type === 'meeting' ? '#D4A373' : item.type === 'journal' ? '#8BA888' : item.type === 'water' ? '#6B8E9B' : '#C9A96E' }}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#F5F7F2] flex items-center justify-center flex-shrink-0">
                      {item.type === 'checkin' && <CheckCircle2 size={16} className="text-[#5A7D4D]" />}
                      {item.type === 'meeting' && <Users size={16} className="text-[#D4A373]" />}
                      {item.type === 'journal' && <PenLine size={16} className="text-[#8BA888]" />}
                      {item.type === 'reading' && <Sun size={16} className="text-[#D4A373]" />}
                      {item.type === 'water' && <span className="text-base leading-none">💧</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        {item.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {item.type === 'checkin' && (
                        <>
                          {item.data.mood && <p className="font-medium">Felt {item.data.mood}</p>}
                          {item.data.note && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.data.note}</p>}
                        </>
                      )}
                      {item.type === 'meeting' && (
                        <>
                          <p className="font-medium">Attended {item.data.name}</p>
                          <p className="text-xs text-gray-500">{item.data.type} • {item.data.time}</p>
                        </>
                      )}
                      {item.type === 'journal' && (
                        <>
                          <p className="text-[10px] text-gray-400">{item.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
                          <p className="font-serif text-sm text-gray-600 mt-0.5 line-clamp-3 cursor-pointer hover:text-gray-800" onClick={() => setView('journal-list')}>{item.data.text}</p>
                        </>
                      )}
                      {item.type === 'reading' && (
                        <>
                          <p className="font-medium">Received strength from today's reading</p>
                          <p className="text-xs text-gray-500 italic mt-1 line-clamp-2">"{item.data.quote || 'A daily reading brought you peace.'}"</p>
                        </>
                      )}
                      {item.type === 'water' && (
                        <>
                          <p className="font-medium">Watered their tree</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-3">{item.data.note}</p>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => deleteHistoryItem(item)}
                      className="ml-1 p-1.5 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0 self-center"
                      aria-label="Delete entry"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </PageWrapper>
        );
      case 'reading':
        return (
          <PageWrapper id="reading">
            <div className="relative text-center space-y-6 max-w-sm w-full">
              <div className="w-20 h-20 bg-[#E0F2F1]/50 rounded-full flex items-center justify-center mx-auto text-[#5A7D4D]">
                <Sparkles size={40} />
              </div>
              <div className="flex items-center justify-between w-full">
                <h2 className="text-3xl font-serif italic">Daily Reading</h2>
                <button
                  onClick={() => {
                    triggerHaptic(10);
                    let next: number;
                    do { next = Math.floor(Math.random() * DAILY_READINGS.length); }
                    while (next === (readingOverride ?? currentReadingIndex));
                    setReadingOverride(next);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#5A7D4D]/10 text-[#5A7D4D] text-[10px] font-bold uppercase tracking-widest hover:bg-[#5A7D4D]/20 transition-colors"
                  title="Shuffle reading"
                >
                  <Sparkles size={13} />
                  Refresh
                </button>
              </div>
              {/* Elevated quote card with warmer shadow and larger decorative quote mark */}
              <div className="p-8 bg-white rounded-3xl border border-black/5 shadow-lg shadow-[#5A7D4D]/[0.06] relative text-left mt-4">
                <Quote className="absolute top-3 left-3 text-[#5A7D4D]/[0.08]" size={54} />
                <p className="font-serif text-[15px] leading-[1.75] text-[#2D3328] relative z-10 mt-2">
                  {currentReading}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5A7D4D] mt-6">— The Forest Guide</p>
              </div>
              <button 
                onClick={handleReadingAffirmation}
                disabled={showReadingCelebration}
                className="w-full py-4 bg-[#5A7D4D] text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-[#5A7D4D]/20 mt-4 disabled:opacity-70"
              >
                I Needed This
              </button>

              <AnimatePresence>
                {showReadingCelebration && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center"
                  >
                    <motion.div
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: [0.8, 1.15, 1], opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }}
                      className="relative w-36 h-36 rounded-full bg-gradient-to-b from-[#F9E5C9]/90 to-[#F0C38A]/80 shadow-2xl shadow-[#D4A373]/40 flex items-center justify-center"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0"
                      >
                        {[...Array(12)].map((_, i) => (
                          <span
                            key={i}
                            className="absolute left-1/2 top-1/2 w-1 h-6 bg-[#D4A373]/60 rounded-full"
                            style={{ transform: `translate(-50%, -190%) rotate(${i * 30}deg)` }}
                          />
                        ))}
                      </motion.div>
                      <Sun size={46} className="text-[#D4A373]" />
                    </motion.div>

                    <motion.p
                      initial={{ y: 16, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 8, opacity: 0 }}
                      transition={{ delay: 0.25, duration: 0.45 }}
                      className="mt-6 font-serif italic text-xl text-[#5A7D4D]"
                    >
                      Keep your light close today.
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </PageWrapper>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full bg-[#F5F7F2] text-[#2D3328] font-sans selection:bg-[#5A7D4D]/20 overflow-hidden flex flex-col relative">
      <AnimatePresence>
        {showSplash && (
          <motion.div 
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0 z-50 bg-[#F5F7F2] flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="flex flex-col items-center gap-6"
            >
              <div className="flex items-end gap-3">
                <TreePine size={40} className="text-[#6B8E9B] opacity-80" />
                <TreeDeciduous size={64} className="text-[#5A7D4D]" />
                <TreePine size={40} className="text-[#D4A373] opacity-80" />
              </div>
              <h1 className="text-4xl font-serif italic text-[#2D3328] tracking-tight">Recovery Forest</h1>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Milestone Banner */}
      <AnimatePresence>
        {activeMilestone && (
          <motion.div
            key={activeMilestone.days}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/90 backdrop-blur-md border border-[#5A7D4D]/20 shadow-lg"
          >
            <span className="text-2xl leading-none">{activeMilestone.emoji}</span>
            <span className="text-sm font-bold text-[#2D3328] tracking-tight">{daysClean} Days Strong!</span>
            <button
              onClick={() => { setActiveMilestone(null); if (milestoneTimer.current !== null) window.clearTimeout(milestoneTimer.current); }}
              className="ml-1 p-1 rounded-full hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Dismiss"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 pb-3 flex justify-between items-center z-10 border-b border-black/[0.05]" style={{ paddingTop: 'max(1rem, var(--sat))' }}>
        <div className="flex flex-col">
          {/* App title uses Lora serif for warmth */}
          <h1 className="text-2xl font-serif italic tracking-tight text-[#2D3328]">Recovery Forest</h1>
          <span className="text-[9px] uppercase tracking-[0.28em] text-[#5A7D4D] font-bold mt-0.5">Year One</span>
        </div>
        <button 
          onClick={() => setIsSpecOpen(true)}
          className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-md flex items-center justify-center border border-black/5 shadow-sm hover:bg-white transition-colors"
        >
          <Settings size={18} />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative min-h-0 w-full">
        
        {/* View Toggles */}
        {(view === 'home' || view === 'forest') && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex bg-white/60 backdrop-blur-md p-1 rounded-full border border-black/[0.06] shadow-sm z-20">
            <button 
              onClick={() => setView('home')}
              className={cn(
                "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                view === 'home' ? "bg-white shadow-sm text-[#5A7D4D]" : "text-gray-400"
              )}
            >
              Current Tree
            </button>
            <button 
              onClick={() => setView('forest')}
              className={cn(
                "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                view === 'forest' ? "bg-white shadow-sm text-[#5A7D4D]" : "text-gray-400"
              )}
            >
              The Forest
            </button>
          </div>
        )}

        {/* Back button for sub-pages */}
        {view !== 'home' && view !== 'forest' && (
          <button 
            onClick={() => setView('home')}
            className="absolute top-3 left-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#5A7D4D] z-20"
          >
            <ChevronLeft size={16} />
            Back to Tree
          </button>
        )}

        <AnimatePresence mode="wait">
          {renderView()}
        </AnimatePresence>

      </main>

      {/* Footer Actions */}
      {/* Footer tab bar with subtle top separator */}
      <footer className="px-4 pt-2 border-t border-black/[0.05]" style={{ paddingBottom: 'max(0.75rem, var(--sab))' }}>
        <div className="flex gap-1.5 w-full">
          <ActionButton 
            icon={CheckCircle2} 
            label="Check-in" 
            active={view === 'checkin'}
            onClick={() => setView('checkin')} 
          />
          <ActionButton 
            icon={Users} 
            label="Meeting" 
            active={view === 'meeting'}
            onClick={() => setView('meeting')} 
          />
          <ActionButton 
            icon={PenLine} 
            label="Journal" 
            active={view === 'journal' || view === 'journal-list'}
            onClick={() => setView(journalEntries.length > 0 ? 'journal-list' : 'journal')} 
          />
          <ActionButton 
            icon={BookOpen} 
            label="Reading" 
            active={view === 'reading'}
            onClick={() => setView('reading')} 
          />
          <ActionButton 
            icon={Calendar} 
            label="History" 
            active={view === 'history'}
            onClick={() => setView('history')} 
          />
        </div>
      </footer>

      {/* Settings Overlay */}
      <SettingsOverlay 
        isOpen={isSpecOpen} 
        onClose={() => setIsSpecOpen(false)} 
        recoveryDate={recoveryDate}
        setRecoveryDate={setRecoveryDate}
        setResetDate={setResetDate}
        treeName={treeName}
        setTreeName={setTreeName}
      />

      {/* Global Styles for no-scrollbar */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
