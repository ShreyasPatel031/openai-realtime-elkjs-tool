import { ClientEvent, ResponseDeltaEvent, FunctionCall, FunctionCallDelta } from './types';

export const latestAssistantText = (evts: ClientEvent[]) =>
  [...evts]
    .filter((e): e is ResponseDeltaEvent => e.type === "response.delta"
              && e.delta?.type === "message"
              && e.delta?.content?.[0]?.type === "text")
    .sort((a,b)=> new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

export const functionCallEvents = (evts: ClientEvent[]): FunctionCall[] => {
  // Accumulate function call arguments across multiple delta events
  const functionCallMap = new Map<string, { name: string; call_id: string; arguments: string | Record<string, any>; id?: string }>();
  
  // Process delta events to accumulate arguments
  evts.forEach(e => {
    if (e.type === "response.delta" && e.delta?.type === "function_call") {
      const delta = e.delta as FunctionCallDelta;
      const key = delta.call_id || delta.name;
      
      if (!functionCallMap.has(key)) {
        functionCallMap.set(key, {
        id: delta.id,
        call_id: delta.call_id,
        name: delta.name,
          arguments: delta.arguments || ''
        });
      } else {
        // Accumulate arguments - only if both are strings
        const existing = functionCallMap.get(key)!;
        if (typeof existing.arguments === 'string' && typeof delta.arguments === 'string') {
          existing.arguments += delta.arguments;
        } else if (typeof delta.arguments === 'string' && delta.arguments) {
          // If existing is object but delta is string, replace with accumulated string
          existing.arguments = (typeof existing.arguments === 'string' ? existing.arguments : '') + delta.arguments;
        }
      }
    }
  });
  
  // Process done events for complete function calls
  const doneEvents = evts.flatMap(e => {
    if (e.type === "response.done" && e.response?.output) {
      return e.response.output.filter((o): o is FunctionCall => 
        typeof o === 'object' && 'name' in o && 'call_id' in o
      );
    }
    return [];
  }); 
  
  // Combine accumulated deltas with done events, preferring done events for complete data
  const result: FunctionCall[] = [];
  
  // Add done events first (they have complete data)
  doneEvents.forEach(call => {
    result.push(call);
  });
  
  // Add accumulated delta events only if not already present in done events
  functionCallMap.forEach(call => {
    const alreadyExists = result.some(r => r.call_id === call.call_id);
    if (!alreadyExists) {
      result.push(call);
    }
  });
  
  return result;
}; 