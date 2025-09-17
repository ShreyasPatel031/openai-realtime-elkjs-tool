"use client"

import React from "react"
import { Handle, Position } from "reactflow"

type Corner = "top-left" | "top-right" | "bottom-right" | "bottom-left"

interface DragDropEdgeHandlerProps {
  children: React.ReactNode
  nodeId: string
  isSelected: boolean
  onGraphChange: (newGraph: any) => void
  rawGraph: any
  nodeWidth?: number
  nodeHeight?: number
}

const CIRCLE = 32        // px, diameter
const OFFSET = 16        // how far outside the node we sit (radius)

const cornerStyle = (corner: Corner, nodeWidth: number, nodeHeight: number) => {
  // anchor the circle's CENTER exactly at the node's corner
  // then push it out by OFFSET and center with translate(±50%, ±50%)
  switch (corner) {
    case "top-left":
      return { top: -OFFSET, left: -OFFSET, transform: "translate(-50%, -50%)" }
    case "top-right":
      return { top: -OFFSET, left: nodeWidth + OFFSET, transform: "translate(-50%, -50%)" }
    case "bottom-right":
      return { top: nodeHeight + OFFSET, left: nodeWidth + OFFSET, transform: "translate(-50%, -50%)" }
    case "bottom-left":
      return { top: nodeHeight + OFFSET, left: -OFFSET, transform: "translate(-50%, -50%)" }
  }
}

const cornerArrowRotate = (corner: Corner) => {
  // rotate the ➜ so it points outward from the node, but keep the same center
  switch (corner) {
    case "top-left":
      return "rotate(-135deg)"
    case "top-right":
      return "rotate(-45deg)"
    case "bottom-right":
      return "rotate(45deg)"
    case "bottom-left":
      return "rotate(135deg)"
  }
}

// Map each visual corner to a Handle side. This is just a semantic choice;
// we keep the DOM position 100% controlled by our own absolute styles.
const cornerHandleSide: Record<Corner, Position> = {
  "top-left": Position.Top,
  "top-right": Position.Right,
  "bottom-right": Position.Bottom,
  "bottom-left": Position.Left,
}

export const DragDropEdgeHandler: React.FC<DragDropEdgeHandlerProps> = ({
  children,
  nodeId,
  isSelected,
  nodeWidth = 100,
  nodeHeight = 100,
}) => {
  const renderCorner = (corner: Corner) => {
    const base = cornerStyle(corner, nodeWidth, nodeHeight)
    const rotate = cornerArrowRotate(corner)
    const handleSide = cornerHandleSide[corner]

    const commonCircleStyle: React.CSSProperties = {
      position: "absolute",
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: "50%",
      background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
      border: "2px solid #d1d5db",
      boxShadow: "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)",
      backdropFilter: "blur(10px)",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
      pointerEvents: "all",
      zIndex: 99999999,
      ...base,
    }

    const arrowStyle: React.CSSProperties = {
      position: "absolute",
      width: CIRCLE,
      height: CIRCLE,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 20,
      color: "#6b7280",
      fontWeight: 900,
      textShadow: "0 1px 2px rgba(255,255,255,0.9)",
      pointerEvents: "none",
      zIndex: 99999999,
      background: "rgba(255,255,255,0.9)",
      borderRadius: "50%",
      transform: `${base.transform} ${rotate}`,
      top: base.top,
      left: base.left,
    }

    return (
      <React.Fragment key={corner}>
        <Handle
          type="source"
          position={handleSide}
          id={`${nodeId}-${corner}`}
          isConnectable
          style={commonCircleStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = commonCircleStyle.transform! + " scale(1.1)"
            e.currentTarget.style.boxShadow = "0 12px 35px rgba(0,0,0,0.2), 0 6px 15px rgba(0,0,0,0.15)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = commonCircleStyle.transform as string
            e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.1)"
          }}
        />
        <div style={arrowStyle}>➜</div>
      </React.Fragment>
    )
  }

  return (
    <div style={{ position: "relative" }}>
      {children}

      {isSelected && (
        <div
          className="arrow-handles-container"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none", // only the circles/handles get events
            zIndex: 9999999,
          }}
        >
          {["top-left", "top-right", "bottom-right", "bottom-left"].map((c) =>
            renderCorner(c as Corner)
          )}
        </div>
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