import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const ReleaseRunwayPrototype = lazy(() => import('./runway/ReleaseRunwayPrototype'));
const isRunway = window.location.pathname.startsWith('/runway');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isRunway ? (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050706' }} />}>
        <ReleaseRunwayPrototype />
      </Suspense>
    ) : <App />}
  </StrictMode>
);
