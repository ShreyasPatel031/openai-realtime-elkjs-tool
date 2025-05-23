declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      OPENAI_API_KEY?: string;
    };
  }
}

export {}; 