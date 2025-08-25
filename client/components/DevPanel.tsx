import React, { useState, useRef } from 'react';
import { ElkGraph } from '../types/graph';
import ELK from "elkjs/lib/elk.bundled.js";
import { ensureIds } from './graph/utils/elk/ids';
import { structuralHash } from './graph/utils/elk/structuralHash';
import { ROOT_DEFAULT_OPTIONS, NON_ROOT_DEFAULT_OPTIONS } from './graph/utils/elk/elkOptions';
import { 
  addNode, 
  deleteNode, 
  moveNode, 
  addEdge, 
  deleteEdge, 
  groupNodes, 
  removeGroup
} from './graph/mutations';
import { splitTextIntoLines } from '../utils/textMeasurement';

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
  
  // New state for additional operations
  const [nodeToDelete, setNodeToDelete] = useState('');
  const [nodeToMove, setNodeToMove] = useState('');
  const [newParentId, setNewParentId] = useState('');
  const [edgeToDelete, setEdgeToDelete] = useState('');
  const [nodesToGroup, setNodesToGroup] = useState<string[]>([]);
  const [groupParentId, setGroupParentId] = useState('root');
  const [groupLabel, setGroupLabel] = useState('');
  const [groupToRemove, setGroupToRemove] = useState('');
  const [nodeSearchTerm, setNodeSearchTerm] = useState('');
  
  // Add state for SVG zoom
  const [svgZoom, setSvgZoom] = useState(1);
  
  // Default architecture data
  const defaultArchitecture = {
    "id": "root",
    "children": [
      {
        "id": "gcp_env",
        "labels": [
          {
            "text": "Google Cloud Platform"
          }
        ],
        "children": [
          {
            "id": "api_gateway",
            "labels": [
              {
                "text": "api_gateway"
              }
            ],
            "children": [
              {
                "id": "cloud_lb",
                "labels": [
                  {
                    "text": "Cloud Load Balancing"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              },
              {
                "id": "edge_security",
                "labels": [
                  {
                    "text": "edge_security"
                  }
                ],
                "children": [
                  {
                    "id": "cloud_armor",
                    "labels": [
                      {
                        "text": "Cloud Armor"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  },
                  {
                    "id": "certificate_manager",
                    "labels": [
                      {
                        "text": "Certificate Manager"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  },
                  {
                    "id": "cloud_cdn",
                    "labels": [
                      {
                        "text": "Cloud CDN"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  }
                ],
                "edges": []
              },
              {
                "id": "gateway_mgmt",
                "labels": [
                  {
                    "text": "gateway_mgmt"
                  }
                ],
                "children": [
                  {
                    "id": "cloud_dns",
                    "labels": [
                      {
                        "text": "Cloud DNS"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  },
                  {
                    "id": "gke_gateway_controller",
                    "labels": [
                      {
                        "text": "GKE Gateway Controller"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  },
                  {
                    "id": "k8s_gateway_api",
                    "labels": [
                      {
                        "text": "Kubernetes Gateway API"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  }
                ],
                "edges": []
              }
            ],
            "edges": [
              {
                "id": "edge_dns_lb",
                "labels": [
                  {
                    "text": "resolves"
                  }
                ]
              },
              {
                "id": "edge_gkeconf_lb",
                "labels": [
                  {
                    "text": "configures"
                  }
                ]
              },
              {
                "id": "edge_armor_lb",
                "labels": [
                  {
                    "text": "protects"
                  }
                ]
              },
              {
                "id": "edge_cert_lb",
                "labels": [
                  {
                    "text": "manages"
                  }
                ]
              },
              {
                "id": "edge_cdn_lb",
                "labels": [
                  {
                    "text": "caches"
                  }
                ]
              }
            ]
          },
          {
            "id": "service_mesh",
            "labels": [
              {
                "text": "service_mesh"
              }
            ],
            "children": [
              {
                "id": "cluster1",
                "labels": [
                  {
                    "text": "cluster1"
                  }
                ],
                "children": [
                  {
                    "id": "cluster1_svc1",
                    "labels": [
                      {
                        "text": "Service 1 (Cluster1)"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  },
                  {
                    "id": "cluster1_svc2",
                    "labels": [
                      {
                        "text": "Service 2 (Cluster1)"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  }
                ],
                "edges": [
                  {
                    "id": "edge_svc1_c1_svc2_c1",
                    "labels": [
                      {
                        "text": "calls"
                      }
                    ]
                  }
                ]
              },
              {
                "id": "cluster2",
                "labels": [
                  {
                    "text": "cluster2"
                  }
                ],
                "children": [
                  {
                    "id": "cluster2_svc1",
                    "labels": [
                      {
                        "text": "Service 1 (Cluster2)"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  },
                  {
                    "id": "cluster2_svc2",
                    "labels": [
                      {
                        "text": "Service 2 (Cluster2)"
                      }
                    ],
                    "children": [],
                    "edges": [],
                    "data": {}
                  }
                ],
                "edges": [
                  {
                    "id": "edge_svc1_c2_svc2_c2",
                    "labels": [
                      {
                        "text": "calls"
                      }
                    ]
                  }
                ]
              }
            ],
            "edges": [
              {
                "id": "edge_svc1_c1_svc1_c2",
                "labels": [
                  {
                    "text": "syncs"
                  }
                ]
              },
              {
                "id": "edge_svc1_c1_svc2_c2",
                "labels": [
                  {
                    "text": "communicates"
                  }
                ]
              },
              {
                "id": "edge_svc2_c2_svc1_c1",
                "labels": [
                  {
                    "text": "communicates"
                  }
                ]
              },
              {
                "id": "edge_svc1_c2_svc2_c1",
                "labels": [
                  {
                    "text": "communicates"
                  }
                ]
              },
              {
                "id": "edge_svc2_c1_svc2_c2",
                "labels": [
                  {
                    "text": "syncs"
                  }
                ]
              }
            ]
          },
          {
            "id": "api_and_identity",
            "labels": [
              {
                "text": "api_and_identity"
              }
            ],
            "children": [
              {
                "id": "api_gateway_svc",
                "labels": [
                  {
                    "text": "API Gateway"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              },
              {
                "id": "idp",
                "labels": [
                  {
                    "text": "Identity Platform"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              }
            ],
            "edges": [
              {
                "id": "e_idp_apigw",
                "labels": [
                  {
                    "text": "authenticates"
                  }
                ]
              }
            ]
          },
          {
            "id": "backend_services",
            "labels": [
              {
                "text": "backend_services"
              }
            ],
            "children": [
              {
                "id": "svc_api",
                "labels": [
                  {
                    "text": "API Service"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              },
              {
                "id": "svc_auth",
                "labels": [
                  {
                    "text": "Auth Service"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              },
              {
                "id": "svc_data",
                "labels": [
                  {
                    "text": "Data Service"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              }
            ],
            "edges": [
              {
                "id": "e_api_auth",
                "labels": [
                  {
                    "text": "validates"
                  }
                ]
              }
            ]
          },
          {
            "id": "datastores",
            "labels": [
              {
                "text": "datastores"
              }
            ],
            "children": [
              {
                "id": "spanner_db",
                "labels": [
                  {
                    "text": "Cloud Spanner"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              },
              {
                "id": "firestore_db",
                "labels": [
                  {
                    "text": "Firestore"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              }
            ],
            "edges": []
          },
          {
            "id": "messaging",
            "labels": [
              {
                "text": "messaging"
              }
            ],
            "children": [
              {
                "id": "pubsub_topic",
                "labels": [
                  {
                    "text": "Pub/Sub Topic"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              },
              {
                "id": "dlq_topic",
                "labels": [
                  {
                    "text": "DLQ Topic"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              }
            ],
            "edges": [
              {
                "id": "e_topic_dlq",
                "labels": [
                  {
                    "text": "routes failures"
                  }
                ]
              }
            ]
          },
          {
            "id": "observability",
            "labels": [
              {
                "text": "observability"
              }
            ],
            "children": [
              {
                "id": "cloud_monitoring",
                "labels": [
                  {
                    "text": "Cloud Monitoring"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              },
              {
                "id": "cloud_logging",
                "labels": [
                  {
                    "text": "Cloud Logging"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              },
              {
                "id": "cloud_trace",
                "labels": [
                  {
                    "text": "Cloud Trace"
                  }
                ],
                "children": [],
                "edges": [],
                "data": {}
              }
            ],
            "edges": []
          }
        ],
        "edges": [
          {
            "id": "edge_k8s_svc1_c1",
            "labels": [
              {
                "text": "routes"
              }
            ]
          },
          {
            "id": "edge_k8s_svc1_c2",
            "labels": [
              {
                "text": "routes"
              }
            ]
          },
          {
            "id": "e_lb_apigw",
            "labels": [
              {
                "text": "forwards"
              }
            ]
          },
          {
            "id": "e_apigw_api",
            "labels": [
              {
                "text": "proxies"
              }
            ]
          },
          {
            "id": "e_apigw_data",
            "labels": [
              {
                "text": "proxies"
              }
            ]
          },
          {
            "id": "e_backend_datastore",
            "labels": [
              {
                "text": "reads/writes"
              }
            ]
          },
          {
            "id": "e_data_firestore",
            "labels": [
              {
                "text": "stores documents"
              }
            ]
          },
          {
            "id": "e_data_publish",
            "labels": [
              {
                "text": "publishes events"
              }
            ]
          },
          {
            "id": "e_backend_logging",
            "labels": [
              {
                "text": "writes logs"
              }
            ]
          },
          {
            "id": "e_backend_monitoring",
            "labels": [
              {
                "text": "exports metrics"
              }
            ]
          },
          {
            "id": "e_backend_trace",
            "labels": [
              {
                "text": "traces"
              }
            ]
          }
        ],
        "data": {}
      },
      {
        "id": "external_clients",
        "labels": [
          {
            "text": "external_clients"
          }
        ],
        "children": [
          {
            "id": "external_client",
            "labels": [
              {
                "text": "External Client"
              }
            ],
            "children": [],
            "edges": [],
            "data": {}
          }
        ],
        "edges": []
      },
      {
        "id": "gcp",
        "labels": [
          {
            "text": "Google Cloud Platform"
          }
        ],
        "children": [],
        "edges": [],
        "data": {}
      },
      {
        "id": "users",
        "labels": [
          {
            "text": "users"
          }
        ],
        "children": [
          {
            "id": "users_web",
            "labels": [
              {
                "text": "Web Users"
              }
            ],
            "children": [],
            "edges": [],
            "data": {}
          },
          {
            "id": "users_mobile",
            "labels": [
              {
                "text": "Mobile Users"
              }
            ],
            "children": [],
            "edges": [],
            "data": {}
          }
        ],
        "edges": []
      }
    ],
    "edges": [
      {
        "id": "edge_client_lb",
        "labels": [
          {
            "text": "requests"
          }
        ]
      },
      {
        "id": "edge_external_to_lb",
        "labels": [
          {
            "text": "HTTPS routes"
          }
        ]
      },
      {
        "id": "e_users_cdn_web",
        "labels": [
          {
            "text": "requests"
          }
        ]
      },
      {
        "id": "e_users_cdn_mobile",
        "labels": [
          {
            "text": "requests"
          }
        ]
      }
    ]
  };
  
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
    
    // Create a deep copy of the graph
    const updatedGraph = JSON.parse(JSON.stringify(elkGraph));
    
    // Use the mutation function from the imported file
    const newNodeId = nodeLabel.toLowerCase().replace(/\s+/g, '_');
    const mutatedGraph = addNode(nodeLabel, parentId, updatedGraph);
    
    // Pass the updated graph back to the parent
    console.group("[DevPanel] onGraphChange");
    console.log("updatedGraph (domain graph)", mutatedGraph);
    console.groupEnd();
    onGraphChange(mutatedGraph);
    
    // Clear the form
    setNodeLabel('');
  };
  
  const handleAddEdge = () => {
    if (!sourceId || !targetId) return;
    
    // Create the edge ID
    const edgeId = `edge_${sourceId}_to_${targetId}`;
    
    // Create a deep copy of the graph
    const updatedGraph = JSON.parse(JSON.stringify(elkGraph));
    
    // Use the mutation function from the imported file
    const mutatedGraph = addEdge(edgeId, sourceId, targetId, updatedGraph);
    
    // Pass the updated graph back to the parent
    console.group("[DevPanel] onGraphChange");
    console.log("updatedGraph (domain graph)", mutatedGraph);
    console.groupEnd();
    onGraphChange(mutatedGraph);
    
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
      
      console.log('🟪 [AUTO-TEST] Triggering SVG generation to test GKE Gateway Controller...');
      
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
  
  // Auto-trigger SVG generation for testing (remove this after debugging)
  React.useEffect(() => {
    if (elkGraph && elkGraph.children && elkGraph.children.length > 0) {
      const hasGKENode = JSON.stringify(elkGraph).includes("GKE Gateway Controller");
      if (hasGKENode) {
        console.log('🔄 Auto-triggering SVG test for GKE Gateway Controller...');
        setTimeout(() => {
          handleGenerateSVG();
        }, 1000); // Reduced to 1 second
      }
    }
  }, [elkGraph]);
  
  // Function to generate SVG string from layouted graph
  // Helper function to render multi-line text in SVG using the same logic as ELK
  const renderMultiLineText = (text: string, x: number, y: number, fontSize: number = 12): string => {
    const lines = splitTextIntoLines(text, 76); // Use same width as ELK calculation
    const lineHeight = 14;
    
    if (text === "GKE Gateway Controller") {
      console.log(`🟪 [DEV PANEL SVG] Rendering "${text}" at (${x}, ${y})`);
      console.log(`🟪 [DEV PANEL SVG] Got lines: [${lines.join('", "')}] (${lines.length} lines)`);
      console.log(`🟪 [DEV PANEL SVG] FontSize: ${fontSize}px, LineHeight: ${lineHeight}px`);
    }
    
    // Generate SVG text elements for each line
    let svgText = '';
    for (let i = 0; i < lines.length; i++) {
      const lineY = y + (i * lineHeight) - ((lines.length - 1) * lineHeight / 2);
      svgText += `
        <text x="${x}" y="${lineY}" 
          text-anchor="middle" dominant-baseline="middle" 
          font-size="${fontSize}" font-weight="bold" fill="#2d6bc4"
          font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">${lines[i]}</text>
      `;
    }
    return svgText;
  };

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
      
      // Add label if it exists (hide root label)
      const label = node.data?.label || (node.labels && node.labels[0]?.text) || (node.id === 'root' ? '' : node.id);
      if (label) {
        if (isContainer) {
          // Group node - label at center top
          svg += renderMultiLineText(label, x + width/2, y + 20, 14);
        } else {
          // Regular node - text positioned below icon with proper gap
          // Icon is at y + 10 to y + 58 (48px tall)
          // Text starts at icon bottom + 12px gap = y + 58 + 12 = y + 70
          const textY = y + 70;
          svg += renderMultiLineText(label, x + width/2, textY, 12);
          
          // Add icon to regular nodes - FIXED: 48x48 square with first letter
          const iconLetter = label.charAt(0).toUpperCase();
          svg += `
            <rect x="${x + width/2 - 24}" y="${y + 10}" width="48" height="48" 
              fill="#2d6bc4" rx="8" ry="8" />
            <text x="${x + width/2}" y="${y + 34}" 
              text-anchor="middle" dominant-baseline="middle" 
              font-size="16" font-weight="bold" fill="white">${iconLetter}</text>
          `;
        }
      }
      
      // Add node ID as smaller text below
      svg += `
        <text x="${x + width/2}" y="${y + height - 5}" 
          text-anchor="middle" dominant-baseline="baseline" 
          font-size="9" fill="#666666">(${node.id})</text>
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
          
          // Add edge label if it exists
          if (edge.labels && edge.labels.length > 0) {
            // ONLY render label if ELK provided explicit coordinates
            if (section.labelPos) {
              const labelX = shiftX(section.labelPos.x);
              const labelY = shiftY(section.labelPos.y);
              
              // Draw label without any fallbacks
              svg += `
                <text x="${labelX}" y="${labelY}" 
                  text-anchor="middle" dominant-baseline="middle" 
                  font-size="12" fill="#333" 
                  paint-order="stroke"
                  stroke="#fff" 
                  stroke-width="4" 
                  stroke-linecap="round" 
                  stroke-linejoin="round">${edge.labels[0].text}</text>
              `;
            }
          }
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
            
            // Process label position if it exists
            const labelPos = section.labelPos ? {
              x: section.labelPos.x + absX,
              y: section.labelPos.y + absY,
            } : undefined;
            
            return { 
              ...section, 
              startPoint: start, 
              endPoint: end, 
              bendPoints,
              labelPos 
            };
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

  // Handle loading default architecture
  const handleLoadDefaultArchitecture = () => {
    console.log('Loading default architecture...');
    onGraphChange(defaultArchitecture as ElkGraph);
  };
  
  // Helper function to find a node by ID
  const findNodeById = (node: any, id: string): any => {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  };

  // New handlers for additional operations using imported mutation functions
  const handleDeleteNode = () => {
    if (!nodeToDelete) return;
    
    // Create a deep copy of the graph
    const updatedGraph = JSON.parse(JSON.stringify(elkGraph));
    
    try {
      // Use the mutation function from the imported file
      const mutatedGraph = deleteNode(nodeToDelete, updatedGraph);
      
      console.group("[DevPanel] onGraphChange");
      console.log("updatedGraph (domain graph)", mutatedGraph);
      console.groupEnd();
      onGraphChange(mutatedGraph);
      setNodeToDelete('');
    } catch (error) {
      console.error(`Error deleting node: ${error}`);
    }
  };

  const handleMoveNode = () => {
    if (!nodeToMove || !newParentId) return;
    
    // Create a deep copy of the graph
    const updatedGraph = JSON.parse(JSON.stringify(elkGraph));
    
    try {
      // Use the mutation function from the imported file
      const mutatedGraph = moveNode(nodeToMove, newParentId, updatedGraph);
      
      console.group("[DevPanel] onGraphChange");
      console.log("updatedGraph (domain graph)", mutatedGraph);
      console.groupEnd();
      onGraphChange(mutatedGraph);
      setNodeToMove('');
      setNewParentId('');
    } catch (error) {
      console.error(`Error moving node: ${error}`);
    }
  };

  const handleDeleteEdge = () => {
    if (!edgeToDelete) return;
    
    // Create a deep copy of the graph
    const updatedGraph = JSON.parse(JSON.stringify(elkGraph));
    
    try {
      // Use the mutation function from the imported file
      const mutatedGraph = deleteEdge(edgeToDelete, updatedGraph);
      
      console.group("[DevPanel] onGraphChange");
      console.log("updatedGraph (domain graph)", mutatedGraph);
      console.groupEnd();
      onGraphChange(mutatedGraph);
      setEdgeToDelete('');
    } catch (error) {
      console.error(`Error deleting edge: ${error}`);
    }
  };

  const handleGroupNodes = () => {
    if (nodesToGroup.length === 0 || !groupLabel) return;
    
    // Create the group ID
    const groupId = groupLabel.toLowerCase().replace(/\s+/g, '_');
    
    // Create a deep copy of the graph
    const updatedGraph = JSON.parse(JSON.stringify(elkGraph));
    
    try {
      // Use the mutation function from the imported file
      const mutatedGraph = groupNodes(nodesToGroup, groupParentId, groupId, updatedGraph);
      
      console.group("[DevPanel] onGraphChange");
      console.log("updatedGraph (domain graph)", mutatedGraph);
      console.groupEnd();
      onGraphChange(mutatedGraph);
      setNodesToGroup([]);
      setGroupLabel('');
      setNodeSearchTerm('');  // Reset search term after successful group creation
    } catch (error) {
      console.error(`Error grouping nodes: ${error}`);
    }
  };

  const handleRemoveGroup = () => {
    if (!groupToRemove) return;
    
    // Create a deep copy of the graph
    const updatedGraph = JSON.parse(JSON.stringify(elkGraph));
    
    try {
      // Use the mutation function from the imported file
      const mutatedGraph = removeGroup(groupToRemove, updatedGraph);
      
      console.group("[DevPanel] onGraphChange");
      console.log("updatedGraph (domain graph)", mutatedGraph);
      console.groupEnd();
      onGraphChange(mutatedGraph);
      setGroupToRemove('');
    } catch (error) {
      console.error(`Error removing group: ${error}`);
    }
  };

  // Helper function to handle SVG zoom
  const handleSvgZoom = (delta: number) => {
    setSvgZoom(prev => {
      const newZoom = Math.max(0.1, Math.min(5, prev + delta));
      return newZoom;
    });
  };
  
  const svgStyle = {
    transform: `scale(${svgZoom})`,
    transformOrigin: 'top left',
    transition: 'transform 0.2s'
  };

  return (
    <div className="bg-white p-4 rounded-md shadow-lg border border-gray-200 w-64 h-[calc(100vh-2rem)] overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4 sticky top-0 bg-white pb-2">Dev Panel</h3>
      
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
      
      {/* Delete Node Form */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Delete Node</h4>
        <div className="space-y-2">
          <select
            value={nodeToDelete}
            onChange={(e) => setNodeToDelete(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            <option value="">-- Select Node to Delete --</option>
            {nodeIds.filter(id => id !== 'root').map(id => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          
          <button
            onClick={handleDeleteNode}
            disabled={!nodeToDelete}
            className="w-full px-3 py-1 bg-red-600 text-white rounded text-sm disabled:opacity-50"
          >
            Delete Node
          </button>
        </div>
      </div>
      
      {/* Move Node Form */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Move Node</h4>
        <div className="space-y-2">
          <select
            value={nodeToMove}
            onChange={(e) => setNodeToMove(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            <option value="">-- Select Node to Move --</option>
            {nodeIds.filter(id => id !== 'root').map(id => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          
          <select
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            <option value="">-- Select New Parent --</option>
            {nodeIds.map(id => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          
          <button
            onClick={handleMoveNode}
            disabled={!nodeToMove || !newParentId}
            className="w-full px-3 py-1 bg-yellow-600 text-white rounded text-sm disabled:opacity-50"
          >
            Move Node
          </button>
        </div>
      </div>
      
      {/* Delete Edge Form */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Delete Edge</h4>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Edge ID (e.g., edge_source_to_target)"
            value={edgeToDelete}
            onChange={(e) => setEdgeToDelete(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          />
          
          <button
            onClick={handleDeleteEdge}
            disabled={!edgeToDelete}
            className="w-full px-3 py-1 bg-red-600 text-white rounded text-sm disabled:opacity-50"
          >
            Delete Edge
          </button>
        </div>
      </div>
      
      {/* Group Nodes Form */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Group Nodes</h4>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Search nodes..."
            value={nodeSearchTerm}
            onChange={(e) => setNodeSearchTerm(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          />
          
          <select
            multiple
            value={nodesToGroup}
            onChange={(e) => {
              const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
              // Merge new selections with existing ones, removing duplicates
              const newSelection = Array.from(new Set([...nodesToGroup, ...selectedOptions]));
              setNodesToGroup(newSelection);
            }}
            className="w-full px-2 py-1 border rounded text-sm"
            size={3}
          >
            {nodeIds
              .filter(id => id !== 'root')
              .filter(id => id.toLowerCase().includes(nodeSearchTerm.toLowerCase()))
              .map(id => (
                <option 
                  key={id} 
                  value={id}
                  style={{ 
                    backgroundColor: nodesToGroup.includes(id) ? '#e2e8f0' : 'transparent',
                    fontWeight: nodesToGroup.includes(id) ? 'bold' : 'normal'
                  }}
                >
                  {id}
                </option>
              ))}
          </select>
          
          {/* Show selected nodes count */}
          {nodesToGroup.length > 0 && (
            <div className="text-sm text-gray-600">
              Selected: {nodesToGroup.length} node{nodesToGroup.length !== 1 ? 's' : ''}
            </div>
          )}
          
          <select
            value={groupParentId}
            onChange={(e) => setGroupParentId(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            {nodeIds.map(id => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          
          <input
            type="text"
            placeholder="Group Label"
            value={groupLabel}
            onChange={(e) => setGroupLabel(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          />
          
          <button
            onClick={handleGroupNodes}
            disabled={nodesToGroup.length === 0 || !groupLabel}
            className="w-full px-3 py-1 bg-green-600 text-white rounded text-sm disabled:opacity-50"
          >
            Create Group
          </button>
        </div>
      </div>
      
      {/* Remove Group Form */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Remove Group</h4>
        <div className="space-y-2">
          <select
            value={groupToRemove}
            onChange={(e) => setGroupToRemove(e.target.value)}
            className="w-full px-2 py-1 border rounded text-sm"
          >
            <option value="">-- Select Group to Remove --</option>
            {nodeIds.filter(id => id !== 'root').map(id => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          
          <button
            onClick={handleRemoveGroup}
            disabled={!groupToRemove}
            className="w-full px-3 py-1 bg-red-600 text-white rounded text-sm disabled:opacity-50"
          >
            Remove Group
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
          
          <button
            onClick={handleGenerateSVG}
            className="w-full px-3 py-1 bg-blue-600 text-white rounded text-sm generate-svg-btn"
            disabled={isGeneratingSvg}
          >
            {isGeneratingSvg ? 'Generating SVG...' : 'Generate SVG'}
          </button>
          
          <button
            onClick={handleToggleVisMode}
            className="w-full px-3 py-1 bg-purple-600 text-white rounded text-sm"
          >
            {useReactFlow ? 'Switch to SVG View' : 'Switch to ReactFlow View'}
          </button>
          
          <button
            onClick={handleLoadDefaultArchitecture}
            className="w-full px-3 py-1 bg-green-600 text-white rounded text-sm"
          >
            Load Default Architecture
          </button>
        </div>
      </div>
      
      {/* SVG Visualization with zoom controls */}
      {svgRef.current?.innerHTML && (
        <div className="mt-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium">SVG Preview (Zoom: {(svgZoom * 100).toFixed(0)}%)</span>
            <div className="flex gap-1">
              <button 
                onClick={() => handleSvgZoom(-0.1)} 
                className="px-2 py-0.5 bg-gray-200 rounded text-xs"
              >
                -
              </button>
              <button 
                onClick={() => handleSvgZoom(0.1)} 
                className="px-2 py-0.5 bg-gray-200 rounded text-xs"
              >
                +
              </button>
              <button 
                onClick={() => setSvgZoom(1)} 
                className="px-2 py-0.5 bg-gray-200 rounded text-xs"
              >
                Reset
              </button>
            </div>
          </div>
          <div className="border rounded p-2 bg-gray-50 overflow-auto max-h-80">
            <div ref={svgRef} style={svgStyle} className="transform-gpu"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevPanel; 