/**
 * CanvasRenderer - Pure ViewState → HTML5 Canvas conversion
 * 
 * Demonstrates clean separation of Domain → ViewState → Rendering:
 * 1. Domain provides structure only (node IDs, relationships, hierarchy)  
 * 2. ViewState provides geometry only (positions, sizes, waypoints)
 * 3. Renderer reads same inputs as ReactFlow renderer but outputs to HTML5 Canvas
 * 
 * This proves the architecture works - you can swap rendering libraries
 * without changing Domain or ViewState logic.
 */

import type { RawGraph } from '../../components/graph/types/index';
import type { ViewState } from '../viewstate/ViewState';
import { CoordinateService } from '../viewstate/CoordinateService';

export interface CanvasElement {
  id: string;
  type: 'node' | 'group' | 'edge';
  geometry: {
    x: number;
    y: number;
    w?: number;
    h?: number;
  };
  style: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    fontSize?: number;
  };
  data: {
    label: string;
    isGroup?: boolean;
    parentId?: string;
  };
}

export interface CanvasScene {
  elements: CanvasElement[];
  bounds: { width: number; height: number };
}

/**
 * Pure renderer: ViewState → Canvas Scene
 * 
 * Contract (same as ReactFlow renderer):
 * - Reads structure from Domain (node IDs, hierarchy, relationships)
 * - Reads geometry EXCLUSIVELY from ViewState (positions, sizes, waypoints)
 * - Never reads geometry from Domain
 * - Never writes to ViewState
 * 
 * @param domainGraph - Structure only (node IDs, relationships, hierarchy)
 * @param viewState - Geometry only (positions, sizes, waypoints)
 * @returns Canvas scene elements for rendering
 */
export function renderViewStateToCanvas(
  domainGraph: RawGraph,
  viewState: ViewState
): CanvasScene {
  const elements: CanvasElement[] = [];
  let bounds = { width: 800, height: 600 };

  /**
   * Pure renderer: converts domain structure + ViewState geometry → Canvas element
   * 
   * SAME SEPARATION AS REACTFLOW RENDERER:
   * - Domain provides: node ID, type (group/node), hierarchy (parentId), labels
   * - ViewState provides: ALL geometry (position, width, height)
   * - Renderer creates: Canvas element for drawing
   */
  const processNode = (
    domainNode: any,
    parentId?: string
  ) => {
    const nodeId = domainNode.id;
    
    // DETECT GROUP FROM DOMAIN (same logic as ReactFlow renderer)
    const isGroupNode = 
      domainNode.data?.isGroup === true || 
      Array.isArray(domainNode.children) ||
      Array.isArray(domainNode.edges);

    // READ GEOMETRY FROM VIEWSTATE ONLY (same as ReactFlow renderer)
    const geometry = isGroupNode
      ? viewState.group?.[nodeId]
      : viewState.node?.[nodeId];

    if (!geometry) {
      console.warn('[CanvasRenderer] Missing ViewState geometry:', {
        nodeId,
        isGroup: isGroupNode,
        note: 'Same contract as ReactFlow renderer - geometry must come from ViewState'
      });
    }

    // Get ALL geometry from ViewState (same as ReactFlow renderer)
    const position = geometry
      ? { x: geometry.x, y: geometry.y }
      : { x: 0, y: 0 };

    const width = geometry?.w ?? (isGroupNode ? 480 : 96);
    const height = geometry?.h ?? (isGroupNode ? 320 : 96);

    // Update bounds to fit all elements
    bounds.width = Math.max(bounds.width, position.x + width + 50);
    bounds.height = Math.max(bounds.height, position.y + height + 50);

    // CREATE CANVAS ELEMENT (different output, same inputs as ReactFlow)
    const element: CanvasElement = {
      id: nodeId, // From Domain (structure)
      type: isGroupNode ? 'group' : 'node', // From Domain (structure) 
      geometry: { // From ViewState (geometry)
        x: position.x,
        y: position.y,
        w: width,
        h: height,
      },
      style: isGroupNode ? {
        fill: 'transparent',
        stroke: '#D4D4DB',
        strokeWidth: 1,
        fontSize: 14,
      } : {
        fill: '#FFFFFF',
        stroke: '#E5E7EB',
        strokeWidth: 1,
        fontSize: 12,
      },
      data: {
        label: domainNode.labels?.[0]?.text || domainNode.id, // From Domain
        isGroup: isGroupNode, // From Domain
        parentId, // From Domain (hierarchy)
      },
    };

    elements.push(element);

    // Process children recursively (structure from Domain)
    if (domainNode.children && domainNode.children.length > 0) {
      domainNode.children.forEach((childNode: any) => {
        processNode(childNode, nodeId);
      });
    }
  };

  // Process root's children (same as ReactFlow renderer)
  if (domainGraph.children) {
    domainGraph.children.forEach((domainNode: any) => {
      processNode(domainNode);
    });
  }

  // Process edges (same inputs as ReactFlow renderer)
  if (domainGraph.edges && domainGraph.edges.length > 0) {
    domainGraph.edges.forEach((edge: any) => {
      const edgeId = edge.id || `${edge.sources[0]}-${edge.targets[0]}`;
      const edgeGeometry = viewState.edge?.[edgeId]; // From ViewState

      // Find source and target positions from processed elements
      const sourceElement = elements.find(el => el.id === edge.sources[0]);
      const targetElement = elements.find(el => el.id === edge.targets[0]);

      if (sourceElement && targetElement) {
        const element: CanvasElement = {
          id: edgeId,
          type: 'edge',
          geometry: {
            x: sourceElement.geometry.x + (sourceElement.geometry.w || 0) / 2,
            y: sourceElement.geometry.y + (sourceElement.geometry.h || 0) / 2,
            w: targetElement.geometry.x + (targetElement.geometry.w || 0) / 2,
            h: targetElement.geometry.y + (targetElement.geometry.h || 0) / 2,
          },
          style: {
            stroke: '#9CA3AF',
            strokeWidth: 2,
          },
          data: {
            label: edge.data?.label || '',
            // Waypoints from ViewState (geometry)
            waypoints: edgeGeometry?.waypoints || [],
          } as any,
        };

        elements.push(element);
      }
    });
  }

  return { elements, bounds };
}

