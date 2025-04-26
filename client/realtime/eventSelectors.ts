export const latestAssistantText = (evts: any[]) =>
  [...evts]
    .filter(e => e.type === "response.delta"
              && e.delta?.type === "message"
              && e.delta?.content?.[0]?.type === "text")
    .sort((a,b)=> new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

export const functionCallEvents = (evts: any[]) =>
  evts.flatMap(e => {
    if (e.type === "response.delta" && e.delta?.type === "function_call") return [e.delta];
    if (e.type === "response.done"  && e.response?.output)
      return e.response.output.filter((o:any)=>o.type==="function_call");
    return [];
  }); 