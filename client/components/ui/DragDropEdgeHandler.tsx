"use client"

import React, { useCallback, useRef, useState, useEffect } from "react"
import { Handle, Position, useReactFlow, Node } from "reactflow"
import { batchUpdate } from "../graph/mutations"

interface DragDropEdgeHandlerProps {
  children: React.ReactNode
  nodeId: string
  isSelected: boolean
  onGraphChange: (newGraph: any) => void
  rawGraph: any
}

interface DragState {
  nodeId: string
  handleId?: string
  position: Position
}

/**
 * Enhanced node wrapper that adds drag-to-connect functionality
 * Displays four directional arrows when node is selected
 * Provides hover highlighting and edge creation
 */
export const DragDropEdgeHandler: React.FC<DragDropEdgeHandlerProps> = ({
  children,
  nodeId,
  isSelected,
  onGraphChange,
  rawGraph
}) => {
  // Note: Connection handling is managed by the parent InteractiveCanvas
  // This component only provides the visual arrow handles

  return (
    <div style={{ position: "relative" }}>
      {children}
      
      {/* Directional arrow handles - only show when selected */}
      {isSelected && (
        <>
          {/* Top Arrow */}
          <Handle 
            type="source" 
            position={Position.Top} 
            id={`${nodeId}-top`}
            style={{
              position: "absolute",
              top: -32,
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
              border: "2px solid #d1d5db",
              boxShadow: "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)",
              backdropFilter: "blur(10px)",
              cursor: "grab",
              zIndex: "99999 !important",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease-in-out",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = e.currentTarget.style.transform.replace(')', ' scale(1.1))');
              e.currentTarget.style.boxShadow = "0 12px 35px rgba(0,0,0,0.2), 0 6px 15px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = e.currentTarget.style.transform.replace(' scale(1.1)', '');
              e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)";
            }}
          />
          <div 
            style={{
              position: "absolute",
              top: -32,
              left: "50%",
              transform: "translate(-50%, -50%) rotate(-90deg)",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              color: "#374151",
              fontWeight: "bold",
              textShadow: "0 1px 2px rgba(0,0,0,0.1)",
              pointerEvents: "none",
              zIndex: "100000 !important"
            }}
          >
            ➜
          </div>

          {/* Right Arrow */}
          <Handle 
            type="source" 
            position={Position.Right} 
            id={`${nodeId}-right`}
            style={{
              position: "absolute",
              right: -32,
              top: "50%",
              transform: "translate(50%, -50%)",
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
              border: "2px solid #d1d5db",
              boxShadow: "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)",
              backdropFilter: "blur(10px)",
              cursor: "grab",
              zIndex: "99999 !important",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease-in-out",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = e.currentTarget.style.transform.replace(')', ' scale(1.1))');
              e.currentTarget.style.boxShadow = "0 12px 35px rgba(0,0,0,0.2), 0 6px 15px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = e.currentTarget.style.transform.replace(' scale(1.1)', '');
              e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)";
            }}
          />
          <div 
            style={{
              position: "absolute",
              right: -32,
              top: "50%",
              transform: "translate(50%, -50%) rotate(0deg)",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              color: "#374151",
              fontWeight: "bold",
              textShadow: "0 1px 2px rgba(0,0,0,0.1)",
              pointerEvents: "none",
              zIndex: "100000 !important"
            }}
          >
            ➜
          </div>

          {/* Bottom Arrow */}
          <Handle 
            type="source" 
            position={Position.Bottom} 
            id={`${nodeId}-bottom`}
            style={{
              position: "absolute",
              bottom: -32,
              left: "50%",
              transform: "translate(-50%, 50%)",
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
              border: "2px solid #d1d5db",
              boxShadow: "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)",
              backdropFilter: "blur(10px)",
              cursor: "grab",
              zIndex: "99999 !important",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease-in-out",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = e.currentTarget.style.transform.replace(')', ' scale(1.1))');
              e.currentTarget.style.boxShadow = "0 12px 35px rgba(0,0,0,0.2), 0 6px 15px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = e.currentTarget.style.transform.replace(' scale(1.1)', '');
              e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)";
            }}
          />
          <div 
            style={{
              position: "absolute",
              bottom: -32,
              left: "50%",
              transform: "translate(-50%, 50%) rotate(90deg)",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              color: "#374151",
              fontWeight: "bold",
              textShadow: "0 1px 2px rgba(0,0,0,0.1)",
              pointerEvents: "none",
              zIndex: "100000 !important"
            }}
          >
            ➜
          </div>

          {/* Left Arrow */}
          <Handle 
            type="source" 
            position={Position.Left} 
            id={`${nodeId}-left`}
            style={{
              position: "absolute",
              left: -32,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
              border: "2px solid #d1d5db",
              boxShadow: "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)",
              backdropFilter: "blur(10px)",
              cursor: "grab",
              zIndex: "99999 !important",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease-in-out",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = e.currentTarget.style.transform.replace(')', ' scale(1.1))');
              e.currentTarget.style.boxShadow = "0 12px 35px rgba(0,0,0,0.2), 0 6px 15px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = e.currentTarget.style.transform.replace(' scale(1.1)', '');
              e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)";
            }}
          />
          <div 
            style={{
              position: "absolute",
              left: -32,
              top: "50%",
              transform: "translate(-50%, -50%) rotate(180deg)",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              color: "#374151",
              fontWeight: "bold",
              textShadow: "0 1px 2px rgba(0,0,0,0.1)",
              pointerEvents: "none",
              zIndex: "100000 !important"
            }}
          >
            ➜
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Hook to provide hover highlighting functionality
 * Use this in your custom node components to respond to hover events
 */
export const useNodeHoverHighlight = (nodeId: string) => {
  const [isHoverTarget, setIsHoverTarget] = useState(false)

  useEffect(() => {
    const handleHoverChange = (event: CustomEvent) => {
      const { hoverId } = event.detail
      setIsHoverTarget(hoverId === nodeId)
    }

    window.addEventListener('nodeHoverChange', handleHoverChange as EventListener)
    
    return () => {
      window.removeEventListener('nodeHoverChange', handleHoverChange as EventListener)
    }
  }, [nodeId])

  return isHoverTarget
}

export default DragDropEdgeHandler