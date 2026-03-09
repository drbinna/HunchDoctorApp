import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { ChevronLeft, Zap } from 'lucide-react';
import { useApp } from '../store';
import type { JournalEntry, SignalName } from '../store';
import { SIGNAL_CONFIG, SIGNAL_ORDER } from './signals';

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

function formatDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entryDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - entryDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function groupEntriesByDate(entries: JournalEntry[]): [string, JournalEntry[]][] {
  const groups = new Map<string, JournalEntry[]>();
  entries.forEach(entry => {
    const label = formatDate(entry.timestamp);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  });
  return Array.from(groups.entries());
}

function detectPattern(entries: JournalEntry[]): string | null {
  if (entries.length < 5) return null;
  const last6 = entries.slice(0, 6);
  const counts: Partial<Record<SignalName, number>> = {};
  last6.forEach(e => {
    counts[e.dominantSignal] = (counts[e.dominantSignal] || 0) + 1;
  });
  const dominant = (Object.entries(counts) as [SignalName, number][]).sort((a, b) => b[1] - a[1])[0];
  if (dominant && dominant[1] >= 3) {
    const signalLabel = SIGNAL_CONFIG[dominant[0]].label;
    return `${signalLabel}-dominant in ${dominant[1]} of your last ${last6.length} check-ins. Your body has a pattern here. Would you like to explore what it might be responding to?`;
  }
  return null;
}

function SignalBar({ signals }: { signals: JournalEntry['signals'] }) {
  return (
    <div className="flex gap-1 mt-3">
      {SIGNAL_ORDER.map(name => {
        const val = signals[name] || 0;
        const color = SIGNAL_CONFIG[name].color;
        return (
          <div key={name} className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
            <div style={{
              height: '24px',
              width: '100%',
              borderRadius: '3px',
              background: `${color}18`,
              display: 'flex',
              alignItems: 'flex-end',
              overflow: 'hidden',
            }}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${val * 100}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{ width: '100%', background: `${color}80`, borderRadius: '3px' }}
              />
            </div>
            <span style={{ fontSize: '7px', letterSpacing: '1px', color: `${color}60`, fontFamily: 'Inter, sans-serif' }}>
              {SIGNAL_CONFIG[name].label[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EntryCard({ entry }: { entry: JournalEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = SIGNAL_CONFIG[entry.dominantSignal].color;

  return (
    <motion.div
      layout
      onClick={() => setExpanded(!expanded)}
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer',
        borderLeft: `2px solid ${color}60`,
      }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Time + signal badge */}
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.5px' }}>
          {formatTime(entry.timestamp)}
        </span>
        <div className="flex items-center gap-1.5">
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', color: color, opacity: 0.8 }}>
            {SIGNAL_CONFIG[entry.dominantSignal].label}
          </span>
        </div>
      </div>

      {/* Narrative */}
      <p style={{
        fontFamily: 'Cormorant Garamond, serif',
        fontSize: '16px',
        fontStyle: 'italic',
        color: 'rgba(255,255,255,0.82)',
        lineHeight: 1.65,
        margin: 0,
      }}>
        {entry.narrative}
      </p>

      {/* Expanded signal bars */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <SignalBar signals={entry.signals} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function HunchJournal() {
  const navigate = useNavigate();
  const { journalEntries } = useApp();

  const grouped = groupEntriesByDate(journalEntries);
  const pattern = detectPattern(journalEntries);

  // Always start a new check-in with the voice conversation screen.
  const nextCheckInRoute = '/voice';

  return (
    <div
      className="flex flex-col min-h-screen relative"
    >
      {/* Nav bar */}
      <div style={{
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        position: 'sticky',
        top: 0,
        background: 'rgba(10,10,15,0.95)',
        backdropFilter: 'blur(16px)',
        zIndex: 10,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <ChevronLeft size={22} />
        </button>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: 'rgba(255,255,255,0.75)' }}>
          Journal
        </span>
        <div style={{ width: 22 }} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '20px 20px 60px' }}>

        {/* Pattern card */}
        <AnimatePresence>
          {pattern && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(247,168,90,0.07)',
                borderRadius: '16px',
                padding: '16px 20px',
                borderLeft: '3px solid #F7A85A',
                border: '1px solid rgba(247,168,90,0.2)',
                borderLeftColor: '#F7A85A',
                marginBottom: '28px',
              }}
            >
              <div className="flex items-start gap-3">
                <Zap size={16} color="#F7A85A" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '2px', color: '#F7A85A', display: 'block', marginBottom: '6px' }}>
                    PATTERN DETECTED
                  </span>
                  <p style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    fontSize: '16px',
                    fontStyle: 'italic',
                    color: 'rgba(255,255,255,0.82)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}>
                    {pattern}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {journalEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center" style={{ paddingTop: '80px' }}>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', fontStyle: 'italic', color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.6 }}>
              Your journal is empty.<br />Begin a session to create your first entry.
            </p>
          </div>
        )}

        {/* Entry groups */}
        {grouped.map(([dateLabel, entries]) => (
          <div key={dateLabel} style={{ marginBottom: '28px' }}>
            <span style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '11px',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
              display: 'block',
              marginBottom: '12px',
            }}>
              {dateLabel}
            </span>
            <div className="flex flex-col gap-3">
              {entries.map(entry => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        padding: '16px 20px 32px',
        background: 'linear-gradient(to top, rgba(10,10,15,1) 60%, transparent)',
      }}>
        <button
          onClick={() => navigate(nextCheckInRoute)}
          style={{
            width: '100%',
            height: '50px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          New check-in
        </button>
      </div>
    </div>
  );
}