/**
 * ViewStateRenderer - Pure ViewState → SVG conversion
 * 
 * Example of clean Domain → ViewState → Rendering separation.
 * Same inputs as ReactFlow and Canvas renderers, different output format.
 * 
 * Demonstrates you can have multiple ViewState-based renderers:
 * - ReactFlowRenderer: ViewState → ReactFlow components
 * - CanvasRenderer: ViewState → HTML5 Canvas  
 * - ViewStateRenderer: ViewState → SVG elements
 * - WebGLRenderer: ViewState → WebGL scenes
 */

import type { RawGraph } from '../../components/graph/types/index';
import type { ViewState } from '../viewstate/ViewState';

export interface SVGElement {
  tag: 'rect' | 'text' | 'line' | 'path';
  attributes: Record<string, string | number>;
  textContent?: string;
  children?: SVGElement[];
}

export interface SVGScene {
  elements: SVGElement[];
  viewBox: { x: number; y: number; width: number; height: number };
}

/**
 * Pure renderer: ViewState → SVG Scene
 * 
 * Contract (IDENTICAL to ReactFlow and Canvas renderers):
 * - Reads structure from Domain (node IDs, hierarchy, relationships)
 * - Reads geometry EXCLUSIVELY from ViewState (positions, sizes, waypoints)
 * - Never reads geometry from Domain
 * - Never writes to ViewState
 * 
 * @param domainGraph - Structure only (node IDs, relationships, hierarchy)
 * @param viewState - Geometry only (positions, sizes, waypoints)
 * @returns SVG scene elements
 */
export function renderViewStateToSVG(
  domainGraph: RawGraph,
  viewState: ViewState
): SVGScene {
  const elements: SVGElement[] = [];
  let viewBox = { x: 0, y: 0, width: 800, height: 600 };

  /**
   * SAME SEPARATION AS OTHER RENDERERS:
   * - Domain provides: node ID, type, hierarchy, labels
   * - ViewState provides: ALL geometry  
   * - Renderer creates: SVG elements
   */
  const processNode = (
    domainNode: any,
    parentId?: string
  ) => {
    const nodeId = domainNode.id;
    
    // SAME GROUP DETECTION as other renderers
    const isGroupNode = 
      domainNode.data?.isGroup === true || 
      Array.isArray(domainNode.children) ||
      Array.isArray(domainNode.edges);

    // SAME VIEWSTATE READING as other renderers
    const geometry = isGroupNode
      ? viewState.group?.[nodeId]
      : viewState.node?.[nodeId];

    if (!geometry) {
      console.warn('[ViewStateRenderer] Missing ViewState geometry (same contract as other renderers):', {
        nodeId,
        isGroup: isGroupNode,
      });
    }

    const position = geometry ? { x: geometry.x, y: geometry.y } : { x: 0, y: 0 };
    const width = geometry?.w ?? (isGroupNode ? 480 : 96);
    const height = geometry?.h ?? (isGroupNode ? 320 : 96);

    // Update viewBox
    viewBox.width = Math.max(viewBox.width, position.x + width + 50);
    viewBox.height = Math.max(viewBox.height, position.y + height + 50);

    // CREATE SVG ELEMENTS (different output, same inputs)
    const rect: SVGElement = {
      tag: 'rect',
      attributes: {
        id: `rect-${nodeId}`,
        x: position.x,
        y: position.y,
        width,
        height,
        fill: isGroupNode ? 'transparent' : '#ffffff',
        stroke: isGroupNode ? '#D4D4DB' : '#E5E7EB',
        'stroke-width': 1,
        rx: 4, // Rounded corners
      },
    };

    const text: SVGElement = {
      tag: 'text',
      attributes: {
        id: `text-${nodeId}`,
        x: position.x + width / 2,
        y: position.y + height / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'Inter, system-ui, sans-serif',
        'font-size': isGroupNode ? 14 : 12,
        fill: '#374151',
      },
      textContent: domainNode.labels?.[0]?.text || domainNode.id, // From Domain
    };

    elements.push(rect, text);

    // SAME RECURSIVE PROCESSING as other renderers
    if (domainNode.children && domainNode.children.length > 0) {
      domainNode.children.forEach((childNode: any) => {
        processNode(childNode, nodeId);
      });
    }
  };

  // SAME ROOT PROCESSING as other renderers
  if (domainGraph.children) {
    domainGraph.children.forEach((domainNode: any) => {
      processNode(domainNode);
    });
  }

  // SAME EDGE PROCESSING as other renderers
  if (domainGraph.edges && domainGraph.edges.length > 0) {
    domainGraph.edges.forEach((edge: any) => {
      const edgeId = edge.id || `${edge.sources[0]}-${edge.targets[0]}`;
      const edgeGeometry = viewState.edge?.[edgeId]; // From ViewState

      // Find source and target elements
      const sourceRect = elements.find(el => el.attributes.id === `rect-${edge.sources[0]}`);
      const targetRect = elements.find(el => el.attributes.id === `rect-${edge.targets[0]}`);

      if (sourceRect && targetRect) {
        const sx = Number(sourceRect.attributes.x) + Number(sourceRect.attributes.width) / 2;
        const sy = Number(sourceRect.attributes.y) + Number(sourceRect.attributes.height) / 2;
        const tx = Number(targetRect.attributes.x) + Number(targetRect.attributes.width) / 2;
        const ty = Number(targetRect.attributes.y) + Number(targetRect.attributes.height) / 2;

        let pathData = `M ${sx} ${sy}`;

        // Use waypoints from ViewState if available
        const waypoints = edgeGeometry?.waypoints || [];
        if (waypoints.length > 0) {
          waypoints.forEach(point => {
            pathData += ` L ${point.x} ${point.y}`;
          });
        }
        pathData += ` L ${tx} ${ty}`;

        const path: SVGElement = {
          tag: 'path',
          attributes: {
            id: `edge-${edgeId}`,
            d: pathData,
            stroke: '#9CA3AF',
            'stroke-width': 2,
            fill: 'none',
          },
        };

        elements.push(path);
      }
    });
  }

  return { elements, viewBox };
}

