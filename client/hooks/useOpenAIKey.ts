import { useEffect, useState } from 'react';

export function useOpenAIKey() {
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Try to get the API key from the environment
    const key = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (key) {
      setApiKey(key);
      return;
    }

    // If not found in environment, try to get it from window
    const windowKey = (window as any).NEXT_PUBLIC_OPENAI_API_KEY;
    if (windowKey) {
      setApiKey(windowKey);
      return;
    }

    // If still not found, try to get it from a script tag
    const script = document.querySelector('script[data-openai-key]');
    if (script) {
      const key = script.getAttribute('data-openai-key');
      if (key) {
        setApiKey(key);
        return;
      }
    }

    // If we get here, no key was found
    console.warn("⚠️ OPENAI_API_KEY is not set. Please add NEXT_PUBLIC_OPENAI_API_KEY to your .env.local file");
  }, []);

  return apiKey;
} 