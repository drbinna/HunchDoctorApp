import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { AvatarOrb } from './AvatarOrb';
import { CompassWeb } from './CompassWeb';
import { useApp } from '../store';
import type { SignalName, SignalValues } from '../store';
import {
  SIGNAL_ORDER,
  SIGNAL_CONFIG,
  ORB_INSIGHTS,
  generateSignals,
  getRandomNarrative,
} from './signals';

interface OrbState {
  activated: boolean;
  animating: boolean;
}

export function SignalOrbs() {
  const navigate = useNavigate();
  const { addJournalEntry } = useApp();

  const [{ signals: baseSignals, dominantSignal }] = useState(() => generateSignals());
  const [signals, setSignals] = useState<SignalValues>(baseSignals);
  const [activeSignal, setActiveSignal] = useState<SignalName | null>(dominantSignal);
  const [orbInsight, setOrbInsight] = useState<string>('Drag an orb toward the compass to direct your attention.');
  const [orbStates, setOrbStates] = useState<Record<SignalName, OrbState>>(
    () => Object.fromEntries(SIGNAL_ORDER.map(n => [n, { activated: false, animating: false }])) as Record<SignalName, OrbState>
  );

  // Drag state
  const draggingOrb = useRef<SignalName | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [draggingName, setDraggingName] = useState<SignalName | null>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const orbRefs = useRef<Partial<Record<SignalName, HTMLDivElement>>>({});

  const activateOrb = useCallback((name: SignalName) => {
    setActiveSignal(name);
    setOrbInsight(ORB_INSIGHTS[name]);
    setOrbStates(prev => ({
      ...prev,
      [name]: { activated: true, animating: true },
    }));
    setSignals(prev => ({
      ...prev,
      [name]: Math.min(0.92, (prev[name] || 0.4) + 0.28),
    }));
    setTimeout(() => {
      setOrbStates(prev => ({ ...prev, [name]: { ...prev[name], animating: false } }));
    }, 600);
  }, []);

  const handlePointerDown = (name: SignalName, e: React.PointerEvent) => {
    e.preventDefault();
    draggingOrb.current = name;
    setDraggingName(name);
    setDragPosition({ x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingOrb.current) return;
    setDragPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const name = draggingOrb.current;
    if (!name) return;

    // Check if released over compass
    const compass = compassRef.current;
    if (compass) {
      const rect = compass.getBoundingClientRect();
      const inCompass =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (inCompass) {
        activateOrb(name);
      }
    }

    draggingOrb.current = null;
    setDraggingName(null);
    setDragPosition(null);
  }, [activateOrb]);

  const handleDone = () => {
    const narrative = getRandomNarrative(activeSignal || dominantSignal);
    addJournalEntry({
      id: Date.now().toString(),
      timestamp: new Date(),
      dominantSignal: activeSignal || dominantSignal,
      signals,
      narrative,
    });
    navigate('/journal');
  };

  const dominantColor = activeSignal ? SIGNAL_CONFIG[activeSignal].color : '#4FD1C5';

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: '#0a0a0f' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={() => navigate('/compass')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <AvatarOrb size={28} dominantSignal={activeSignal} />
          <span style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
            Shift
          </span>
        </div>
        <div style={{ width: 18 }} />
      </div>

      {/* Compass (smaller) */}
      <div ref={compassRef} className="flex justify-center items-center" style={{ paddingTop: '4px' }}>
        <CompassWeb
          signals={signals}
          dominantSignal={activeSignal}
          size={240}
          revealed={true}
        />
      </div>

      {/* Direction label */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          fontFamily: "'Cabinet Grotesk', sans-serif",
          fontSize: '11px',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.3)',
          textAlign: 'center',
          marginTop: '8px',
          marginBottom: '16px',
        }}
      >
        Direct your attention to:
      </motion.p>

      {/* Orb tray */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '20px 16px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div className="flex justify-around items-center">
          {SIGNAL_ORDER.map(name => {
            const config = SIGNAL_CONFIG[name];
            const state = orbStates[name];
            const isActive = activeSignal === name;
            const isDragging = draggingName === name;

            return (
              <div
                key={name}
                className="flex flex-col items-center gap-2"
                style={{ opacity: isDragging ? 0.3 : 1, transition: 'opacity 0.2s' }}
              >
                <motion.div
                  ref={el => { if (el) orbRefs.current[name] = el; }}
                  onPointerDown={e => handlePointerDown(name, e)}
                  animate={state.animating ? { scale: [1, 1.3, 1] } : isActive ? { scale: 1.15 } : { scale: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => activateOrb(name)}
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: `radial-gradient(circle at 35% 35%, ${config.color}cc, ${config.color}55 55%, ${config.color}22)`,
                    boxShadow: isActive
                      ? `0 0 20px ${config.color}80, 0 0 40px ${config.color}30`
                      : `0 0 10px ${config.color}40`,
                    border: `1px solid ${config.color}${isActive ? '80' : '40'}`,
                    cursor: 'grab',
                    touchAction: 'none',
                  }}
                />
                <span style={{
                  fontFamily: "'Cabinet Grotesk', sans-serif",
                  fontSize: '9px',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: isActive ? config.color : 'rgba(255,255,255,0.35)',
                  transition: 'color 0.4s',
                }}>
                  {config.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Insight card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={orbInsight}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5 }}
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '16px',
              padding: '18px 20px',
              border: `1px solid ${activeSignal ? SIGNAL_CONFIG[activeSignal].color + '25' : 'rgba(255,255,255,0.07)'}`,
            }}
          >
            <p style={{
              fontFamily: "'Cabinet Grotesk', sans-serif",
              fontSize: '16px',
              color: 'rgba(255,255,255,0.82)',
              lineHeight: 1.65,
              margin: 0,
            }}>
              {orbInsight}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Done */}
        <div className="flex justify-center">
          <button
            onClick={handleDone}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.35)',
              fontFamily: "'Cabinet Grotesk', sans-serif",
              fontSize: '14px',
              cursor: 'pointer',
              padding: '12px 40px',
              letterSpacing: '0.5px',
            }}
          >
            Done
          </button>
        </div>
      </div>

      {/* Floating drag orb */}
      <AnimatePresence>
        {dragPosition && draggingName && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0.9 }}
            animate={{ scale: 1.2, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            style={{
              position: 'fixed',
              left: dragPosition.x - 30,
              top: dragPosition.y - 30,
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${SIGNAL_CONFIG[draggingName].color}dd, ${SIGNAL_CONFIG[draggingName].color}66)`,
              boxShadow: `0 0 30px ${SIGNAL_CONFIG[draggingName].color}80`,
              border: `1px solid ${SIGNAL_CONFIG[draggingName].color}80`,
              pointerEvents: 'none',
              zIndex: 999,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
