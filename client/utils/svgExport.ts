/**
 * SVG Export Utility
 * Handles SVG generation from layout graphs for architecture visualization
 * Extracted from InteractiveCanvas for better modularity
 */

/**
 * Generate SVG content directly from layoutGraph
 */
export function generateSVG(layoutedGraph: any): string {
  if (!layoutedGraph) return '';
  
  // Create accumulator for flattened nodes and edges
  const collected = { nodes: [] as any[], edges: [] as any[] };
  
  // Helper function to flatten graph with proper coordinates
  const flattenGraph = (
    node: any,
    containerOffset = { x: 0, y: 0 }
  ) => {
    // Skip root container itself (only its children)
    if (node.id !== 'root') {
      collected.nodes.push({
        ...node,
        x: node.x + containerOffset.x,
        y: node.y + containerOffset.y
      });
    }
    
    // Recursively flatten children with cumulative offset
    if (node.children && Array.isArray(node.children)) {
      const childOffset = {
        x: containerOffset.x + (node.id !== 'root' ? node.x : 0),
        y: containerOffset.y + (node.id !== 'root' ? node.y : 0)
      };
      
      for (const child of node.children) {
        flattenGraph(child, childOffset);
      }
    }
    
    // Collect edges at this level
    if (node.edges && Array.isArray(node.edges)) {
      for (const edge of node.edges) {
        collected.edges.push({
          ...edge,
          sections: edge.sections?.map((section: any) => ({
            ...section,
            startPoint: {
              x: section.startPoint.x + (node.id !== 'root' ? node.x : 0) + containerOffset.x,
              y: section.startPoint.y + (node.id !== 'root' ? node.y : 0) + containerOffset.y
            },
            endPoint: {
              x: section.endPoint.x + (node.id !== 'root' ? node.x : 0) + containerOffset.x,
              y: section.endPoint.y + (node.id !== 'root' ? node.y : 0) + containerOffset.y
            }
          }))
        });
      }
    }
  };
  
  flattenGraph(layoutedGraph);
  
  const nodes = collected.nodes;
  const edges = collected.edges;
  
  if (nodes.length === 0) {
    return '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><text x="50" y="50" text-anchor="middle">No content</text></svg>';
  }
  
  // Calculate bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + (node.width || 100));
    maxY = Math.max(maxY, node.y + (node.height || 60));
  }
  
  const padding = 20;
  const svgWidth = maxX - minX + padding * 2;
  const svgHeight = maxY - minY + padding * 2;
  
  const shiftX = (x: number) => x - minX + padding;
  const shiftY = (y: number) => y - minY + padding;
  
  // Collect all unique icons used in nodes for embedding
  const usedIcons = new Set<string>();
  for (const node of nodes) {
    let icon = node.data?.icon;
    if (icon) {
      usedIcons.add(icon);
    }
  }
  
  if (usedIcons.size > 0) {
  }
  
  // Start building SVG
  let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;
  
  // Add defs for markers and icons
  svg += `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" 
      markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#2d6bc4" />
    </marker>
  </defs>`;
  
  // Draw nodes
  for (const node of nodes) {
    const x = shiftX(node.x);
    const y = shiftY(node.y);
    const width = node.width || 100;
    const height = node.height || 60;
    const isContainer = !!(node.children && node.children.length > 0);
    
    // Determine fill color based on whether it's a container
    const fill = isContainer ? '#f3f4f6' : '#ffffff';
    
    // Get icon from node data
    const icon = node.data?.icon;
    
    
    svg += `
      <rect x="${x}" y="${y}" width="${width}" height="${height}" 
        fill="${fill}" stroke="#2d6bc4" stroke-width="2" rx="5" ry="5" />
    `;
    
    // Add label if it exists (hide root label)
    const label = node.data?.label || (node.labels && node.labels[0]?.text) || (node.id === 'root' ? '' : node.id);
    
    // Special handling - if it's the root node or if node has explicit icon in data
    // Avoid showing the icon twice or adding redundant icon logic
    if (label) {
      if (isContainer) {
        // Group node - label at center
        svg += `
          <text x="${x + width/2}" y="${y + height/2}" 
            text-anchor="middle" dominant-baseline="middle" 
            font-size="14" font-weight="bold" fill="#2d6bc4">${label}</text>
        `;
        
        // Add icon for container nodes too at the top
        if (icon) {
          // Direct image embedding approach
          svg += `
            <image x="${x + width/2 - 15}" y="${y + 10}" width="30" height="30" 
               href="/assets/canvas/${icon}.svg" />
          `;
        }
      } else {
        // Regular node - label at bottom
        svg += `
          <text x="${x + width/2}" y="${y + height - 10}" 
            text-anchor="middle" dominant-baseline="middle" 
            font-size="12" font-weight="bold" fill="#2d6bc4">${label}</text>
        `;
        
        // Add icon if specified, otherwise use first letter
        if (icon) {
          // Direct image embedding approach
          svg += `
            <image x="${x + width/2 - 20}" y="${y + 10}" width="40" height="40"
              href="/assets/canvas/${icon}.svg" />
          `;
        } else {
          // Fallback to first letter in a circle
          const iconLetter = label.charAt(0).toUpperCase();
          svg += `
            <circle cx="${x + width/2}" cy="${y + height/2 - 10}" r="15" fill="#2d6bc4" />
            <text x="${x + width/2}" y="${y + height/2 - 6}" 
              text-anchor="middle" dominant-baseline="middle" 
              font-size="14" font-weight="bold" fill="white">${iconLetter}</text>
          `;
        }
      }
    }
    
    // Add node ID as smaller text below
    svg += `
      <text x="${x + width/2}" y="${y + height - 2}" 
        text-anchor="middle" dominant-baseline="baseline" 
        font-size="9" fill="#666666">(${node.id})</text>
    `;
  }
  
  // Draw edges
  for (const edge of edges) {
    if (!edge.sections || edge.sections.length === 0) {
      continue;
    }
    
    // Handle multi-section edges (support both types)
    for (let i = 0; i < edge.sections.length; i++) {
      const section = edge.sections[i];
      const startX = shiftX(section.startPoint.x);
      const startY = shiftY(section.startPoint.y);
      const endX = shiftX(section.endPoint.x);
      const endY = shiftY(section.endPoint.y);
      
      // Build polyline points
      let points = `${startX},${startY}`;
      
      // Add bend points if they exist
      if (section.bendPoints && section.bendPoints.length > 0) {
        for (const bendPoint of section.bendPoints) {
          points += ` ${shiftX(bendPoint.x)},${shiftY(bendPoint.y)}`;
        }
      }
      
      points += ` ${endX},${endY}`;
      
      svg += `
        <polyline points="${points}" fill="none" stroke="#2d6bc4" 
          stroke-width="2" marker-end="url(#arrow)" />
      `;
      
      // Add edge label if it exists
      if (edge.labels && edge.labels.length > 0) {
        const rawLabel = edge.labels[0];
        // Use the edge section's coordinates directly or fall back to calculated positions
        let labelX: number, labelY: number;
        
        if (i === 0 && section.bendPoints && section.bendPoints.length > 0) {
          // Position label at first bend point
          const firstBend = section.bendPoints[0];
          labelX = shiftX(firstBend.x);
          labelY = shiftY(firstBend.y) - 15; // Slightly above
        } else {
          // Position label at middle of section
          labelX = (startX + endX) / 2;
          labelY = (startY + endY) / 2 - 15;
        }
        
        // Draw label with higher z-index to ensure visibility
        svg += `
          <text x="${labelX}" y="${labelY}" 
            text-anchor="middle" dominant-baseline="middle" 
            font-size="11" fill="#333" 
            paint-order="stroke"
            stroke="#fff" 
            stroke-width="3" 
            stroke-linecap="round" 
            stroke-linejoin="round">${rawLabel.text}</text>
        `;
      }
    }
  }
  
  // Close SVG tag
  svg += '</svg>';
  
  return svg;
}

/**
 * Handle SVG zoom functionality
 */
export function handleSvgZoom(delta: number, currentZoom: number): number {
  return Math.max(0.2, Math.min(5, currentZoom + delta));
}

/**
 * Utility to validate SVG content
 */
export function isValidSVG(svg: string): boolean {
  if (!svg || typeof svg !== 'string') return false;
  return svg.trim().startsWith('<svg') && svg.trim().endsWith('</svg>');
}

/**
 * Extract SVG dimensions from SVG string
 */
export function getSVGDimensions(svg: string): { width: number; height: number } | null {
  const widthMatch = svg.match(/width="(\d+(?:\.\d+)?)"/);
  const heightMatch = svg.match(/height="(\d+(?:\.\d+)?)"/);
  
  if (widthMatch && heightMatch) {
    return {
      width: parseFloat(widthMatch[1]),
      height: parseFloat(heightMatch[1])
    };
  }
  
  return null;
}