/**
 * Render SVG Scene to DOM SVG Element
 */
export function renderSVGSceneToDOM(
  scene: SVGScene,
  svgElement: SVGElement
): void {
  // Set viewBox
  svgElement.attributes.viewBox = `${scene.viewBox.x} ${scene.viewBox.y} ${scene.viewBox.width} ${scene.viewBox.height}`;
  
  // Add all elements as children
  svgElement.children = scene.elements;
}

/**
 * Generate SVG string from scene
 */
export function renderSVGSceneToString(scene: SVGScene): string {
  const createElement = (element: SVGElement): string => {
    const attrs = Object.entries(element.attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');
    
    if (element.tag === 'text' && element.textContent) {
      return `<${element.tag} ${attrs}>${element.textContent}</${element.tag}>`;
    }
    
    if (element.children && element.children.length > 0) {
      const childrenStr = element.children.map(createElement).join('\n  ');
      return `<${element.tag} ${attrs}>\n  ${childrenStr}\n</${element.tag}>`;
    }
    
    return `<${element.tag} ${attrs} />`;
  };

  const elementsStr = scene.elements.map(createElement).join('\n');
  const { x, y, width, height } = scene.viewBox;
  
  return `<svg viewBox="${x} ${y} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
${elementsStr}
</svg>`;
}

/**
 * Complete rendering pipeline:
 * Domain + ViewState → SVG Scene → SVG String
 */
export function renderDomainToSVGString(
  domainGraph: RawGraph,
  viewState: ViewState
): string {
  const scene = renderViewStateToSVG(domainGraph, viewState);
  return renderSVGSceneToString(scene);
}
