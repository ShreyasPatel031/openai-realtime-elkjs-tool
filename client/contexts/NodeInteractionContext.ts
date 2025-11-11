import { createContext, useContext } from "react"
import type { Tool } from "../hooks/useToolSelection"

export interface NodeInteractionContextValue {
  selectedTool: Tool
  connectingFrom: string | null
  connectingFromHandle: string | null
  handleConnectorDotClick: (nodeId: string, handleId: string) => void
  handleLabelChange: (id: string, label: string) => void
  handleAddNodeToGroup: (groupId: string) => void
}

export const NodeInteractionContext = createContext<NodeInteractionContextValue | null>(null)

export const useNodeInteractions = (): NodeInteractionContextValue | null => {
  return useContext(NodeInteractionContext)
}

