// elkOperations.test.ts

import {
    addNode,
    deleteNode,
    moveNode,
    addEdge,
    deleteEdge,
    groupNodes,
    removeGroup,
    ElkNode,
    ElkEdge,
    findCommonAncestor
} from "./graph_helper_functions";
import * as fs from 'node:fs';
import * as path from 'node:path';

// Visualization output functionality
const VISUALIZATION_FOLDER = path.join(__dirname, 'visualizations');

function ensureVisualizationFolder() {
    if (!fs.existsSync(VISUALIZATION_FOLDER)) {
        fs.mkdirSync(VISUALIZATION_FOLDER);
    }
}

function saveGraphToFile(graph: ElkNode, filename: string) {
    ensureVisualizationFolder();
    const outputPath = path.join(VISUALIZATION_FOLDER, filename);
    fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2));
    console.log(`Graph saved to ${outputPath}`);
}

// Helper function used by tests to search for a node recursively.
function findNodeById(node: ElkNode, id: string): ElkNode | null {
    if (node.id === id) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findNodeById(child, id);
            if (found) return found;
        }
    }
    return null;
}

// Helper function for tests: search for an edge by id.
function findEdgeById(node: ElkNode, edgeId: string): ElkEdge | null {
    if (node.edges) {
        for (const edge of node.edges) {
            if (edge.id === edgeId) return edge;
        }
    }
    if (node.children) {
        for (const child of node.children) {
            const result = findEdgeById(child, edgeId);
            if (result) return result;
        }
    }
    return null;
}

