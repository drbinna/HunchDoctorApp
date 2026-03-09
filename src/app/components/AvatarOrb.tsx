import { motion } from 'motion/react';
import type { SignalName } from '../store';
import { SIGNAL_CONFIG } from './signals';

interface AvatarOrbProps {
  size?: number;
  dominantSignal?: SignalName | null;
  className?: string;
}

export function AvatarOrb({ size = 120, dominantSignal, className = '' }: AvatarOrbProps) {
  const color = dominantSignal ? SIGNAL_CONFIG[dominantSignal].color : '#F7A85A';
  const glow = dominantSignal ? SIGNAL_CONFIG[dominantSignal].glow : 'rgba(247,168,90,0.35)';

  return (
    <motion.div
      className={className}
      style={{ width: size, height: size, position: 'relative' }}
      animate={{ scale: [1, 1.06, 1] }}
      transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* Outer glow ring */}
      <motion.div
        style={{
          position: 'absolute',
          inset: -size * 0.15,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        }}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Core orb */}
      <motion.div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, ${color}cc, ${color}55 50%, ${color}22 100%)`,
          boxShadow: `0 0 ${size * 0.3}px ${color}66, 0 0 ${size * 0.6}px ${color}22, inset 0 0 ${size * 0.2}px ${color}44`,
          border: `1px solid ${color}44`,
        }}
        animate={{ opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}
