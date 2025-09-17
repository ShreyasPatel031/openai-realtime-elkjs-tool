/**
 * Framer Embedded View Route
 * Dedicated route for the Framer embeddable component
 */
import React from 'react';
import { ApiEndpointProvider } from '../client/contexts/ApiEndpointContext';
import FramerEmbeddable from '../client/components/FramerEmbeddable';

export default function EmbedPage() {
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0 }}>
      <FramerEmbeddable 
        apiEndpoint={process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://atelier-hr1fy8lrc-shreyaspatel031s-projects.vercel.app'}
        width="100%"
        height="100vh"
      />
    </div>
  );
}
