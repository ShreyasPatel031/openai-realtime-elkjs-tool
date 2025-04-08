// elkOperations.test.ts

import {
    addNode,
    deleteNode,
    moveNode,
    addEdge,
    deleteEdge,
    moveEdge,
    groupNodes,
    removeGroup,
    ElkNode,
    ElkEdge
  } from "./graph_helper_functions";
  
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
        labels: [{ text: "Root" }],
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
        const awsNode = findNodeById(layout, "aws");
        expect(awsNode?.children?.some(child => child.id === "newService")).toBe(true);
      });
  
      test("deleteNode should remove a node and its related edges", () => {
        layout = deleteNode("pdf", layout);
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
        layout = moveNode("chat", "lambda", "openai", layout);
        const openaiNode = findNodeById(layout, "openai");
        expect(openaiNode?.children?.some(child => child.id === "chat")).toBe(true);
        const lambdaNode = findNodeById(layout, "lambda");
        expect(lambdaNode?.children?.some(child => child.id === "chat")).toBe(false);
      });
    });
  
    // ────── EDGE OPERATIONS ─────────────────────────────
  
    describe("Edge Operations", () => {
      test("addEdge should create a new edge at the common ancestor", () => {
        layout = addEdge("newEdge", null, "webapp", "chat_api", layout);
        const edge = findEdgeById(layout, "newEdge");
        expect(edge).not.toBeNull();
        expect(edge?.sources).toEqual(["webapp"]);
        expect(edge?.targets).toEqual(["chat_api"]);
      });
  
      test("deleteEdge should remove an edge", () => {
        layout = deleteEdge("e0", layout);
        const edge = findEdgeById(layout, "e0");
        expect(edge).toBeNull();
      });
  
      test("moveEdge should update edge endpoints", () => {
        layout = moveEdge("e0", "webapp", "vector", layout);
        const edge = findEdgeById(layout, "e0");
        expect(edge?.sources).toEqual(["webapp"]);
        expect(edge?.targets).toEqual(["vector"]);
      });
    });
  
    // ────── GROUP OPERATIONS ────────────────────────────
  
    describe("Group Operations", () => {
      test("groupNodes should create a group and move nodes into it", () => {
        layout = groupNodes(["vector", "storage"], "aws", "dataStore", layout);
        const awsNode = findNodeById(layout, "aws");
        const groupNode = awsNode?.children?.find(child => child.id === "dataStore");
        expect(groupNode).toBeTruthy();
        expect(groupNode?.children?.length).toBe(2);
        expect(groupNode?.children?.some(child => child.id === "vector")).toBe(true);
        expect(groupNode?.children?.some(child => child.id === "storage")).toBe(true);
      });
  
      test("removeGroup should ungroup nodes", () => {
        // First create a group
        layout = groupNodes(["vector", "storage"], "aws", "dataStore", layout);
        // Then remove it
        layout = removeGroup("dataStore", layout);
        const awsNode = findNodeById(layout, "aws");
        expect(awsNode?.children?.some(child => child.id === "dataStore")).toBe(false);
        expect(awsNode?.children?.some(child => child.id === "vector")).toBe(true);
        expect(awsNode?.children?.some(child => child.id === "storage")).toBe(true);
      });
    });
  });
  