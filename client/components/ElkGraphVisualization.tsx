"use client";
import React, { useState, useEffect } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import { ElkGraph } from '../types/graph';
import DevPanel from './DevPanel';

// Add default options constants from ElkRender
const ROOT_DEFAULT_OPTIONS = {
  layoutOptions: {
    "algorithm": "layered",
    "elk.direction": "RIGHT",
    "hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.considerModelOrder": true,
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.nodePlacement.favorStraightEdges": true,
    "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
    "elk.interactive": true,
    "elk.interactiveLayout": true,
    "elk.layered.priority.direction": 0,
    "org.eclipse.elk.debugMode": true,
    "elk.layered.crossingMinimization.forceNodeModelOrder": true,
    "elk.layered.priority.shortness": 100,  
    "spacing.edgeNode": 30,
    "spacing.nodeNode": 30,
    "spacing.edgeEdge": 30,
    "spacing.nodeNodeBetweenLayers": 40,
    "spacing.edgeNodeBetweenLayers": 40,
    "spacing.edgeEdgeBetweenLayers": 30,
  }
};

const NON_ROOT_DEFAULT_OPTIONS = {
  width: 120,
  height: 60,
  layoutOptions: {
    "nodeLabels.placement": "INSIDE V_TOP H_LEFT",
    "elk.padding": "[top=30.0,left=30.0,bottom=30.0,right=30.0]",
    "elk.layered.nodePlacement.favorStraightEdges": true,
    "elk.layered.priority.shortness": 100, 
    "spacing.edgeNode": 30,
    "spacing.nodeNode": 30,
    "spacing.edgeEdge": 30,
    "spacing.nodeNodeBetweenLayers": 40,
    "spacing.edgeNodeBetweenLayers": 40,
    "spacing.edgeEdgeBetweenLayers": 30,
  }
};

/**
 * Flatten child coordinates by adding parent offsets so that
 * nested child nodes become absolute. Also shifts edges accordingly.
 */
function flattenGraph(
  node: any,
  parentX: number,
  parentY: number,
  accum: { nodes: any[]; edges: any[] }
) {
  const absX = (node.x ?? 0) + parentX;
  const absY = (node.y ?? 0) + parentY;

  // Shallow copy w/ absolute coords
  const newNode = { ...node, x: absX, y: absY };
  accum.nodes.push(newNode);

  if (Array.isArray(node.edges)) {
    for (const edge of node.edges) {
      const newEdge = {
        ...edge,
        sections: (edge.sections || []).map((section: any) => {
          const start = {
            x: section.startPoint.x + absX,
            y: section.startPoint.y + absY,
          };
          const end = {
            x: section.endPoint.x + absX,
            y: section.endPoint.y + absY,
          };
          const bendPoints = (section.bendPoints || []).map((bp: any) => ({
            x: bp.x + absX,
            y: bp.y + absY,
          }));
          return { ...section, startPoint: start, endPoint: end, bendPoints };
        }),
      };
      accum.edges.push(newEdge);
    }
  }

  // Recurse
  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => {
      flattenGraph(child, absX, absY, accum);
    });
  }
}