/**
 * Render Canvas Scene to HTML5 Canvas
 * 
 * This demonstrates the full pipeline:
 * Domain → ViewState → Canvas Scene → HTML5 Canvas
 */
export function renderCanvasSceneToDOM(
  scene: CanvasScene,
  canvas: HTMLCanvasElement
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas size
  canvas.width = scene.bounds.width;
  canvas.height = scene.bounds.height;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Render elements
  scene.elements.forEach(element => {
    ctx.save();

    if (element.type === 'node' || element.type === 'group') {
      // Draw rectangle
      ctx.fillStyle = element.style.fill || '#FFFFFF';
      ctx.strokeStyle = element.style.stroke || '#E5E7EB';
      ctx.lineWidth = element.style.strokeWidth || 1;

      const { x, y, w, h } = element.geometry;
      ctx.fillRect(x, y, w || 96, h || 96);
      ctx.strokeRect(x, y, w || 96, h || 96);

      // Draw label
      ctx.fillStyle = '#374151';
      ctx.font = `${element.style.fontSize || 12}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const centerX = x + (w || 96) / 2;
      const centerY = y + (h || 96) / 2;
      ctx.fillText(element.data.label, centerX, centerY);

    } else if (element.type === 'edge') {
      // Draw line
      ctx.strokeStyle = element.style.stroke || '#9CA3AF';
      ctx.lineWidth = element.style.strokeWidth || 2;
      
      ctx.beginPath();
      ctx.moveTo(element.geometry.x, element.geometry.y);
      
      // Use waypoints if available
      const waypoints = (element.data as any).waypoints || [];
      if (waypoints.length > 0) {
        waypoints.forEach((point: { x: number; y: number }) => {
          ctx.lineTo(point.x, point.y);
        });
      }
      
      ctx.lineTo(element.geometry.w || 0, element.geometry.h || 0);
      ctx.stroke();
    }

    ctx.restore();
  });
}

/**
 * Complete rendering pipeline example:
 * Domain + ViewState → Canvas Scene → HTML5 Canvas
 * 
 * This shows how to replace ReactFlow completely while keeping
 * the same Domain/ViewState inputs.
 */
export function renderDomainToHTMLCanvas(
  domainGraph: RawGraph,
  viewState: ViewState,
  canvas: HTMLCanvasElement
): void {
  // Step 1: Domain + ViewState → Canvas Scene (same inputs as ReactFlow)
  const scene = renderViewStateToCanvas(domainGraph, viewState);
  
  // Step 2: Canvas Scene → HTML5 Canvas (different output than ReactFlow)
  renderCanvasSceneToDOM(scene, canvas);
}
