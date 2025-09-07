declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      OPENAI_API_KEY?: string;
    };
    devMode?: {
      enable: () => void;
      disable: () => void;
      toggle: () => void;
      status: () => boolean;
    };
  }
}

// Allow importing JSON files
declare module "*.json" {
  const value: any;
  export default value;
}

export {}; 