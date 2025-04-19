'use client'

import { useEffect, useRef, useState } from "react";
import Image from 'next/image';

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
          <div className="h-full">
            <h2 className="text-sm font-semibold mb-4">Tools</h2>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded">
                <p className="text-sm">
                  This panel will contain tools for interacting with the model.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="h-32 p-4">
          <div className="h-full">
            <form onSubmit={(e) => {
              e.preventDefault();
              const message = (e.currentTarget.elements.namedItem('message') as HTMLTextAreaElement).value;
              if (message.trim()) {
                sendTextMessage(message);
                (e.currentTarget.elements.namedItem('message') as HTMLTextAreaElement).value = '';
              }
            }} className="flex flex-col h-full">
              <div className="flex-1">
                <textarea
                  name="message"
                  placeholder="Type your message here..."
                  className="w-full h-full p-2 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!isSessionActive}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <button
                  type="button"
                  onClick={isSessionActive ? stopSession : startSession}
                  className={`px-4 py-2 rounded ${
                    isSessionActive
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
                >
                  {isSessionActive ? 'Stop Session' : 'Start Session'}
                </button>
                <button
                  type="submit"
                  disabled={!isSessionActive}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </section>
      </section>
      <section className="absolute top-0 right-0 w-[20%] bottom-0 p-4 pt-0 overflow-y-auto">
        <div className="h-full">
          <h2 className="text-sm font-semibold mb-4">Event Log</h2>
          <div className="space-y-2">
            {events.map((event, index) => (
              <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                <div className="font-mono text-gray-500">{event.timestamp}</div>
                <div className="font-mono">{event.type}</div>
                <pre className="mt-1 text-gray-600 whitespace-pre-wrap">
                  {JSON.stringify(event, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
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
    try {
      // Get a session token for OpenAI Realtime API
      const tokenResponse = await fetch("/api/token");
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('Token error:', errorData);
        throw new Error(`Failed to get token: ${errorData.error || tokenResponse.statusText}`);
      }
      const data = await tokenResponse.json();
      console.log('Token response:', data);
      
      // Check if we have a valid token in the response
      if (!data || !data.client_secret || !data.client_secret.value) {
        console.error('Invalid token data:', data);
        throw new Error('Invalid token response from server');
      }
      
      const SESSION_TOKEN = data.client_secret.value;
      console.log('Using session token:', SESSION_TOKEN);

      // Create a peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });

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

      const baseUrl = "https://api.openai.com/v1/realtime/sessions";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      console.log('Sending SDP offer to:', `${baseUrl}?model=${model}`);
      
      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SESSION_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sdp: offer.sdp,
          type: "offer",
          session_id: data.id // Add the session ID to the request
        }),
      });

      if (!sdpResponse.ok) {
        const errorData = await sdpResponse.json();
        console.error('SDP error:', errorData);
        throw new Error(`Failed to get SDP answer: ${errorData.error || sdpResponse.statusText}`);
      }

      const answerData = await sdpResponse.json();
      console.log('SDP answer:', answerData);
      
      if (!answerData.sdp) {
        throw new Error('Invalid SDP answer from server');
      }

      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: answerData.sdp,
      };
      await pc.setRemoteDescription(answer);

      // Set up data channel event handlers
      dc.onopen = () => {
        console.log('Data channel opened');
        setIsDataChannelReady(true);
        setIsSessionActive(true);
      };

      dc.onclose = () => {
        console.log('Data channel closed');
        setIsDataChannelReady(false);
        setIsSessionActive(false);
      };

      dc.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setEvents(prev => [...prev, {
            ...message,
            timestamp: new Date().toISOString(),
            type: 'received'
          }]);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      peerConnection.current = pc;
    } catch (error) {
      console.error("Failed to start session:", error);
      setIsSessionActive(false);
      setDataChannel(null);
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
    }
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
          <img src="/openai-logomark.svg" alt="OpenAI Logo" style={{ width: "24px" }} />
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
            <h1 className="text-2xl font-bold mb-4">ELK Test Page</h1>
            <p className="text-gray-600">
              This page will contain testing tools for ELK integration.
            </p>
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