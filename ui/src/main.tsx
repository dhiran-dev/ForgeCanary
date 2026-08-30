import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const ReleaseRunwayPrototype = lazy(() => import('./runway/ReleaseRunwayPrototype'));
const isStudio = window.location.pathname === '/studio'
  || window.location.pathname.startsWith('/studio/');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {!isStudio ? (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050706' }} />}>
        <ReleaseRunwayPrototype />
      </Suspense>
    ) : <App />}
  </StrictMode>
);
