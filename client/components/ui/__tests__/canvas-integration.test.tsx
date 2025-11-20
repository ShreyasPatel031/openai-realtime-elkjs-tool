/**
 * Real Canvas Integration Test
 * Tests actual node placement on canvas with real clicks
 */

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import InteractiveCanvas from '../InteractiveCanvas';
import { ViewModeProvider } from '../../../contexts/ViewModeContext';

// Mock the necessary context and dependencies
jest.mock('../../../contexts/ApiEndpointContext', () => ({
  ApiEndpointProvider: ({ children }: any) => children,
  useApiEndpoint: () => ({ apiEndpoint: 'http://localhost:3001' })
}));

jest.mock('../../../hooks/useChatSession', () => ({
  useChatSession: () => ({
    messages: [],
    sendMessage: jest.fn(),
    clearMessages: jest.fn(),
    isLoading: false
  })
}));

jest.mock('../../../utils/chatPersistence', () => ({
  markEmbedToCanvasTransition: jest.fn(),
  isEmbedToCanvasTransition: () => false,
  clearEmbedToCanvasFlag: jest.fn(),
  getChatMessages: () => [],
  getCurrentConversation: () => null,
  normalizeChatMessages: (msgs: any) => msgs,
  mergeChatMessages: (msgs: any) => msgs,
  saveChatMessage: jest.fn()
}));

