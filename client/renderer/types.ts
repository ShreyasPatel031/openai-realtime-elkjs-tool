/**
 * Renderer types for ReactFlow conversion
 * Part of Agent B Inter Plan - B1
 */

export interface NodeDimensions {
  width: number;
  height: number;
  groupWidth: number;
  groupHeight: number;
  padding: number;
}

export interface ReactFlowAdapterOptions {
  /**
   * If true, throw in dev mode when ViewState geometry is missing
   * @default true
   */
  strictGeometry?: boolean;
}





