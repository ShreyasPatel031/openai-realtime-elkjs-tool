import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import ToolPanel from "./ToolPanel";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [isDataChannelReady, setIsDataChannelReady] = useState(false);
  const messageQueue = useRef([]);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);

  async function startSession() {
    // Get a session token for OpenAI Realtime API
    const tokenResponse = await fetch("/token");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;

    // Create a peer connection
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    pc.addTrack(ms.getTracks()[0]);

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    peerConnection.current.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  // Send a message to the model
  function sendClientEvent(message) {
    if (!isDataChannelReady) {
      console.log("Data channel not ready, queueing message");
      console.log("Message size:", JSON.stringify(message).length);
      messageQueue.current.push(message);
      return;
    }

    if (dataChannel) {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      try {
        console.log("Sending message, size:", JSON.stringify(message).length);
        console.log("Data channel state:", dataChannel.readyState);
        dataChannel.send(JSON.stringify(message));
        if (!message.timestamp) {
          message.timestamp = timestamp;
        }
        setEvents((prev) => [message, ...prev]);
      } catch (error) {
        console.error("Failed to send message:", error);
        console.log("Message size that failed:", JSON.stringify(message).length);
        messageQueue.current.push(message);
      }
    } else {
      console.error("Failed to send message - no data channel available", message);
      messageQueue.current.push(message);
    }
  }

  // Process queued messages
  function processMessageQueue() {
    while (messageQueue.current.length > 0 && isDataChannelReady) {
      const message = messageQueue.current.shift();
      if (message) {
        const timestamp = new Date().toLocaleTimeString();
        message.event_id = message.event_id || crypto.randomUUID();
        
        try {
          dataChannel.send(JSON.stringify(message));
          if (!message.timestamp) {
            message.timestamp = timestamp;
          }
          setEvents((prev) => [message, ...prev]);
        } catch (error) {
          console.error("Failed to send queued message:", error);
          messageQueue.current.unshift(message); // Put it back at the front of the queue
          break;
        }
      }
    }
  }

  // Send a text message to the model
  function sendTextMessage(message) {
    // Split message into chunks of 4000 characters
    const chunkSize = 40000;
    const chunks = [];
    for (let i = 0; i < message.length; i += chunkSize) {
      chunks.push(message.slice(i, i + chunkSize));
    }

    // Send each chunk as a separate message
    chunks.forEach((chunk, index) => {
      const event = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: chunk,
            },
          ],
        },
      };

      sendClientEvent(event);
      
      // Only send response.create after the last chunk
      if (index === chunks.length - 1) {
        sendClientEvent({ type: "response.create" });
      }
    });
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      console.log("Data channel created, state:", dataChannel.readyState);
      
      dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }
        setEvents((prev) => [event, ...prev]);
      });

      dataChannel.addEventListener("open", () => {
        console.log("Data channel opened");
        setIsSessionActive(true);
        setIsDataChannelReady(true);
        setEvents([]);
        processMessageQueue();
      });

      dataChannel.addEventListener("close", () => {
        console.log("Data channel closed");
        setIsDataChannelReady(false);
        setIsSessionActive(false);
      });
    }
  }, [dataChannel]);

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-gray-200">
          <img style={{ width: "24px" }} src={logo} />
          <h1>realtime console</h1>
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0">
        <section className="absolute top-0 left-0 right-[380px] bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            <EventLog events={events} />
          </section>
          <section className="absolute h-32 left-0 right-0 bottom-0 p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          </section>
        </section>
        <section className="absolute top-0 w-[380px] right-0 bottom-0 p-4 pt-0 overflow-y-auto">
          <ToolPanel
            sendClientEvent={sendClientEvent}
            sendTextMessage={sendTextMessage}
            events={events}
            isSessionActive={isSessionActive}
          />
        </section>
      </main>
    </>
  );
}
