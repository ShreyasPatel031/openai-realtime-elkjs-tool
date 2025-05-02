import { ClientEvent, ResponseDeltaEvent, FunctionCall, FunctionCallDelta } from './types';

export const latestAssistantText = (evts: ClientEvent[]) =>
  [...evts]
    .filter((e): e is ResponseDeltaEvent => e.type === "response.delta"
              && e.delta?.type === "message"
              && e.delta?.content?.[0]?.type === "text")
    .sort((a,b)=> new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

export const functionCallEvents = (evts: ClientEvent[]): FunctionCall[] =>
  evts.flatMap(e => {
    if (e.type === "response.delta" && e.delta?.type === "function_call") {
      const delta = e.delta as FunctionCallDelta;
      return [{
        id: delta.id,
        call_id: delta.call_id,
        name: delta.name,
        arguments: delta.arguments
      }];
    }
    if (e.type === "response.done" && e.response?.output) {
      return e.response.output.filter((o): o is FunctionCall => 
        typeof o === 'object' && 'name' in o && 'call_id' in o
      );
    }
    return [];
  }); 