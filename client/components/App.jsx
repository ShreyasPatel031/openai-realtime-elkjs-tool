import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import EventLog from "./console/EventLog";
import SessionControls from "./console/SessionControls";
import ToolPanel from "./ui/ToolPanel";
import ElkTestPage from "./test/ElkTestPage";
import ErrorBoundary from "./console/ErrorBoundary";
import InteractiveCanvas from "./ui/InteractiveCanvas";

function MainContent({ events, isSessionActive, startSession, stopSession, sendClientEvent, sendTextMessage }) {
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
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const [isDataChannelReady, setIsDataChannelReady] = useState(false);
  const [currentPage, setCurrentPage] = useState('main');
  const [showNewUI, setShowNewUI] = useState(true);
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
    // const model = "gpt-4o-realtime-preview-2024-12-17";
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
    if (!dataChannel || dataChannel.readyState !== "open") {
      console.log("Data channel not ready (state: " + (dataChannel ? dataChannel.readyState : "null") + "), queueing message");
      console.log("Message size:", JSON.stringify(message).length);
      
      // Limit queue size to prevent memory issues
      if (messageQueue.current.length < 100) {
        messageQueue.current.push(message);
      } else {
        console.warn("Message queue full, dropping message");
      }
      
      // If session is active but channel is closed, try to reprocess the queue after a short delay
      // This can help with temporary disconnections
      if (isSessionActive && dataChannel && dataChannel.readyState === "closed") {
        setTimeout(() => {
          if (isDataChannelReady) {
            processMessageQueue();
          }
        }, 500);
      }
      
      return false; // Return false to indicate message was not sent immediately
    }

    // At this point we know the data channel is open
    try {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      console.log("Sending message, size:", JSON.stringify(message).length);
      dataChannel.send(JSON.stringify(message));
      
      if (!message.timestamp) {
        message.timestamp = timestamp;
      }
      setEvents((prev) => [message, ...prev]);
      return true; // Return true to indicate message was sent successfully
    } catch (error) {
      console.error("Failed to send message:", error);
      console.log("Message size that failed:", JSON.stringify(message).length);
      
      // Only queue the message if it's not too large to send
      const messageSize = JSON.stringify(message).length;
      if (messageSize < 65536) { // WebRTC has a practical limit of ~64KB
        messageQueue.current.push(message);
      } else {
        console.error("Message too large to queue:", messageSize);
      }
      
      return false; // Return false to indicate message was not sent
    }
  }

  // Process queued messages
  function processMessageQueue() {
    if (!dataChannel || dataChannel.readyState !== "open") {
      console.log("Data channel not ready for processing queue, state:", 
                  dataChannel ? dataChannel.readyState : "null");
      return false;
    }
    
    let processedCount = 0;
    const maxProcessPerBatch = 10; // Process at most 10 messages at once
    
    while (messageQueue.current.length > 0 && 
           processedCount < maxProcessPerBatch && 
           dataChannel.readyState === "open") {
      
      const message = messageQueue.current.shift();
      if (!message) continue;
      
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();
      
      try {
        dataChannel.send(JSON.stringify(message));
        if (!message.timestamp) {
          message.timestamp = timestamp;
        }
        setEvents((prev) => [message, ...prev]);
        processedCount++;
      } catch (error) {
        console.error("Failed to send queued message:", error);
        messageQueue.current.unshift(message); // Put it back at the front of the queue
        break;
      }
    }
    
    // If there are more messages and the channel is still open, schedule the next batch
    if (messageQueue.current.length > 0 && dataChannel.readyState === "open") {
      setTimeout(processMessageQueue, 50);
    }
    
    return processedCount > 0;
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

  // Add an effect to monitor data channel status
  useEffect(() => {
    if (dataChannel) {
      // Set up an interval to check the data channel state
      const intervalId = setInterval(() => {
        if (dataChannel.readyState === "closed" && isSessionActive) {
          console.log("Data channel closed but session marked as active - updating status");
          setIsDataChannelReady(false);
          
          // If closed for too long, mark session as inactive
          if (Date.now() - lastDataChannelActivityRef.current > 10000) {
            console.log("Data channel closed for too long, marking session as inactive");
            setIsSessionActive(false);
          }
        } 
        else if (dataChannel.readyState === "open" && !isDataChannelReady) {
          console.log("Data channel open but marked as not ready - updating status");
          setIsDataChannelReady(true);
          lastDataChannelActivityRef.current = Date.now();
          
          // Process any queued messages
          processMessageQueue();
        }
      }, 1000);
      
      return () => clearInterval(intervalId);
    }
  }, [dataChannel, isSessionActive, isDataChannelReady]);

  // Use a ref to track last data channel activity time
  const lastDataChannelActivityRef = useRef(Date.now());

  // Update state when the data channel changes
  useEffect(() => {
    if (dataChannel) {
      setIsDataChannelReady(dataChannel.readyState === "open");
      
      dataChannel.addEventListener("message", (e) => {
        try {
          const event = JSON.parse(e.data);
          if (!event.timestamp) {
            event.timestamp = new Date().toLocaleTimeString();
          }
          setEvents((prev) => [event, ...prev]);
          lastDataChannelActivityRef.current = Date.now();
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
        lastDataChannelActivityRef.current = Date.now();
        setEvents([]);
        processMessageQueue();
      });

      dataChannel.addEventListener("close", () => {
        console.log("Data channel closed");
        setIsDataChannelReady(false);
        // Don't immediately set session inactive - allow for reconnection
        // setIsSessionActive(false); 
      });
    }
  }, [dataChannel]);

  return (
    <div className="flex flex-col h-screen">
      <header className="h-16 bg-gray-100 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="OpenAI Logo" className="w-8 h-8" />
          <h1 className="text-lg font-medium">OpenAI Real-time Console</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <span className="mr-2">UI Mode:</span>
            <div className="flex items-center bg-gray-200 rounded-lg p-1">
              <button 
                onClick={() => setShowNewUI(false)}
                className={`px-3 py-1 rounded-md ${!showNewUI ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              >
                Classic
              </button>
              <button 
                onClick={() => setShowNewUI(true)}
                className={`px-3 py-1 rounded-md ${showNewUI ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              >
                Modern
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isSessionActive ? "bg-green-500" : "bg-red-500"}`}></span>
            <span className="text-sm">{isSessionActive ? "Connected" : "Disconnected"}</span>
          </div>
        </div>
      </header>
      <main className="flex-grow relative">
        {showNewUI ? (
          <ErrorBoundary>
            <InteractiveCanvas 
              isSessionActive={isSessionActive}
              startSession={startSession}
              stopSession={stopSession}
              sendTextMessage={sendTextMessage}
              sendClientEvent={sendClientEvent}
              events={events}
            />
          </ErrorBoundary>
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
    </div>
  );
}