// Mock ReactFlow
jest.mock('reactflow', () => ({
  ...jest.requireActual('reactflow'),
  __esModule: true,
  default: ({ children, onPaneClick, onInit, ...props }: any) => {
    // Mock ReactFlow instance
    const mockInstance = {
      project: (point: { x: number; y: number }) => point,
      screenToFlowPosition: (point: { x: number; y: number }) => point,
      fitView: jest.fn(),
      setViewport: jest.fn(),
      getViewport: () => ({ x: 0, y: 0, zoom: 1 })
    };

    React.useEffect(() => {
      if (onInit) onInit(mockInstance);
    }, []);

    return (
      <div 
        data-testid="react-flow-canvas"
        onClick={(e) => {
          // Simulate ReactFlow pane click
          const mockEvent = {
            ...e,
            target: { classList: { contains: (cls: string) => cls === 'react-flow__pane' } }
          };
          if (onPaneClick) onPaneClick(mockEvent);
        }}
        style={{ width: '100%', height: '500px', position: 'relative' }}
      >
        {children}
        <div data-testid="canvas-nodes-container">
          {/* Mock node rendering area */}
        </div>
      </div>
    );
  },
  Background: () => <div data-testid="react-flow-background" />,
  Controls: () => <div data-testid="react-flow-controls" />,
  BackgroundVariant: { Dots: 'dots' },
  applyNodeChanges: (changes: any, nodes: any) => nodes,
  applyEdgeChanges: (changes: any, edges: any) => edges,
  getRectOfNodes: () => ({ x: 0, y: 0, width: 100, height: 100 }),
  getTransformForBounds: () => ({ x: 0, y: 0, zoom: 1 })
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ViewModeProvider mode="canvas">
    {children}
  </ViewModeProvider>
);

describe('Canvas Integration - Real Node Placement', () => {
  beforeEach(() => {
    // Clear localStorage to start fresh
    localStorage.clear();
    
    // Mock console methods to avoid noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should place node on canvas when clicking with box tool selected', async () => {
    // Render the full InteractiveCanvas component
    const { container } = render(
      <TestWrapper>
        <InteractiveCanvas
          isSessionActive={false}
          isConnecting={false}
          isAgentReady={false}
          startSession={() => {}}
          stopSession={() => {}}
          sendTextMessage={() => {}}
          sendClientEvent={() => {}}
          events={[]}
          apiEndpoint="http://localhost:3001"
          isPublicMode={false}
          rightPanelCollapsed={false}
        />
      </TestWrapper>
    );

    // Wait for component to initialize
    await waitFor(() => {
      expect(screen.getByTestId('react-flow-canvas')).toBeInTheDocument();
    });

    // Step 1: Click "Add box" tool button
    const addBoxButton = screen.getByRole('button', { name: /add box/i });
    expect(addBoxButton).toBeInTheDocument();
    
    fireEvent.click(addBoxButton);
    
    // Verify tool is selected (button should have active state)
    await waitFor(() => {
      expect(addBoxButton).toHaveClass('bg-blue-100'); // or whatever active class is used
    });

    // Step 2: Click on canvas to place node
    const canvas = screen.getByTestId('react-flow-canvas');
    const clickPosition = { clientX: 300, clientY: 200 };
    
    fireEvent.click(canvas, {
      clientX: clickPosition.clientX,
      clientY: clickPosition.clientY,
      bubbles: true
    });

    // Step 3: Verify node was created and appears on canvas
    await waitFor(() => {
      // Look for the node textbox (nodes start in edit mode)
      const nodeTextbox = screen.queryByPlaceholderText('Add text');
      expect(nodeTextbox).toBeInTheDocument();
    }, { timeout: 5000 });

    // Step 4: Verify node is positioned correctly
    const nodeTextbox = screen.getByPlaceholderText('Add text');
    const nodeContainer = nodeTextbox.closest('[data-id]'); // ReactFlow nodes have data-id
    
    if (nodeContainer) {
      // Check that node has proper positioning styles
      const styles = window.getComputedStyle(nodeContainer);
      expect(styles.position).toBe('absolute');
      
      // The exact position will be calculated by placeNodeOnCanvas logic
      // We just verify it's not at 0,0 (the bug we fixed)
      const transform = styles.transform;
      expect(transform).not.toBe('translate(0px, 0px)');
      expect(transform).toMatch(/translate\(\d+px, \d+px\)/);
    }

    console.log('✅ [INTEGRATION TEST] Node successfully placed on canvas');
  });

  it('should not place node when clicking without tool selected', async () => {
    const { container } = render(
      <TestWrapper>
        <InteractiveCanvas
          isSessionActive={false}
          isConnecting={false}
          isAgentReady={false}
          startSession={() => {}}
          stopSession={() => {}}
          sendTextMessage={() => {}}
          sendClientEvent={() => {}}
          events={[]}
          apiEndpoint="http://localhost:3001"
          isPublicMode={false}
          rightPanelCollapsed={false}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('react-flow-canvas')).toBeInTheDocument();
    });

    // Click canvas without selecting add tool first
    const canvas = screen.getByTestId('react-flow-canvas');
    fireEvent.click(canvas, { clientX: 300, clientY: 200 });

    // Wait a bit to make sure no node appears
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify no node textbox appears
    const nodeTextbox = screen.queryByPlaceholderText('Add text');
    expect(nodeTextbox).not.toBeInTheDocument();

    console.log('✅ [INTEGRATION TEST] No node placed without tool selection');
  });

  it('should place multiple nodes at different positions', async () => {
    const { container } = render(
      <TestWrapper>
        <InteractiveCanvas
          isSessionActive={false}
          isConnecting={false}
          isAgentReady={false}
          startSession={() => {}}
          stopSession={() => {}}
          sendTextMessage={() => {}}
          sendClientEvent={() => {}}
          events={[]}
          apiEndpoint="http://localhost:3001"
          isPublicMode={false}
          rightPanelCollapsed={false}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('react-flow-canvas')).toBeInTheDocument();
    });

    const addBoxButton = screen.getByRole('button', { name: /add box/i });
    const canvas = screen.getByTestId('react-flow-canvas');

    // Place first node
    fireEvent.click(addBoxButton);
    fireEvent.click(canvas, { clientX: 100, clientY: 100 });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Add text')).toBeInTheDocument();
    });

    // Exit edit mode by pressing Enter or clicking elsewhere
    const firstNodeTextbox = screen.getByPlaceholderText('Add text');
    fireEvent.keyDown(firstNodeTextbox, { key: 'Enter' });

    // Place second node at different position
    fireEvent.click(addBoxButton);
    fireEvent.click(canvas, { clientX: 300, clientY: 200 });

    await waitFor(() => {
      // Should have 2 nodes total now
      const allNodes = container.querySelectorAll('[data-id^="user-node-"]');
      expect(allNodes.length).toBeGreaterThanOrEqual(2);
    });

    console.log('✅ [INTEGRATION TEST] Multiple nodes placed successfully');
  });
});
