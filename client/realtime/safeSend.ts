import { Dispatch, SetStateAction } from "react";
import { SendStatus, ClientEvent } from './types';

export function safeSend(
  send: ((e: ClientEvent) => void) | undefined,
  setStatus: Dispatch<SetStateAction<SendStatus>>,
) {
  return (evt: ClientEvent) => {
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