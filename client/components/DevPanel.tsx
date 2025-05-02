import React, { useState, useRef } from 'react';
import { ElkGraph } from '../types/graph';
import ELK from "elkjs/lib/elk.bundled.js";
import { ensureIds } from './graph/utils/elk/ids';
import { ROOT_DEFAULT_OPTIONS, NON_ROOT_DEFAULT_OPTIONS } from './graph/elk/elkOptions';

interface DevPanelProps {
  elkGraph: ElkGraph;
  onGraphChange: (graph: ElkGraph) => void;
  onToggleVisMode?: (useReactFlow: boolean) => void;
  useReactFlow?: boolean;
  onSvgGenerated?: (svg: string) => void;
}

const DevPanel: React.FC<DevPanelProps> = ({ 
  elkGraph, 
  onGraphChange, 
  onToggleVisMode,
  useReactFlow = true,
  onSvgGenerated
}) => {
  const [nodeLabel, setNodeLabel] = useState('');
  const [parentId, setParentId] = useState('root');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [isGeneratingSvg, setIsGeneratingSvg] = useState(false);
  const svgRef = useRef<HTMLDivElement>(null);
  
  // Get all possible node IDs from the graph
  const nodeIds = React.useMemo(() => {
    const ids: string[] = ['root'];
    
    // Extract node IDs from all containers in the graph
    const extractIds = (container: any) => {
      if (container.children) {
        container.children.forEach((node: any) => {
          ids.push(node.id);
          if (node.children) {
            extractIds(node);
          }
        });
      }
    };
    
    extractIds(elkGraph);
    return ids;
  }, [elkGraph]);
  
  const handleAddNode = () => {
    if (!nodeLabel) return;
    
    const newNodeId = nodeLabel.toLowerCase().replace(/\s+/g, '_');
    
    // Create a deep copy of the graph
    const updatedGraph = JSON.parse(JSON.stringify(elkGraph));
    
    // Find the parent container
    let parentContainer = updatedGraph;
    if (parentId !== 'root') {
      const findContainer = (container: any): any => {
        if (container.id === parentId) return container;
        
        if (container.children) {
          for (const node of container.children) {
            const found = findContainer(node);
            if (found) return found;
          }
        }
        return null;
      };
      
      parentContainer = findContainer(updatedGraph) || updatedGraph;
    }
    
    // Add the new node to the parent container
    if (!parentContainer.children) parentContainer.children = [];
    parentContainer.children.push({
      id: newNodeId,
      labels: [{ text: nodeLabel }]
    });
    
    // Pass the updated graph back to the parent
    onGraphChange(updatedGraph);
    
    // Clear the form
    setNodeLabel('');
  };
  
  const handleAddEdge = () => {
    if (!sourceId || !targetId) return;
    
    const edgeId = `edge_${sourceId}_to_${targetId}`;
    
    // Create a deep copy of the graph
    const updatedGraph = JSON.parse(JSON.stringify(elkGraph));
    
    // Add the edge to the root level
    if (!updatedGraph.edges) updatedGraph.edges = [];
    updatedGraph.edges.push({
      id: edgeId,
      sources: [sourceId],
      targets: [targetId],
    });
    
    // Pass the updated graph back to the parent
    onGraphChange(updatedGraph);
    
    // Clear the form
    setSourceId('');
    setTargetId('');
  };

  // Function to generate SVG for debugging
  const handleGenerateSVG = async () => {
    try {
      setIsGeneratingSvg(true);
      
      // Create a deep copy of the graph
      const graphCopy = JSON.parse(JSON.stringify(elkGraph));
      
      // Apply defaults
      const graphWithOptions = ensureIds(graphCopy);
      
      // Use ELK to compute the layout
      const elk = new ELK();
      const layoutedGraph = await elk.layout(graphWithOptions);
      
      // Generate SVG
      const svgContent = generateSVG(layoutedGraph);
      
      // If we have the ref, update the innerHTML
      if (svgRef.current) {
        svgRef.current.innerHTML = svgContent;
      }
      
      // Send the SVG content back to the parent component
      if (onSvgGenerated) {
        onSvgGenerated(svgContent);
      }
      
      console.log('Debug SVG generated successfully');
    } catch (error) {
      console.error('Error generating SVG:', error);
    } finally {
      setIsGeneratingSvg(false);
    }
  };
  
  // Function to generate SVG string from layouted graph
  const generateSVG = (layoutedGraph: any): string => {
    // Collect all nodes and edges with absolute coordinates
    const collected = { nodes: [] as any[], edges: [] as any[] };
    flattenGraph(layoutedGraph, 0, 0, collected);
    
    const { nodes, edges } = collected;
    
    // Calculate bounding box
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
    
    // Start building SVG
    let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;
    
    // Add defs for markers
    svg += `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" 
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2d6bc4" />
        </marker>
      </defs>
    `;
    
    // Draw nodes
    for (const node of nodes) {
      const x = shiftX(node.x);
      const y = shiftY(node.y);
      const width = node.width ?? 120;
      const height = node.height ?? 60;
      const isContainer = Array.isArray(node.children) && node.children.length > 0;
      const fill = isContainer ? "#f0f4f8" : "#d0e3ff";
      
      svg += `
        <rect x="${x}" y="${y}" width="${width}" height="${height}" 
          fill="${fill}" stroke="#2d6bc4" stroke-width="2" rx="5" ry="5" />
      `;
      
      // Add label if it exists
      const label = node.data?.label || (node.labels && node.labels[0]?.text);
      if (label) {
        svg += `
          <text x="${x + width/2}" y="${y + height/2}" 
            text-anchor="middle" dominant-baseline="middle" 
            font-size="14" font-weight="bold" fill="#2d6bc4">${label}</text>
        `;
      }
      
      // Add node ID as smaller text below
      svg += `
        <text x="${x + width/2}" y="${y + height - 10}" 
          text-anchor="middle" dominant-baseline="middle" 
          font-size="10" fill="#666666">(${node.id})</text>
      `;
    }
    
    // Draw edges
    for (const edge of edges) {
      if (edge.sections) {
        for (const section of edge.sections) {
          const startX = shiftX(section.startPoint.x);
          const startY = shiftY(section.startPoint.y);
          const endX = shiftX(section.endPoint.x);
          const endY = shiftY(section.endPoint.y);
          
          let points = `${startX},${startY}`;
          
          // Add bend points if they exist
          if (section.bendPoints && section.bendPoints.length > 0) {
            for (const bp of section.bendPoints) {
              points += ` ${shiftX(bp.x)},${shiftY(bp.y)}`;
            }
          }
          
          points += ` ${endX},${endY}`;
          
          svg += `
            <polyline points="${points}" fill="none" stroke="#2d6bc4" 
              stroke-width="2" marker-end="url(#arrow)" />
          `;
        }
      }
    }
    
    // Close SVG tag
    svg += '</svg>';
    
    return svg;
  };
  
  // Helper function to flatten graph
  const flattenGraph = (
    node: any,
    parentX: number,
    parentY: number,
    accum: { nodes: any[]; edges: any[] }
  ) => {
    const absX = (node.x ?? 0) + parentX;
    const absY = (node.y ?? 0) + parentY;
    
    // Add node with absolute coordinates
    const newNode = { ...node, x: absX, y: absY };
    accum.nodes.push(newNode);
    
    // Process edges
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
    
    // Recurse through children
    if (Array.isArray(node.children)) {
      node.children.forEach((child: any) => {
        flattenGraph(child, absX, absY, accum);
      });
    }
  };
  
  // Export graph as JSON
  const handleExportJSON = () => {
    const dataStr = JSON.stringify(elkGraph, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportName = 'elk-graph-' + new Date().toISOString().slice(0, 10) + '.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportName);
    linkElement.click();
  };

  // Handle visualization mode toggle
  const handleToggleVisMode = () => {
    if (onToggleVisMode) {
      const newMode = !useReactFlow;
      onToggleVisMode(newMode);
      
      // If toggling to SVG mode, automatically generate the SVG
      if (newMode === false) {
        handleGenerateSVG();
      }
    }
  };
  
  return (
    <div className="bg-white p-4 rounded-md shadow-lg border border-gray-200 w-64">
      <h3 className="text-lg font-semibold mb-4">Dev Panel</h3>
      
      {/* Visualization Toggle */}
      {onToggleVisMode && (
        <div className="mb-4 pb-4 border-b border-gray-200">
          <h4 className="text-sm font-medium mb-2">Visualization Mode</h4>
          <div className="flex items-center">
            <label className="inline-flex items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={useReactFlow}
                  onChange={handleToggleVisMode}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </div>
              <span className="ml-3 text-sm font-medium text-gray-900">
                {useReactFlow ? 'ReactFlow' : 'SVG'}
              </span>
            </label>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {useReactFlow 
              ? 'Using interactive ReactFlow visualization' 
              : 'Using static SVG visualization'}
          </div>
        </div>
      )}
      
      {/* Add Node Form */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Add Node</h4>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Node Label"
            value={nodeLabel}
            onChange={(e) => setNodeLabel(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          />
          
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            {nodeIds.map(id => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          
          <button
            onClick={handleAddNode}
            disabled={!nodeLabel}
            className="w-full px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            Add Node
          </button>
        </div>
      </div>
      
      {/* Add Edge Form */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Add Edge</h4>
        <div className="space-y-2">
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            <option value="">-- Select Source --</option>
            {nodeIds.filter(id => id !== 'root').map(id => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            <option value="">-- Select Target --</option>
            {nodeIds.filter(id => id !== 'root' && id !== sourceId).map(id => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          
          <button
            onClick={handleAddEdge}
            disabled={!sourceId || !targetId}
            className="w-full px-3 py-1 bg-green-600 text-white rounded text-sm disabled:opacity-50"
          >
            Add Edge
          </button>
        </div>
      </div>
      
      {/* Debug Tools */}
      <div className="pt-4 border-t border-gray-200">
        <h4 className="text-sm font-medium mb-2">Debug Tools</h4>
        <div className="space-y-2">
          <button
            onClick={handleExportJSON}
            className="w-full px-3 py-1 bg-gray-600 text-white rounded text-sm"
          >
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );
};

export default DevPanel; 