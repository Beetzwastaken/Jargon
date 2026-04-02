import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Register Service Worker for PWA support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');

      // Force check for updates immediately on every page load
      registration.update();

      // When a new SW is found, tell it to skip waiting
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              // New SW is active — reload to get fresh assets
              window.location.reload();
            }
          });
          // Tell the new worker to activate immediately
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });

      // Also check hourly
      setInterval(() => registration.update(), 60 * 60 * 1000);
    } catch {
      // Silently ignore SW registration errors
    }
  });
}
