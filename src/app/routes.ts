import { createBrowserRouter } from 'react-router';
import { Root } from './components/Root';
import { WelcomeScreen } from './components/WelcomeScreen';
import { VoiceScreen, voiceLoader } from './components/VoiceScreen';
import { HunchCompass } from './components/HunchCompass';
import { SignalOrbs } from './components/SignalOrbs';
import { HunchJournal } from './components/HunchJournal';
import { SettingsScreen } from './components/SettingsScreen';
import { LoadingFallback } from './components/LoadingFallback';
import { VitalLensTestScreen } from './components/VitalLensTestScreen';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      { index: true, Component: WelcomeScreen },
      { path: 'voice',           Component: VoiceScreen, loader: voiceLoader, HydrateFallback: LoadingFallback },
      { path: 'welcome',         Component: WelcomeScreen },
      { path: 'compass',         Component: HunchCompass },
      { path: 'orbs',            Component: SignalOrbs },
      { path: 'journal',         Component: HunchJournal },
      { path: 'settings',        Component: SettingsScreen },
      { path: 'vitallens-test',  Component: VitalLensTestScreen },
    ],
  },
]);