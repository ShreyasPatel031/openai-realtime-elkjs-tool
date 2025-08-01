import React, { createContext, useContext } from 'react';

interface ApiEndpointContextType {
  apiEndpoint?: string;
}

const ApiEndpointContext = createContext<ApiEndpointContextType>({});

export const ApiEndpointProvider: React.FC<{ apiEndpoint?: string; children: React.ReactNode }> = ({ 
  apiEndpoint, 
  children 
}) => {
  return (
    <ApiEndpointContext.Provider value={{ apiEndpoint }}>
      {children}
    </ApiEndpointContext.Provider>
  );
};

export const useApiEndpoint = () => {
  const context = useContext(ApiEndpointContext);
  return context.apiEndpoint;
};

// Helper function to construct asset URLs
export const buildAssetUrl = (path: string, apiEndpoint?: string): string => {
  if (!apiEndpoint) {
    return path; // Fallback to relative URL
  }
  
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Ensure apiEndpoint doesn't end with slash
  const cleanEndpoint = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
  
  return `${cleanEndpoint}/${cleanPath}`;
}; 