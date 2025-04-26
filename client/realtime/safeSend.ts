import { Dispatch, SetStateAction } from "react";

export interface SendStatus {
  sending: boolean;
  retrying: boolean;
  retryCount: number;
  lastError: Error | null;
}

export function safeSend(
  send: ((e: any) => void) | undefined,
  setStatus: Dispatch<SetStateAction<SendStatus>>,
) {
  return (evt: any) => {
    if (!send) return;
    setStatus(s => ({ ...s, sending: true }));
    try {
      send(evt);
      setStatus(s => ({ ...s, sending: false, retrying: false, retryCount: 0, lastError: null }));
    } catch (err) {
      setStatus(s => ({
        ...s,
        sending: false,
        retrying: true,
        retryCount: s.retryCount + 1,
        lastError: err as Error,
      }));
    }
  };
} 