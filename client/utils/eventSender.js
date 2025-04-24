// ─── constants ────────────────────────────────────────────────────────────────
const MAX_BYTES = 1000;          // stay safely below 1024
const CHUNK_PREFIX = "part ";    // OpenAI will concatenate these automatically

/**
 * Low-level sender.  Call instead of dataChannel.send(JSON.stringify(evt))
 *
 * @param dc   – the open RTCDataChannel
 * @param evt  – a *complete* Realtime event object
 *
 * returns true if at least one frame was written to the wire
 */
export function sendEventWithAutoChunk(
  dc,
  evt
) {
  if (!dc || dc.readyState !== "open") {
    console.warn("data-channel not ready – caller should queue & retry");
    return false;
  }

  const payload = JSON.stringify(evt);
  if (payload.length <= MAX_BYTES) {
    dc.send(payload);
    return true;
  }

  // ── try text-chunking if the payload is a user-message ─────────
  if (
    evt.type === "conversation.item.create" &&
    evt.item?.type === "message" &&
    evt.item?.content?.[0]?.type === "input_text"
  ) {
    const fullText = evt.item.content[0].text;

    // Rough slice – we'll make sure each encoded chunk is ≤ MAX_BYTES
    const CHUNK_SIZE = 800;                          // characters

    let index = 0;
    const totalChunks = Math.ceil(fullText.length / CHUNK_SIZE);

    while (index < fullText.length) {
      const slice = fullText.slice(index, index + CHUNK_SIZE);
      index += CHUNK_SIZE;

      // Duplicate the original event but replace the text with the slice
      // and prepend a tiny marker so the assistant can join them.
      const chunkEvt = {
        ...evt,
        // event_id per chunk is fine – the assistant concatenates on content,
        // not on ID.
        event_id: crypto.randomUUID(),
        item: {
          ...evt.item,
          content: [
            {
              ...evt.item.content[0],
              text: `${CHUNK_PREFIX}${slice}`,
            },
          ],
        },
      };

      // make sure we didn't blow the limit (very unlikely, but safe to test)
      const wire = JSON.stringify(chunkEvt);
      if (wire.length > MAX_BYTES) {
        console.error("single chunk still too large", wire.length);
        return false;
      }
      dc.send(wire);
    }

    // ↳ after *all* chunks send a bare "response.create" so the assistant
    //    starts replying immediately (mirrors the open-source example)
    dc.send(JSON.stringify({ type: "response.create" }));
    return true;
  }

  console.error(
    `event ${evt.type} is ${payload.length} B – can't auto-chunk; ` +
      "shrink it before calling sendEventWithAutoChunk"
  );
  return false;
} 