/**
 * LoadingFallback — shown by React Router while route loaders are running
 * during initial hydration (the HydrateFallback slot).
 *
 * Matches the HunchDoctor dark-cinematic aesthetic.
 */
import { motion } from 'motion/react';
import { AvatarOrb } from './AvatarOrb';

export function LoadingFallback() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
      }}
    >
      {/* Ambient pulse behind orb */}
      <div style={{ position: 'relative' }}>
        <motion.div
          animate={{ scale: [1, 1.18, 1], opacity: [0.08, 0.2, 0.08] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            inset: -20,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79,209,197,0.45) 0%, transparent 70%)',
          }}
        />
        <AvatarOrb size={72} />
      </div>

      {/* Spinner + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
          style={{
            width: 13,
            height: 13,
            borderRadius: '50%',
            border: '2px solid rgba(79,209,197,0.18)',
            borderTopColor: '#4FD1C5',
          }}
        />
        <span
          style={{
            fontFamily: "'Cabinet Grotesk', sans-serif",
            fontSize: '10px',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          Preparing
        </span>
      </div>
    </div>
  );
}
