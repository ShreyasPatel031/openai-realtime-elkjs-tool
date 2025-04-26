import { useRef, useEffect } from 'react';

export function useSessionLifecycle(events: any[], safeSend: (e: any) => void) {
  const lastId = useRef<string|undefined>(undefined);
  const initSent = useRef(false);
  const processed = useRef(new Set<string>());

  useEffect(() => {
    const created = events.find(e => e.type === "session.created");
    if (!created) return;
    if (created.session?.id === lastId.current) return;

    lastId.current = created.session.id;
    initSent.current = false;
    processed.current.clear();
    safeSend({ type: "session.update", session: { tool_choice: "auto" } });
  }, [events, safeSend]);

  // Cleanup on unmount
  useEffect(() => () => {
    processed.current.clear();
  }, []);

  return { initSent, processed };
} 