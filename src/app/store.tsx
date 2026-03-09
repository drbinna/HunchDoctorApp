import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type SignalName = 'sweet' | 'sour' | 'bitter' | 'salt' | 'umami';

export interface SignalValues {
  sweet: number;
  sour: number;
  bitter: number;
  salt: number;
  umami: number;
}

export interface JournalEntry {
  id: string;
  timestamp: Date;
  dominantSignal: SignalName;
  signals: SignalValues;
  narrative: string;
}

export interface AppSettings {
  cameraAccess: boolean;
  vitalLens: boolean;
  expressionReading: boolean;
  quietMode: boolean;
  insightFrequency: 'low' | 'medium' | 'high';
}

interface AppContextType {
  journalEntries: JournalEntry[];
  addJournalEntry: (entry: JournalEntry) => void;
  clearJournal: () => void;
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  sessionNumber: number;
}

const defaultSettings: AppSettings = {
  cameraAccess: true,
  vitalLens: true,
  expressionReading: true,
  quietMode: false,
  insightFrequency: 'medium',
};

const now = new Date();

const INITIAL_ENTRIES: JournalEntry[] = [
  {
    id: '1',
    timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    dominantSignal: 'bitter',
    signals: { sweet: 0.2, sour: 0.3, bitter: 0.78, salt: 0.4, umami: 0.35 },
    narrative: "You arrived Bitter-heavy with a low respiratory rate. After engaging Sweet and Umami your compass softened noticeably. Your body was asking for grounding tonight, not stimulation. You gave it attention instead of action.",
  },
  {
    id: '2',
    timestamp: new Date(now.getTime() - 26 * 60 * 60 * 1000),
    dominantSignal: 'salt',
    signals: { sweet: 0.4, sour: 0.3, bitter: 0.2, salt: 0.72, umami: 0.5 },
    narrative: "Salt-dominant. A rare equilibrium signal — your body found solid ground without effort. Your HRV was the highest recorded this week. Something released today.",
  },
  {
    id: '3',
    timestamp: new Date(now.getTime() - 30 * 60 * 60 * 1000),
    dominantSignal: 'bitter',
    signals: { sweet: 0.2, sour: 0.4, bitter: 0.71, salt: 0.3, umami: 0.4 },
    narrative: "Bitter arrived again in the afternoon. Heart rate elevated, respiratory rate shallow. The compass held steady while your signals told a different story. You stayed with it.",
  },
  {
    id: '4',
    timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    dominantSignal: 'sour',
    signals: { sweet: 0.3, sour: 0.68, bitter: 0.3, salt: 0.4, umami: 0.2 },
    narrative: "A Sour opening. Your body was primed and activated. The morning reading caught you mid-preparation — something ahead had already registered in your nervous system before your mind named it.",
  },
  {
    id: '5',
    timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000),
    dominantSignal: 'bitter',
    signals: { sweet: 0.15, sour: 0.3, bitter: 0.82, salt: 0.25, umami: 0.45 },
    narrative: "Bitter again. A third afternoon reading this week carrying the same signal. Your system is being consistent about something. The pattern is becoming impossible to ignore.",
  },
  {
    id: '6',
    timestamp: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    dominantSignal: 'umami',
    signals: { sweet: 0.3, sour: 0.2, bitter: 0.5, salt: 0.4, umami: 0.73 },
    narrative: "Umami-dominant with a low HRV. Your body identified depletion before you did. The compass asked for nourishment, not stimulation. You chose rest over productivity. That was the right signal to follow.",
  },
];

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    try {
      const stored = localStorage.getItem('hunchdoctor_journal');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((e: JournalEntry & { timestamp: string }) => ({
          ...e,
          timestamp: new Date(e.timestamp),
        }));
      }
    } catch {}
    return INITIAL_ENTRIES;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem('hunchdoctor_settings');
      if (stored) return { ...defaultSettings, ...JSON.parse(stored) };
    } catch {}
    return defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('hunchdoctor_journal', JSON.stringify(journalEntries));
  }, [journalEntries]);

  useEffect(() => {
    localStorage.setItem('hunchdoctor_settings', JSON.stringify(settings));
  }, [settings]);

  const addJournalEntry = useCallback((entry: JournalEntry) => {
    setJournalEntries(prev => [entry, ...prev]);
  }, []);

  const clearJournal = useCallback(() => {
    setJournalEntries([]);
  }, []);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const sessionNumber = journalEntries.length + 1;

  return (
    <AppContext.Provider value={{
      journalEntries,
      addJournalEntry,
      clearJournal,
      settings,
      updateSettings,
      sessionNumber,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}