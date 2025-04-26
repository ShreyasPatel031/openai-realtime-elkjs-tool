export type EventCB = (e: any) => void;

export class RtcClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private queue: any[] = [];
  private onEvent: EventCB;

  constructor(onEvent: EventCB) { this.onEvent = onEvent; }

  /** Open peer-conn, mic → track, data-channel. */
  async connect(token: string, model = "gpt-4o-realtime-preview-2024-12-17") {
    this.pc = new RTCPeerConnection();
    /* audio track ↓ */
    const mic = await navigator.mediaDevices.getUserMedia({ audio:true });
    this.pc.addTrack(mic.getTracks()[0]);
    /* remote audio */
    const audio = new Audio(); audio.autoplay = true;
    this.pc.ontrack = e => audio.srcObject = e.streams[0];

    /* data-channel */
    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.addEventListener("open",  () => this.flush());
    this.dc.addEventListener("close", () => console.log("dc closed"));
    this.dc.addEventListener("message", e => this.onEvent(JSON.parse(e.data)));

    /* SDP dance */
    const off = await this.pc.createOffer();
    await this.pc.setLocalDescription(off);
    const res = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
      method:"POST", body:off.sdp,
      headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/sdp" },
    });
    await this.pc.setRemoteDescription({ type:"answer", sdp: await res.text() });
  }

  /** Queues if closed, else sends. */
  send(evt: any) {
    if (!this.dc || this.dc.readyState !== "open") { this.queue.push(evt); return false; }
    this.dc.send(JSON.stringify(evt)); return true;
  }

  close() {
    if (this.dc) this.dc.close();
    if (this.pc) this.pc.close();
    this.queue.length = 0;
  }

  /** internal */
  private flush() {
    while (this.queue.length && this.dc?.readyState === "open")
      this.dc.send(JSON.stringify(this.queue.shift()));
  }
} 