describe("ELK JS Layout Operations", () => {
    let layout: ElkNode;

    // A fresh layout for each test.
    beforeEach(() => {
        layout = {
            id: "root",
            labels: [],
            children: [
                { 
                    id: "ui",
                    labels: [{ text: "UI" }],
                    children: [
                        { 
                            id: "webapp",        
                            labels: [{ text: "Web App" }]
                        }
                    ]
                },
                { 
                    id: "aws",
                    labels: [{ text: "AWS" }],
                    children: [
                        { 
                            id: "api",  
                            labels: [{ text: "API" }]
                        },
                        { 
                            id: "lambda",
                            labels: [{ text: "Lambda" }],
                            children: [
                                { 
                                    id: "query", 
                                    labels: [{ text: "Query" }]
                                },
                                { 
                                    id: "pdf", 
                                    labels: [{ text: "PDF" }]
                                },
                                { 
                                    id: "fetch", 
                                    labels: [{ text: "Fetch" }]
                                },
                                { 
                                    id: "chat", 
                                    labels: [{ text: "Chat" }]
                                }
                            ],
                            edges: [
                                { id: "e6", sources: ["chat"], targets: ["fetch"] }
                            ]
                        },
                        { 
                            id: "vector", 
                            labels: [{ text: "Vector" }]
                        },
                        { 
                            id: "storage", 
                            labels: [{ text: "Storage" }]
                        }
                    ],
                    edges: [
                        { id: "e1", sources: ["api"], targets: ["lambda"] },
                        { id: "e2", sources: ["query"], targets: ["vector"] },
                        { id: "e3", sources: ["pdf"], targets: ["vector"] },
                        { id: "e4", sources: ["pdf"], targets: ["storage"] },
                        { id: "e5", sources: ["fetch"], targets: ["storage"] }
                    ]
                },
                { 
                    id: "openai", 
                    labels: [{ text: "OpenAI" }],
                    children: [
                        { 
                            id: "embed", 
                            labels: [{ text: "Embed" }]
                        },
                        { 
                            id: "chat_api", 
                            labels: [{ text: "Chat API" }]
                        }
                    ]
                }
            ],
            edges: [
                { id: "e0", sources: ["webapp"], targets: ["api"] },
                { id: "e7", sources: ["chat"], targets: ["chat_api"] },
                { id: "e8", sources: ["embed"], targets: ["query"] },
                { id: "e9", sources: ["embed"], targets: ["pdf"] }
            ]
        };
    });

    // ────── NODE OPERATIONS ─────────────────────────────

    describe("Node Operations", () => {
        test("addNode should add a new node under given parent", () => {
            layout = addNode("newService", "aws", layout);
            saveGraphToFile(layout, "add_node_result.json");
            const awsNode = findNodeById(layout, "aws");
            expect(awsNode?.children?.some(child => child.id === "newService")).toBe(true);
        });

        test("deleteNode should remove a node and its related edges", () => {
            layout = deleteNode("pdf", layout);
            saveGraphToFile(layout, "delete_pdf_result.json");
            const lambdaNode = findNodeById(layout, "lambda");
            expect(lambdaNode?.children?.some(child => child.id === "pdf")).toBe(false);
            
            // Check if edges related to pdf are removed from all levels
            const awsNode = findNodeById(layout, "aws");
            const rootNode = layout;
            
            // Check edges in AWS node
            expect(awsNode?.edges?.some(edge => 
                edge.sources.includes("pdf") || edge.targets.includes("pdf")
            )).toBe(false);
            
            // Check edges in root node
            expect(rootNode.edges?.some(edge => 
                edge.sources.includes("pdf") || edge.targets.includes("pdf")
            )).toBe(false);
            
            // Check edges in lambda node
            expect(lambdaNode?.edges?.some(edge => 
                edge.sources.includes("pdf") || edge.targets.includes("pdf")
            )).toBe(false);
        });

        test("moveNode should move a node to a new parent", () => {
            // Define test parameters - can be easily changed
            const nodeId = "chat";
            const sourceParentId = "lambda";
            const targetParentId = "openai";

            layout = moveNode(nodeId, targetParentId, layout);
            saveGraphToFile(layout, `move_${nodeId}_from_${sourceParentId}_to_${targetParentId}.json`);
            
            // Check node exists in target parent
            const targetParentNode = findNodeById(layout, targetParentId);
            expect(targetParentNode?.children?.some(child => child.id === nodeId)).toBe(true);
            
            // Check node no longer exists in source parent
            const sourceParentNode = findNodeById(layout, sourceParentId);
            expect(sourceParentNode?.children?.some(child => child.id === nodeId)).toBe(false);
        });
    });

    // ────── EDGE OPERATIONS ─────────────────────────────

    describe("Edge Operations", () => {
        test("addEdge should create a new edge at the common ancestor", () => {
            layout = addEdge("newEdge", "webapp", "chat_api", layout);
            saveGraphToFile(layout, "add_edge_result.json");
            const edge = findEdgeById(layout, "newEdge");
            expect(edge).not.toBeNull();
            expect(edge?.sources).toEqual(["webapp"]);
            expect(edge?.targets).toEqual(["chat_api"]);
        });

        test("deleteEdge should remove an edge", () => {
            layout = deleteEdge("e0", layout);
            saveGraphToFile(layout, "delete_edge_result.json");
            const edge = findEdgeById(layout, "e0");
            expect(edge).toBeNull();
        });
    });

    // ────── GROUP OPERATIONS ────────────────────────────

    describe("Group Operations", () => {
        test("groupNodes should create a group and move nodes into it", () => {
            // You can change these values to test different grouping scenarios
            const nodeIds = ["vector", "query"];  // Nodes to group
            const parentId = "root";                 // Parent node containing the nodes
            const groupId = "dataStore";            // New group name
            
            
            // Create the group
            layout = groupNodes(nodeIds, parentId, groupId, layout);
            saveGraphToFile(layout, "group_nodes_result.json");
            
            // Verify the group was created correctly
            const parentNode = findNodeById(layout, parentId);
            const groupNode = parentNode?.children?.find(child => child.id === groupId);
            
            console.log(`Created group ${groupId} under ${parentId} with nodes: ${nodeIds.join(", ")}`);
            
            expect(groupNode).toBeTruthy();
            expect(groupNode?.children?.length).toBe(nodeIds.length);
            
            // Verify each node is in the group
            for (const nodeId of nodeIds) {
                expect(groupNode?.children?.some(child => child.id === nodeId)).toBe(true);
                // Verify node is no longer a direct child of the parent
                expect(parentNode?.children?.some(child => child.id === nodeId && child.id !== groupId)).toBe(false);
            }
        });

        test("removeGroup should ungroup nodes", () => {
            layout = groupNodes(["vector", "storage"], "aws", "dataStore", layout);
            layout = removeGroup("dataStore", layout);
            saveGraphToFile(layout, "remove_group_result.json");
            const awsNode = findNodeById(layout, "aws");
            expect(awsNode?.children?.some(child => child.id === "dataStore")).toBe(false);
            expect(awsNode?.children?.some(child => child.id === "vector")).toBe(true);
            expect(awsNode?.children?.some(child => child.id === "storage")).toBe(true);
        });
    });
});
  