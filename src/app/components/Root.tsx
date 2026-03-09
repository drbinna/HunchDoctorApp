import { Outlet } from 'react-router';
import { AppProvider } from '../store';

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
        }}
      >
        {/* Phone frame on wide screens */}
        <div
          style={{
            width: '100%',
            maxWidth: '430px',
            minHeight: '100vh',
            background: '#0a0a0f',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Outlet />
        </div>
      </div>
    </AppProvider>
  );
}
