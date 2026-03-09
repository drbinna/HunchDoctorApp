import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { AvatarOrb } from './AvatarOrb';
import { getGreeting } from './signals';

export function WelcomeScreen() {
  const navigate = useNavigate();
  const greeting = getGreeting();

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-5"
      style={{ background: '#0a0a0f' }}
    >
      {/* Avatar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="mb-8"
      >
        <AvatarOrb size={120} />
      </motion.div>

      {/* App name */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ delay: 0.4, duration: 1 }}
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px',
          letterSpacing: '6px',
          textTransform: 'uppercase',
          color: 'white',
          marginBottom: '24px',
        }}
      >
        HunchDoctor
      </motion.p>

      {/* Greeting */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 0.85, y: 0 }}
        transition={{ delay: 0.7, duration: 1 }}
        style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: '20px',
          fontStyle: 'italic',
          color: 'white',
          textAlign: 'center',
          lineHeight: 1.5,
          maxWidth: '260px',
          marginBottom: '64px',
        }}
      >
        {greeting}
      </motion.p>

      {/* Primary CTA */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="w-full"
        style={{ maxWidth: '320px' }}
      >
        <button
          onClick={() => navigate('/voice')}
          style={{
            width: '100%',
            height: '56px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: 'white',
            fontFamily: 'Inter, sans-serif',
            fontSize: '16px',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
            transition: 'background 0.2s, border-color 0.2s',
          }}
          onMouseEnter={e => {
            (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.13)';
            (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.25)';
          }}
          onMouseLeave={e => {
            (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)';
          }}
        >
          I'm ready
        </button>
      </motion.div>

      {/* Secondary option */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 1.3, duration: 0.8 }}
        onClick={() => navigate('/compass')}
        style={{
          marginTop: '24px',
          background: 'none',
          border: 'none',
          color: 'white',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
          cursor: 'pointer',
          padding: '12px 24px',
          letterSpacing: '0.3px',
        }}
        whileHover={{ opacity: 0.7 }}
      >
        Just checking in
      </motion.button>

      {/* Tagline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ delay: 1.6, duration: 1 }}
        style={{
          position: 'absolute',
          bottom: '40px',
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: '13px',
          fontStyle: 'italic',
          color: 'white',
          letterSpacing: '1px',
        }}
      >
        Listen deeper.
      </motion.p>
    </div>
  );
}