// Apply default options
function ensureIds(node: any, parentId: string = '') {
  if (!node) return node;
  
  // Apply defaults directly to the node
  if (!parentId) {
    // Root node
    Object.assign(node, {
      ...ROOT_DEFAULT_OPTIONS,
      layoutOptions: {
        ...ROOT_DEFAULT_OPTIONS.layoutOptions,
        ...(node.layoutOptions || {})
      }
    });
  } else {
    // Non-root node - ensure width and height are set
    node.width = node.width || NON_ROOT_DEFAULT_OPTIONS.width;
    node.height = node.height || NON_ROOT_DEFAULT_OPTIONS.height;
    node.layoutOptions = {
      ...NON_ROOT_DEFAULT_OPTIONS.layoutOptions,
      ...(node.layoutOptions || {})
    };
  }

  if (!node.id) {
    node.id = `${parentId}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Update children recursively
  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => ensureIds(child, node.id));
  }

  return node;
}

interface ElkGraphVisualizationProps {
  initialGraph: ElkGraph;
}

export default function ElkGraphVisualization({ initialGraph }: ElkGraphVisualizationProps) {
  const [graph, setGraph] = useState<ElkGraph>(initialGraph);
  const [graphLayout, setGraphLayout] = useState<any>(null);
  const elk = new ELK();

  // Layout the graph whenever it changes
  useEffect(() => {
    async function layoutGraph() {
      try {
        // Create a deep copy of the graph to avoid modifying the original
        const graphCopy = JSON.parse(JSON.stringify(graph));
        
        // Apply defaults through ensureIds
        const graphWithOptions = ensureIds(graphCopy);

        console.log('ElkGraphVisualization: Laying out graph with options:', graphWithOptions);
        
        const layoutResult = await elk.layout(graphWithOptions);
        console.log('ElkGraphVisualization: Layout result:', layoutResult);
        setGraphLayout(layoutResult);
      } catch (err) {
        console.error("ElkGraphVisualization: Error laying out graph:", err);
      }
    }
    
    layoutGraph();
  }, [graph]);

  const handleGraphChange = (updatedGraph: ElkGraph) => {
    setGraph(updatedGraph);
  };

  /**
   * Render the final ELK graph in an <svg> by flattening node coords.
   */
  function renderGraphSvg() {
    if (!graphLayout) return null;

    const accum = { nodes: [] as any[], edges: [] as any[] };
    flattenGraph(graphLayout, 0, 0, accum);

    const { nodes, edges } = accum;

    // bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const node of nodes) {
      const x2 = node.x + (node.width ?? 120);
      const y2 = node.y + (node.height ?? 60);
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (x2 > maxX) maxX = x2;
      if (y2 > maxY) maxY = y2;
    }

    const padding = 20;
    const svgWidth = maxX - minX + padding * 2;
    const svgHeight = maxY - minY + padding * 2;

    const shiftX = (x: number) => x - minX + padding;
    const shiftY = (y: number) => y - minY + padding;

    // Decide fill color based on whether node has "children" property
    function getNodeStyle(n: any) {
      const isContainer = Array.isArray(n.children) && n.children.length > 0;
      return {
        fill: isContainer ? "#f0f4f8" : "#d0e3ff",
        stroke: "#2d6bc4",
        strokeWidth: 2,
        rx: 5,
        ry: 5
      };
    }

    // Draw nodes first
    const nodeElements = nodes.map((n) => (
      <g key={n.id}>
        <rect
          x={shiftX(n.x)}
          y={shiftY(n.y)}
          width={n.width ?? 120}
          height={n.height ?? 60}
          style={getNodeStyle(n)}
        />
        {(n.data?.label || (n.labels && n.labels[0]?.text) || (n.id !== 'root' && n.id)) && (
          <text
            x={shiftX(n.x) + (n.width ?? 120) / 2}
            y={shiftY(n.y) + (n.height ?? 60) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="14"
            fontWeight="bold"
            fill="#2d6bc4"
          >
            {n.data?.label || (n.labels && n.labels[0]?.text) || (n.id === 'root' ? '' : n.id)}
          </text>
        )}
      </g>
    ));

    // Then edges with arrow markers
    const edgeElements = edges.flatMap((edge) => {
      return (edge.sections || []).map((sec: any, idx: number) => {
        const points = [
          sec.startPoint,
          ...(sec.bendPoints || []),
          sec.endPoint,
        ];
        const pointStr = points
          .map((p) => `${shiftX(p.x)},${shiftY(p.y)}`)
          .join(" ");
          
        // Calculate the direction for the arrow
        const lastPoint = points[points.length - 1];
        const secondLastPoint = points[points.length - 2] || points[0];
        const dx = lastPoint.x - secondLastPoint.x;
        const dy = lastPoint.y - secondLastPoint.y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          
        return (
          <g key={`${edge.id}-${idx}`}>
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2d6bc4" />
              </marker>
            </defs>
            <polyline
              fill="none"
              stroke="#2d6bc4"
              strokeWidth={2}
              points={pointStr}
              markerEnd="url(#arrow)"
            />
          </g>
        );
      });
    });

    return (
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ background: "white", border: "1px solid #ccc", borderRadius: "8px", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}
      >
        {nodeElements}
        {edgeElements}
      </svg>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 p-4">
      <div className="md:w-3/4 overflow-auto">
        <h2 className="text-xl font-bold mb-4">ElkGraph Visualization</h2>
        {graphLayout ? renderGraphSvg() : <p>Laying out graph...</p>}
      </div>
      <div className="md:w-1/4">
        <DevPanel elkGraph={graph} onGraphChange={handleGraphChange} />
      </div>
    </div>
  );
} 