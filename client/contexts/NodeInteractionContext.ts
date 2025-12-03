import { createContext, useContext } from "react"
import type { Tool } from "../hooks/useToolSelection"

export interface NodeInteractionContextValue {
  selectedTool: Tool
  connectingFrom: string | null
  connectingFromHandle: string | null
  handleConnectorDotClick: (nodeId: string, handleId: string) => void
  handleLabelChange: (id: string, label: string) => void
  handleAddNodeToGroup: (groupId: string) => void
  handleArrangeGroup?: (groupId: string) => void
  handleCreateWrapperAndArrange?: (selectionIds: string[]) => void
  handleGroupResize?: (groupId: string, width: number, height: number, x: number, y: number) => void
  selectedNodeIds: string[]
}

export const NodeInteractionContext = createContext<NodeInteractionContextValue | null>(null)

export const useNodeInteractions = (): NodeInteractionContextValue | null => {
  return useContext(NodeInteractionContext)
}

