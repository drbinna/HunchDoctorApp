import { motion } from 'motion/react';
import type { SignalName, SignalValues } from '../store';
import { SIGNAL_CONFIG, SIGNAL_ORDER, SIGNAL_ANGLES } from './signals';

interface CompassWebProps {
  signals: SignalValues;
  dominantSignal: SignalName | null;
  size?: number;
  revealed?: boolean;
}

const CX = 140;
const CY = 140;
const R = 85;
const LABEL_R = 112;

function toXY(angle: number, radius: number, cx = CX, cy = CY) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function toPath(points: { x: number; y: number }[]) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ' Z';
}

const TEXT_ANCHORS: ('middle' | 'start' | 'end')[] = ['middle', 'start', 'start', 'end', 'end'];
const LABEL_DY = ['-6', '4', '14', '14', '4'];

export function CompassWeb({ signals, dominantSignal, size = 280, revealed = true }: CompassWebProps) {
  const scale = size / 280;

  const webPoints = SIGNAL_ORDER.map((name, i) => {
    const val = Math.max(0.05, signals[name] || 0.05);
    return toXY(SIGNAL_ANGLES[i], val * R);
  });

  const outerPoints = SIGNAL_ORDER.map((_, i) => toXY(SIGNAL_ANGLES[i], R));
  const gridScales = [0.25, 0.5, 0.75, 1.0];

  const dominantColor = dominantSignal ? SIGNAL_CONFIG[dominantSignal].color : '#a8d4f7';

  return (
    <svg
      viewBox="0 0 280 280"
      width={size}
      height={size}
      style={{ overflow: 'visible' }}
    >
      {/* Grid rings */}
      {gridScales.map(s => (
        <path
          key={s}
          d={toPath(SIGNAL_ORDER.map((_, i) => toXY(SIGNAL_ANGLES[i], R * s)))}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
        />
      ))}

      {/* Axis lines */}
      {SIGNAL_ANGLES.map((a, i) => (
        <line
          key={i}
          x1={CX} y1={CY}
          x2={outerPoints[i].x} y2={outerPoints[i].y}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}

      {/* Signal web */}
      <motion.path
        d={toPath(webPoints)}
        fill={`${dominantColor}28`}
        stroke={dominantColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: revealed ? 1 : 0, scale: revealed ? 1 : 0.4 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />

      {/* Breathing overlay */}
      {revealed && (
        <motion.path
          d={toPath(webPoints)}
          fill="none"
          stroke={`${dominantColor}60`}
          strokeWidth="0.5"
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />
      )}

      {/* Center dot */}
      <circle cx={CX} cy={CY} r="2.5" fill="rgba(255,255,255,0.2)" />

      {/* Vertex poles */}
      {SIGNAL_ORDER.map((name, i) => {
        const pos = outerPoints[i];
        const isDominant = name === dominantSignal;
        const color = SIGNAL_CONFIG[name].color;
        return (
          <motion.circle
            key={name}
            cx={pos.x}
            cy={pos.y}
            r={isDominant ? 5 : 3}
            fill={isDominant ? color : 'rgba(255,255,255,0.25)'}
            animate={isDominant ? {
              r: [5, 6.5, 5],
              opacity: [1, 0.7, 1],
            } : {}}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        );
      })}

      {/* Signal labels */}
      {SIGNAL_ORDER.map((name, i) => {
        const pos = toXY(SIGNAL_ANGLES[i], LABEL_R);
        const isDominant = name === dominantSignal;
        const color = SIGNAL_CONFIG[name].color;
        return (
          <text
            key={name}
            x={pos.x}
            y={pos.y}
            dy={LABEL_DY[i]}
            textAnchor={TEXT_ANCHORS[i]}
            fill={isDominant ? color : 'rgba(255,255,255,0.35)'}
            fontSize="9"
            letterSpacing="2"
            fontFamily="Inter, sans-serif"
            style={{ transition: 'fill 0.8s ease' }}
          >
            {SIGNAL_CONFIG[name].label}
          </text>
        );
      })}

      {/* Scanning animation - pulsing ring */}
      {!revealed && (
        <motion.circle
          cx={CX}
          cy={CY}
          r={R * 0.6}
          fill="none"
          stroke="rgba(79,209,197,0.4)"
          strokeWidth="1"
          animate={{ r: [R * 0.2, R, R * 0.2], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </svg>
  );
}
