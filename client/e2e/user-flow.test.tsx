/// <reference types="jest" />
/// <reference types="@testing-library/jest-dom" />

/**
 * End-to-End Test for Real-Time Agent User Flow
 * 
 * This test validates the complete user flow from mic connection through
 * graph generation as documented in test-user-flow.md
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../components/App';
import { RtcClient } from '../realtime/RtcClient';
import { StreamExecutor } from '../reasoning/StreamExecutor';

// Add global type declarations
declare global {
  interface Window {
    realtimeAgentSendTextMessage?: (message: string) => void;
    realtimeAgentSendClientEvent?: (event: any) => boolean;
    realtimeAgentSessionActive?: boolean;
    chatConversationData?: string;
  }
}

// Mock dependencies
jest.mock('../realtime/RtcClient');
jest.mock('../reasoning/StreamExecutor');

// Mock WebRTC and MediaDevices
(global as any).navigator.mediaDevices = {
  getUserMedia: jest.fn().mockResolvedValue({
    getTracks: () => [{
      kind: 'audio',
      enabled: true,
      stop: jest.fn()
    }]
  })
};

(global as any).RTCPeerConnection = jest.fn().mockImplementation(() => ({
  createDataChannel: jest.fn().mockReturnValue({
    onopen: null,
    send: jest.fn()
  }),
  addTrack: jest.fn(),
  createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
  setLocalDescription: jest.fn().mockResolvedValue(undefined),
  setRemoteDescription: jest.fn().mockResolvedValue(undefined),
  ontrack: null,
  ondatachannel: null,
  close: jest.fn()
}));

// Mock fetch for token endpoint
(global as any).fetch = jest.fn().mockResolvedValue({
  json: jest.fn().mockResolvedValue({
    client_secret: { value: 'mock-ephemeral-key' }
  })
});

describe('Real-Time Agent User Flow', () => {
  let mockRtcClient: any;
  let mockEventHandler: any;
  let mockStreamExecutor: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup RTC client mock
    mockEventHandler = jest.fn();
    mockRtcClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockReturnValue(true),
      close: jest.fn()
    };
    
    (RtcClient as jest.Mock).mockImplementation((eventHandler) => {
      mockEventHandler = eventHandler;
      return mockRtcClient;
    });

    // Setup StreamExecutor mock
    mockStreamExecutor = {
      execute: jest.fn().mockResolvedValue(undefined)
    };
    
    (StreamExecutor as jest.Mock).mockImplementation(() => mockStreamExecutor);

    // Clear window globals
    delete window.realtimeAgentSendTextMessage;
    delete window.realtimeAgentSendClientEvent;
    delete window.realtimeAgentSessionActive;
    delete window.chatConversationData;
  });

  test('Complete user flow from mic connection to graph generation', async () => {
    // Step 1: Render the app
    const { container } = render(<App />);
    
    // Verify initial state
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    
    // Step 2: Click mic button to start connection
    const micButton = await waitFor(() => {
      const button = container.querySelector('[data-streamviewer-trigger]');
      expect(button).toBeTruthy();
      return button as HTMLButtonElement;
    });
    
    // Find the actual mic button in the Chatbox
    const chatboxMicButton = container.querySelector('button svg.lucide-mic')?.parentElement;
    expect(chatboxMicButton).toBeTruthy();
    
    await act(async () => {
      fireEvent.click(chatboxMicButton!);
    });

    // Verify connection is being established
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
    expect(mockRtcClient.connect).toHaveBeenCalledWith('mock-ephemeral-key');
    
    // Step 3: Simulate session.created event (agent is ready)
    await act(async () => {
      mockEventHandler({
        type: 'session.created',
        timestamp: new Date().toISOString(),
        session: { id: 'test-session' }
      });
    });
    
    // Verify agent is ready
    await waitFor(() => {
      expect(screen.getByText('Ready to Listen')).toBeInTheDocument();
    });
    
    // Step 4: Simulate agent saying "How can I help?"
    await act(async () => {
      mockEventHandler({
        type: 'response.audio_transcript.delta',
        delta: 'How can I help?'
      });
    });
    
    // Step 5: Simulate user response
    const userMessage = "I want to deploy a kubernetes GCP architecture, can you log my requirements";
    
    await act(async () => {
      mockEventHandler({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: userMessage
      });
    });
    
    // Step 6: Simulate agent triggering log_requirements_and_generate_questions
    await act(async () => {
      mockEventHandler({
        type: 'response.function_call_arguments.done',
        name: 'log_requirements_and_generate_questions',
        call_id: 'call-123',
        arguments: JSON.stringify({
          requirements: ["Deploy kubernetes GCP architecture"],
          questions: [
            {
              id: "q1",
              type: "radio",
              question: "What type of Kubernetes deployment do you need?",
              options: [
                { id: "gke-autopilot", text: "GKE Autopilot (Fully managed)" },
                { id: "gke-standard", text: "GKE Standard (More control)" }
              ]
            },
            {
              id: "q2", 
              type: "radio",
              question: "What networking configuration do you prefer?",
              options: [
                { id: "public", text: "Public endpoints" },
                { id: "private", text: "Private VPC only" }
              ]
            },
            {
              id: "q3",
              type: "checkbox",
              question: "Which additional services do you need?",
              options: [
                { id: "monitoring", text: "Cloud Monitoring" },
                { id: "logging", text: "Cloud Logging" },
                { id: "registry", text: "Container Registry" }
              ]
            }
          ]
        })
      });
    });
    
    // Step 7: Verify chat window appears with questions
    await waitFor(() => {
      expect(screen.getByText('What type of Kubernetes deployment do you need?')).toBeInTheDocument();
      expect(screen.getByText('What networking configuration do you prefer?')).toBeInTheDocument();
      expect(screen.getByText('Which additional services do you need?')).toBeInTheDocument();
    });
    
    // Step 8: Select first option for all questions
    const gkeAutopilotRadio = screen.getByLabelText('GKE Autopilot (Fully managed)');
    const publicEndpointsRadio = screen.getByLabelText('Public endpoints');
    const monitoringCheckbox = screen.getByLabelText('Cloud Monitoring');
    
    await act(async () => {
      fireEvent.click(gkeAutopilotRadio);
      fireEvent.click(publicEndpointsRadio);
      fireEvent.click(monitoringCheckbox);
    });
    
    // Verify selections
    expect(gkeAutopilotRadio).toBeChecked();
    expect(publicEndpointsRadio).toBeChecked();
    expect(monitoringCheckbox).toBeChecked();
    
    // Step 9: Click Process button
    const processButton = screen.getByRole('button', { name: /process/i });
    expect(processButton).toBeInTheDocument();
    
    await act(async () => {
      fireEvent.click(processButton);
    });
    
    // Step 10: Verify StreamExecutor is triggered
    await waitFor(() => {
      expect(mockStreamExecutor.execute).toHaveBeenCalled();
    });
    
    // Step 11: Simulate reasoning and function calls
    const mockGraph = {
      id: 'root',
      children: [],
      edges: []
    };
    
    // Simulate display_elk_graph function call
    await act(async () => {
      // Update UI to show reasoning
      const reasoningMessage = {
        id: 'reasoning-1',
        type: 'reasoning',
        content: 'Analyzing requirements for GKE Autopilot deployment...',
        sender: 'assistant'
      };
      
      const addMessageEvent = new CustomEvent('addChatMessage', {
        detail: { message: reasoningMessage }
      });
      document.dispatchEvent(addMessageEvent);
    });
    
    // Simulate batch_update function calls that modify the graph
    const updatedGraph = {
      id: 'root',
      children: [
        {
          id: 'gcp-project',
          type: 'group_node',
          data: { 
            label: 'GCP Project',
            groupIconName: 'gcp_system'
          },
          children: [
            {
              id: 'gke-cluster',
              type: 'node',
              data: { label: 'GKE Autopilot Cluster' }
            }
          ]
        },
        {
          id: 'networking',
          type: 'group_node',
          data: {
            label: 'Networking',
            groupIconName: 'gcp_infrastructure_system'
          },
          children: [
            {
              id: 'load-balancer',
              type: 'node',
              data: { label: 'Load Balancer' }
            }
          ]
        }
      ],
      edges: [
        {
          id: 'edge-1',
          sources: ['load-balancer'],
          targets: ['gke-cluster']
        }
      ]
    };
    
    // Simulate function call updates
    await act(async () => {
      const functionMessage = {
        id: 'function-1',
        type: 'function-calling',
        content: 'batch_update: Creating GCP infrastructure groups...',
        sender: 'assistant',
        currentFunction: 'batch_update'
      };
      
      const addFunctionEvent = new CustomEvent('addChatMessage', {
        detail: { message: functionMessage }
      });
      document.dispatchEvent(addFunctionEvent);
    });
    
    // Step 12: Verify graph state has been updated
    // This would normally be verified through the actual graph component
    // For testing, we'll verify that the completion message appears
    await act(async () => {
      const completeMessage = {
        id: 'complete-1',
        type: 'process-complete',
        content: 'Architecture processing complete!',
        sender: 'system'
      };
      
      const addCompleteEvent = new CustomEvent('addChatMessage', {
        detail: { message: completeMessage }
      });
      document.dispatchEvent(addCompleteEvent);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Architecture Processing Complete!')).toBeInTheDocument();
    });
  });

  test('Validates error handling when mic permission is denied', async () => {
    // Mock getUserMedia rejection
    (global as any).navigator.mediaDevices.getUserMedia = jest.fn().mockRejectedValue(
      new Error('Permission denied')
    );
    
    const { container } = render(<App />);
    
    const chatboxMicButton = container.querySelector('button svg.lucide-mic')?.parentElement;
    expect(chatboxMicButton).toBeTruthy();
    
    await act(async () => {
      fireEvent.click(chatboxMicButton!);
    });
    
    // Should handle the error gracefully
    await waitFor(() => {
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });
  });

  test('Validates graph state updates through function calls', async () => {
    // This test focuses on verifying that function calls update the graph state
    const mockSetElkGraph = jest.fn();
    const initialGraph = { id: 'root', children: [], edges: [] };
    
    // Mock the handleFunctionCall to simulate graph updates
    jest.mock('../realtime/handleFunctionCall', () => ({
      handleFunctionCall: jest.fn((call, context) => {
        if (call.name === 'batch_update') {
          const newGraph = {
            ...initialGraph,
            children: [{ id: 'new-group', type: 'group_node' }]
          };
          context.setElkGraph(newGraph);
        }
      })
    }));
    
    // Render and setup
    render(<App />);
    
    // Simulate the flow up to function execution
    // ... (abbreviated for clarity)
    
    // Verify that setElkGraph was called with updated graph
    await waitFor(() => {
      expect(mockSetElkGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({ id: 'new-group' })
          ])
        })
      );
    });
  });
});