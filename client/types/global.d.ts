declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      OPENAI_API_KEY?: string;
    };
  }
}

// Allow importing JSON files
declare module "*.json" {
  const value: any;
  export default value;
}

export {}; 