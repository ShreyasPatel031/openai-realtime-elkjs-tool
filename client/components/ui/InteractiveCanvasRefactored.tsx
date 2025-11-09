/**
 * REFACTORED INTERACTIVE CANVAS - ORCHESTRATION ONLY
 * 
 * This component now focuses purely on orchestration, using dedicated hooks
 * for tool selection, node selection, connector logic, and canvas interactions.
 * All specific logic has been extracted to maintain clean separation of concerns.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import ReactFlow, { 
  Background, 
  Controls, 
  BackgroundVariant,
  Node,
  Edge,
  OnConnectStartParams,
  useReactFlow,
  Connection
} from "reactflow"
import "reactflow/dist/style.css"

// Import the extracted hooks
import { useToolSelection } from '../../hooks/useToolSelection'
import { useNodeSelection } from '../../hooks/useNodeSelection'
import { useConnectorTool } from '../../hooks/useConnectorTool'
import { useCanvasInteractions } from '../../hooks/useCanvasInteractions'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

// Import UI components
import CanvasToolbarContainer from './CanvasToolbarContainer'
import NodeHoverPreview from './NodeHoverPreview'
import CustomNodeComponent from "../CustomNode"
import GroupNode from "../GroupNode"
import StepEdge from "../StepEdge"

// Import graph management
import { useElkToReactflowGraphConverter } from "../../hooks/useElkToReactflowGraphConverter"
import { CANVAS_STYLES } from "../graph/styles/canvasStyles"

// Import types
import { InteractiveCanvasProps } from "../../types/chat"

// Register node and edge types outside component to prevent recreation
const nodeTypes = {
  custom: CustomNodeComponent,
  group: GroupNode
};

const edgeTypes = {
  step: StepEdge,
  smoothstep: StepEdge
};

const InteractiveCanvasRefactored: React.FC<InteractiveCanvasProps> = ({
  isSessionActive = false,
  isConnecting = false,
  isAgentReady = false,
  startSession = () => {},
  stopSession = () => {},
  sendTextMessage = () => {},
  sendClientEvent = () => {},
  events = [],
  apiEndpoint,
  isPublicMode = false,
  rightPanelCollapsed = false,
}) => {
  const reactFlowRef = useRef<any>(null);

  // Graph management - the core state and handlers
  const {
    rawGraph,
    layoutGraph,
    layoutError,
    nodes,
    edges,
    layoutVersion,
    setRawGraph,
    setNodes,
    setEdges,
    viewStateRef,
    shouldSkipFitViewRef,
    handleAddNode,
    handleAddEdge,
    onNodesChange,
    onEdgesChange,
    onConnect,
    handleLabelChange
  } = useElkToReactflowGraphConverter();

  // Tool selection logic
  const { selectedTool, handleToolSelect } = useToolSelection({
    nodes,
    setNodes,
    setSelectedNodes: (nodes: Node[]) => {} // Will be connected below
  });

  // Node selection logic
  const { 
    selectedNodes, 
    selectedEdges, 
    setSelectedNodes, 
    setSelectedEdges, 
    onSelectionChange 
  } = useNodeSelection({
    selectedTool,
    setNodes
  });

  // Update tool selection hook with proper setSelectedNodes
  const toolSelection = useToolSelection({
    nodes,
    setNodes,
    setSelectedNodes
  });

  // Connector tool logic
  const {
    connectingFrom,
    connectingFromHandle,
    connectionMousePos,
    handleConnectorDotClick,
    handleConnectEnd
  } = useConnectorTool({
    selectedTool,
    reactFlowRef,
    onConnect,
    setSelectedNodes
  });

  // Canvas interaction logic
  const { onPaneClick } = useCanvasInteractions({
    selectedTool,
    reactFlowRef,
    handleAddNode,
    viewStateRef,
    handleToolSelect: toolSelection.handleToolSelect
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    selectedNodes,
    selectedEdges,
    rawGraph,
    setRawGraph
  });

  // Handle manual fit view with skip logic
  const manualFitView = useCallback(() => {
    if (shouldSkipFitViewRef.current) {
      console.log('⏭️ [InteractiveCanvas] Skipping fitView - user mutation in FREE mode');
      shouldSkipFitViewRef.current = false;
      return;
    }

    if (reactFlowRef.current && nodes.length > 0) {
      try {
        reactFlowRef.current.fitView({
          padding: 0.1,
          includeHiddenNodes: false,
          duration: 800
        });
      } catch (error) {
        console.warn('FitView failed:', error);
      }
    }
  }, [nodes, shouldSkipFitViewRef]);

  // Trigger fit view when layout changes
  useEffect(() => {
    if (layoutVersion > 0) {
      const timer = setTimeout(manualFitView, 100);
      return () => clearTimeout(timer);
    }
  }, [layoutVersion, manualFitView]);

  // Create node types with proper handlers
  const memoizedNodeTypes = useMemo(() => {
    const CustomNodeWrapper = (props: any) => (
      <CustomNodeComponent 
        {...props} 
        onLabelChange={handleLabelChange} 
        selectedTool={selectedTool}
        connectingFrom={connectingFrom}
        connectingFromHandle={connectingFromHandle}
        onConnectorDotClick={handleConnectorDotClick}
      />
    );
    
    const GroupNodeWrapper = (props: any) => (
      <GroupNode {...props} onAddNode={() => {}} />
    );
    
    return {
      custom: CustomNodeWrapper,
      group: GroupNodeWrapper
    };
  }, [handleLabelChange, selectedTool, connectingFrom, connectingFromHandle, handleConnectorDotClick]);

  return (
    <div className="flex h-full bg-gray-50 relative">
      
      {/* Main Canvas Area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        
        {/* Canvas Toolbar */}
        <CanvasToolbarContainer 
          selectedTool={selectedTool}
          onToolSelect={toolSelection.handleToolSelect}
        />
        
        {/* Node Hover Preview */}
        <NodeHoverPreview 
          reactFlowRef={reactFlowRef} 
          visible={selectedTool === 'box'} 
        />
        
        {/* ReactFlow Canvas */}
        <ReactFlow
          ref={reactFlowRef}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          onPaneClick={onPaneClick}
          nodeTypes={memoizedNodeTypes}
          edgeTypes={edgeTypes}
          elementsSelectable={selectedTool !== 'box' && selectedTool !== 'connector'}
          nodesDraggable={true}
          nodesConnectable={false}
          selectNodesOnDrag={selectedTool === 'select'}
          elevateEdgesOnSelect={false}
          elevateNodesOnSelect={true}
          defaultEdgeOptions={{
            type: 'step',
            style: { strokeWidth: 2, stroke: '#64748b' },
            zIndex: CANVAS_STYLES.zIndex.edges
          }}
        >
          <Background 
            variant={BackgroundVariant.Dots} 
            gap={16} 
            size={1} 
            color="#e5e7eb" 
          />
          <Controls />
        </ReactFlow>

        {/* Connection preview line for connector tool */}
        {connectingFrom && connectionMousePos && (
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          >
            <defs>
              <marker
                id="arrowhead-preview"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
              </marker>
            </defs>
            {/* Preview line will be rendered here based on connection state */}
          </svg>
        )}
        
      </div>
    </div>
  );
};

export default InteractiveCanvasRefactored;
