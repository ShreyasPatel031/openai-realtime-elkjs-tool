/**
 * App Router - Handles routing between public canvas (/) and full app (/canvas)
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import App from './App';
import PublicCanvas from './PublicCanvas';

// Shared routes component
function AppRoutes() {
  return (
    <Routes>
      {/* Public canvas route - embeddable, no auth required */}
      <Route path="/" element={<PublicCanvas />} />
      
      {/* Full app route - requires auth, full functionality */}
      <Route path="/canvas" element={<App />} />
    </Routes>
  );
}

// Client-side router (uses BrowserRouter)
export function ClientAppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

// Server-side router (uses StaticRouter)
export function ServerAppRouter({ location = "/" }) {
  return (
    <StaticRouter location={location}>
      <AppRoutes />
    </StaticRouter>
  );
}

// Default export for backward compatibility (client-side)
export default function AppRouter() {
  return <ClientAppRouter />;
}
