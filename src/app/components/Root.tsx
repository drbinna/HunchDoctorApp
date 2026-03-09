import { Outlet } from 'react-router';
import { AppProvider } from '../store';
import DemoOne from './ui/demo';

export function Root() {
  return (
    <AppProvider>
      <div
        style={{
          minHeight: '100vh',
          background: '#030306',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Global Cinematic Background */}
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }}>
          <DemoOne className="w-full h-full object-cover" />
        </div>

        {/* Phone frame on wide screens */}
        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            minHeight: '100vh',
            // Changed from solid #0a0a0f to translucent to let the shader bleed through
            background: 'rgba(10, 10, 15, 0.2)',
            backdropFilter: 'blur(20px)',
            position: 'relative',
            overflow: 'hidden',
            zIndex: 1, // ensure content sits above the global background
          }}
        >
          <Outlet />
        </div>
      </div>
    </AppProvider>
  );
}
