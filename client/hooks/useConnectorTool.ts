import { useState, useCallback, useRef } from 'react';
import { ReactFlowInstance, Connection } from 'reactflow';
import { Tool } from './useToolSelection';

interface UseConnectorToolProps {
  selectedTool: Tool;
  reactFlowRef: React.RefObject<ReactFlowInstance>;
  onConnect: (connection: Connection) => void;
  setSelectedNodes: (nodes: any[]) => void;
}

export const useConnectorTool = ({ 
  selectedTool, 
  reactFlowRef, 
  onConnect, 
  setSelectedNodes 
}: UseConnectorToolProps) => {
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingFromHandle, setConnectingFromHandle] = useState<string | null>(null);
  const [connectionMousePos, setConnectionMousePos] = useState<{ x: number; y: number } | null>(null);

  // Clear connection state
  const handleConnectEnd = useCallback(() => {
    setConnectingFrom(null);
    setConnectingFromHandle(null);
    setConnectionMousePos(null);
  }, []);

  // Manual handler for clicking on connector dots to start connection with edge preview
  const handleConnectorDotClick = useCallback((nodeId: string, handleId: string) => {
    // CRITICAL: Immediately deselect all nodes when connector port is clicked
    // This prevents ReactFlow from selecting the node when clicking on the port
    if (reactFlowRef.current) {
      reactFlowRef.current.setNodes((nds) => nds.map(node => ({ ...node, selected: false })));
    }
    setSelectedNodes([]);
    
    console.log(`[ConnectorTool] handleConnectorDotClick called:`, { nodeId, handleId, currentConnectingFrom: connectingFrom });
    
    // Check if handleId is a target handle (completing a connection)
    if (handleId.includes('target') && connectingFrom && connectingFrom !== nodeId) {
      // Complete the connection
      console.log(`[ConnectorTool] Completing connection from ${connectingFrom} to ${nodeId}`, {
        source: connectingFrom,
        sourceHandle: connectingFromHandle,
        target: nodeId,
        targetHandle: handleId
      });
      
      // Create the connection with proper handle IDs
      const connection = { 
        source: connectingFrom, 
        sourceHandle: connectingFromHandle || undefined, 
        target: nodeId, 
        targetHandle: handleId || undefined
      };
      
      console.log(`[ConnectorTool] Calling onConnect with:`, connection);
      console.log(`[ConnectorTool] Connection details:`, {
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
        sourceHandleType: connection.sourceHandle?.includes('connector') ? 'connector' : 'regular',
        targetHandleType: connection.targetHandle?.includes('connector') ? 'connector' : 'regular'
      });
      
      // Call onConnect - this will trigger ReactFlow's onConnect handler
      // which then calls our graph onConnect handler
      onConnect(connection);
      
      // Clear connection state
      setConnectingFrom(null);
      setConnectingFromHandle(null);
      setConnectionMousePos(null);
      return;
    }
    
    // Otherwise, start a new connection
    console.log(`[ConnectorTool] Starting new connection from ${nodeId}, handle ${handleId}`);
    setConnectingFrom(nodeId);
    setConnectingFromHandle(handleId);
    
    // Track mouse movement to show edge preview (always show when connecting)
    const handleMouseMove = (e: MouseEvent) => {
      if (reactFlowRef.current) {
        const rf = reactFlowRef.current;
        const flowPos = (rf as any).screenToFlowPosition
          ? (rf as any).screenToFlowPosition({ x: e.clientX, y: e.clientY })
          : rf.project({ x: e.clientX, y: e.clientY });
        
        // Always show preview line while moving
        setConnectionMousePos(flowPos);
      }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      // Remove mouse tracking
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      const currentConnectingFrom = connectingFrom;
      const currentConnectingFromHandle = connectingFromHandle;
      
      if (!currentConnectingFrom) {
        setConnectionMousePos(null);
        return;
      }
      
      // Check if clicked on a target handle
      const target = e.target as HTMLElement;
      const targetHandle = target.closest('.react-flow__handle') as HTMLElement;
      
      if (targetHandle) {
        const handleType = targetHandle.getAttribute('data-handletype');
        const handleId = targetHandle.getAttribute('data-id') || targetHandle.id;
        
        // Find the node that contains this handle
        const nodeElement = targetHandle.closest('.react-flow__node') as HTMLElement;
        const targetNodeId = nodeElement?.getAttribute('data-id') || nodeElement?.id;
        
        // Check if it's a target handle (or connector target handle)
        if (targetNodeId && handleId && 
            (handleType === 'target' || handleId.includes('target')) && 
            targetNodeId !== currentConnectingFrom) {
          // Create connection
          onConnect({ source: currentConnectingFrom, sourceHandle: currentConnectingFromHandle, target: targetNodeId, targetHandle: handleId });
          // Clear connection state after successful connection
          setConnectingFrom(null);
          setConnectingFromHandle(null);
          setConnectionMousePos(null);
          return;
        }
      }
      
      // Also check if clicking on another connector dot (to connect to it)
      const clickedConnectorDot = target.closest('[data-connector-dot]') as HTMLElement;
      if (clickedConnectorDot) {
        const targetNodeId = clickedConnectorDot.getAttribute('data-node-id');
        const targetHandleId = clickedConnectorDot.getAttribute('data-handle-id');
        
        if (targetNodeId && targetHandleId && targetNodeId !== currentConnectingFrom) {
          // Create connection to the clicked connector dot
          onConnect({ source: currentConnectingFrom, sourceHandle: currentConnectingFromHandle, target: targetNodeId, targetHandle: targetHandleId });
          setConnectingFrom(null);
          setConnectingFromHandle(null);
          setConnectionMousePos(null);
          return;
        }
      }
      
      // If clicked anywhere else (empty space, node, etc.), cancel connection (deselect)
      console.log(`[ConnectorTool] Clicked outside port area, cancelling connection (deselection)`);
      setConnectingFrom(null);
      setConnectingFromHandle(null);
      setConnectionMousePos(null);
    };
    
    const handleClick = (e: MouseEvent) => {
      // Check if this is a click on a connector port (source or target)
      const target = e.target as HTMLElement;
      const isConnectorPortClick = target.closest('[data-connector-dot]') || 
                                   target.closest('[style*="rgba(0, 255, 0"]') ||
                                   target.closest('.react-flow__handle[id*="connector"]');
      
      // CRITICAL FIX: Allow toolbar clicks to pass through
      const isToolbarClick = target.closest('.absolute.bottom-8.left-1\\/2.-translate-x-1\\/2.z-\\[8000\\]') ||
                             target.closest('[aria-label="Select (V)"]') ||
                             target.closest('[aria-label="Add box (R)"]') ||
                             target.closest('[aria-label="Add connector (C)"]') ||
                             target.closest('[aria-label="Create group (G)"]');
      
      // If clicking on toolbar, let the toolbar handle it - don't intercept
      if (isToolbarClick) {
        console.log(`[ConnectorTool] Toolbar click detected - allowing it to pass through`);
        // Clean up listeners but don't prevent the toolbar click
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('click', handleClick);
        return; // Let toolbar handle the click
      }
      
      // If clicking anywhere EXCEPT a connector port or toolbar, cancel the connection (deselect)
      if (!isConnectorPortClick) {
        console.log(`[ConnectorTool] Click outside connector port detected, cancelling connection (deselection)`);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('click', handleClick);
        setConnectingFrom(null);
        setConnectingFromHandle(null);
        setConnectionMousePos(null);
      } else {
        // Click was on a connector port - let the port click handler deal with it
        // Just clean up the event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('click', handleClick);
      }
    };
    
    // Start tracking mouse
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp, { once: true });
    // Listen for clicks to detect deselection (clicking anywhere outside ports)
    document.addEventListener('click', handleClick, { once: true, capture: true });
  }, [connectingFrom, connectingFromHandle, onConnect, handleConnectEnd, reactFlowRef, setSelectedNodes]);

  return {
    connectingFrom,
    connectingFromHandle,
    connectionMousePos,
    handleConnectorDotClick,
    handleConnectEnd
  };
};
