import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';
import { ChevronLeft, Check, ChevronRight } from 'lucide-react';
import { useApp } from '../store';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: '44px',
        height: '26px',
        borderRadius: '999px',
        background: value ? '#4FD1C5' : 'rgba(255,255,255,0.12)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.25s',
        flexShrink: 0,
      }}
    >
      <motion.div
        animate={{ x: value ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          position: 'absolute',
          top: '3px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

const DIVIDER = <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 -20px' }} />;

function SettingRow({
  label,
  right,
  destructive = false,
  onPress,
}: {
  label: string;
  right?: React.ReactNode;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <div
      onClick={onPress}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: '48px',
        padding: '12px 0',
        width: '100%',
        cursor: onPress ? 'pointer' : 'default',
      }}
    >
      <span style={{
        fontFamily: "'Cabinet Grotesk', sans-serif",
        fontSize: '15px',
        color: destructive ? '#f87171' : 'rgba(255,255,255,0.78)',
      }}>
        {label}
      </span>
      {right}
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      padding: '20px 0 8px',
      fontFamily: "'Cabinet Grotesk', sans-serif",
      fontSize: '11px',
      letterSpacing: '3px',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.3)',
    }}>
      {label}
    </div>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const { settings, updateSettings, clearJournal } = useApp();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [frequencyOpen, setFrequencyOpen] = useState(false);

  const freqLabel: Record<string, string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  };

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: '#0a0a0f' }}
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
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <ChevronLeft size={22} />
        </button>
        <span style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: '15px', color: 'rgba(255,255,255,0.75)' }}>
          Settings
        </span>
        <div style={{ width: 22 }} />
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '0 20px 60px' }}>

        {/* Sensing */}
        <SectionLabel label="Sensing" />
        <SettingRow
          label="Camera access"
          right={<Toggle value={settings.cameraAccess} onChange={v => updateSettings({ cameraAccess: v })} />}
        />
        {DIVIDER}
        <SettingRow
          label="VitalLens sensing"
          right={<Toggle value={settings.vitalLens} onChange={v => updateSettings({ vitalLens: v })} />}
        />
        {DIVIDER}
        <SettingRow
          label="Expression reading"
          right={<Toggle value={settings.expressionReading} onChange={v => updateSettings({ expressionReading: v })} />}
        />

        {/* Experience */}
        <SectionLabel label="Experience" />
        <SettingRow
          label="Quiet Mode"
          right={<Toggle value={settings.quietMode} onChange={v => updateSettings({ quietMode: v })} />}
        />
        {DIVIDER}
        <div>
          <SettingRow
            label="Insight frequency"
            onPress={() => setFrequencyOpen(!frequencyOpen)}
            right={
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>
                  {freqLabel[settings.insightFrequency]}
                </span>
                <ChevronRight size={14} color="rgba(255,255,255,0.25)" />
              </div>
            }
          />
          <AnimatePresence>
            {frequencyOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden', marginBottom: '8px' }}
              >
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  {(['low', 'medium', 'high'] as const).map((freq, i) => (
                    <div key={freq}>
                      <button
                        onClick={() => { updateSettings({ insightFrequency: freq }); setFrequencyOpen(false); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '14px 16px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: settings.insightFrequency === freq ? '#4FD1C5' : 'rgba(255,255,255,0.65)',
                          fontFamily: "'Cabinet Grotesk', sans-serif",
                          fontSize: '15px',
                        }}
                      >
                        <span>{freqLabel[freq]}</span>
                        {settings.insightFrequency === freq && <Check size={15} color="#4FD1C5" />}
                      </button>
                      {i < 2 && <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 16px' }} />}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Privacy */}
        <SectionLabel label="Privacy" />
        <SettingRow
          label="Data stays on device"
          right={<Check size={16} color="rgba(79,209,197,0.7)" />}
        />
        {DIVIDER}
        <SettingRow
          label="Export my data"
          onPress={() => { }}
          right={<ChevronRight size={16} color="rgba(255,255,255,0.25)" />}
        />
        {DIVIDER}
        <SettingRow
          label="Clear all sessions"
          destructive
          onPress={() => setShowClearConfirm(true)}
          right={<ChevronRight size={16} color="rgba(248,113,113,0.5)" />}
        />

        {/* About */}
        <SectionLabel label="About" />
        <p style={{
          fontFamily: "'Cabinet Grotesk', sans-serif",
          fontSize: '12px',
          color: 'rgba(255,255,255,0.28)',
          lineHeight: 1.65,
          paddingTop: '4px',
        }}>
          HunchDoctor is a speculative wellness tool, not a medical device. It reflects — it never prescribes. Every insight is an observation, not a diagnosis.
        </p>

        <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'center' }}>
          <span style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontWeight: 'bold', fontSize: '11px', letterSpacing: '2px', color: 'rgba(255,255,255,0.15)' }}>
            HUNCHDOCTOR · FIGBUILD 2026
          </span>
        </div>
      </div>

      {/* Clear confirm modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10,10,15,0.85)',
              backdropFilter: 'blur(20px)',
              display: 'flex',
              alignItems: 'flex-end',
              zIndex: 100,
            }}
            onClick={() => setShowClearConfirm(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                background: 'rgba(18,18,28,0.98)',
                borderRadius: '24px 24px 0 0',
                padding: '32px 24px 48px',
                border: '1px solid rgba(255,255,255,0.07)',
                borderBottom: 'none',
              }}
            >
              <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: '20px', color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: '8px' }}>
                Clear all sessions?
              </p>
              <p style={{ fontFamily: "'Cabinet Grotesk', sans-serif", fontSize: '13px', color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginBottom: '28px', lineHeight: 1.6 }}>
                This will permanently delete your journal and pattern history.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { clearJournal(); setShowClearConfirm(false); }}
                  style={{
                    height: '52px',
                    borderRadius: '999px',
                    background: 'rgba(248,113,113,0.12)',
                    border: '1px solid rgba(248,113,113,0.3)',
                    color: '#f87171',
                    fontFamily: "'Cabinet Grotesk', sans-serif",
                    fontSize: '15px',
                    cursor: 'pointer',
                  }}
                >
                  Clear everything
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  style={{
                    height: '52px',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.55)',
                    fontFamily: "'Cabinet Grotesk', sans-serif",
                    fontSize: '15px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}