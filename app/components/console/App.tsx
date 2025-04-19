import { useEffect, useRef, useState } from "react";
import Image from 'next/image';
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import ToolPanel from "../ui/ToolPanel";
import ElkTestPage from "../test/ElkTestPage";
import ErrorBoundary from "../../utils/ErrorBoundary";

function MainContent({ events, isSessionActive, startSession, stopSession, sendClientEvent, sendTextMessage }: {
  events: any[];
  isSessionActive: boolean;
  startSession: () => Promise<void>;
  stopSession: () => void;
  sendClientEvent: (message: any) => void;
  sendTextMessage: (message: string) => void;
}) {
  return (
    <>
      <section className="absolute top-0 left-0 w-[80%] bottom-0 flex flex-col">
        <section className="flex-1 px-4 overflow-y-auto">
          <ErrorBoundary>
            <ToolPanel
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          </ErrorBoundary>
        </section>
        <section className="h-32 p-4">
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
      <section className="absolute top-0 right-0 w-[20%] bottom-0 p-4 pt-0 overflow-y-auto">
        <ErrorBoundary>
          <EventLog events={events} />
        </ErrorBoundary>
      </section>
    </>
  );
}

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const [isDataChannelReady, setIsDataChannelReady] = useState(false);
  const [currentPage, setCurrentPage] = useState('main');
  const messageQueue = useRef<any[]>([]);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);

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
    pc.ontrack = (e) => {
      if (audioElement.current) {
        audioElement.current.srcObject = e.streams[0];
      }
    };

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
    const model = "gpt-4o-mini-realtime-preview-2024-12-17";
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

    if (peerConnection.current) {
      peerConnection.current.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  // Send a message to the model
  function sendClientEvent(message: any) {
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
          if (dataChannel) {
            dataChannel.send(JSON.stringify(message));
            if (!message.timestamp) {
              message.timestamp = timestamp;
            }
            setEvents((prev) => [message, ...prev]);
          }
        } catch (error) {
          console.error("Failed to send queued message:", error);
          messageQueue.current.unshift(message); // Put it back at the front of the queue
          break;
        }
      }
    }
  }

  // Send a text message to the model
  function sendTextMessage(message: string) {
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
        try {
          const event = JSON.parse(e.data);
          if (!event.timestamp) {
            event.timestamp = new Date().toLocaleTimeString();
          }
          setEvents((prev) => [event, ...prev]);
        } catch (error) {
          console.error("Error parsing message data:", error);
          console.error("Raw data:", e.data);
          // Add a safe event to the list
          setEvents((prev) => [{
            type: "error",
            timestamp: new Date().toLocaleTimeString(),
            error: "Failed to parse message data"
          }, ...prev]);
        }
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
          <Image width={24} height={24} src="/openai-logomark.svg" alt="OpenAI Logo" />
          <h1>realtime console</h1>
          <button 
            onClick={() => setCurrentPage(currentPage === 'main' ? 'test' : 'main')}
            className="ml-auto text-sm text-gray-600 hover:text-gray-900"
          >
            {currentPage === 'main' ? 'Test ELK' : 'Back to Main'}
          </button>
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0">
        {currentPage === 'test' ? (
          <div className="p-4">
            <ErrorBoundary>
              <ElkTestPage />
            </ErrorBoundary>
          </div>
        ) : (
          <MainContent
            events={events}
            isSessionActive={isSessionActive}
            startSession={startSession}
            stopSession={stopSession}
            sendClientEvent={sendClientEvent}
            sendTextMessage={sendTextMessage}
          />
        )}
      </main>
    </>
  );
} 