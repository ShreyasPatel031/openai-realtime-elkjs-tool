// findLCG.test.ts

import { findLCG, findCommonAncestor } from "../mutations";
import { ElkGraphNode, NodeID } from "../../../types/graph";

// Helper function to find a node by ID (for test assertions)
function findNodeById(node: ElkGraphNode, id: NodeID): ElkGraphNode | null {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

describe("findLCG", () => {
  let graph: ElkGraphNode;

  // Test graph structure:
  // root
  //   ├─ ui
  //   │   └─ webapp
  //   ├─ aws
  //   │   ├─ api
  //   │   ├─ lambda
  //   │   │   ├─ query
  //   │   │   ├─ pdf
  //   │   │   ├─ fetch
  //   │   │   └─ chat
  //   │   ├─ vector
  //   │   └─ storage
  //   └─ openai
  //       ├─ embed
  //       └─ chat_api

  beforeEach(() => {
    graph = {
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
      edges: []
    };
  });

  describe("Matches findCommonAncestor for 2 nodes", () => {
    test("should return same result as findCommonAncestor for nodes in same group", () => {
      const lcg = findLCG(graph, ["query", "pdf"]);
      const common = findCommonAncestor(graph, "query", "pdf");
      
      expect(lcg).not.toBeNull();
      expect(common).not.toBeNull();
      expect(lcg?.id).toBe(common?.id);
      expect(lcg?.id).toBe("lambda");
    });

    test("should return same result as findCommonAncestor for nodes in different groups", () => {
      const lcg = findLCG(graph, ["webapp", "api"]);
      const common = findCommonAncestor(graph, "webapp", "api");
      
      expect(lcg).not.toBeNull();
      expect(common).not.toBeNull();
      expect(lcg?.id).toBe(common?.id);
      expect(lcg?.id).toBe("root");
    });

    test("should return same result as findCommonAncestor for deeply nested nodes", () => {
      const lcg = findLCG(graph, ["query", "chat"]);
      const common = findCommonAncestor(graph, "query", "chat");
      
      expect(lcg).not.toBeNull();
      expect(common).not.toBeNull();
      expect(lcg?.id).toBe(common?.id);
      expect(lcg?.id).toBe("lambda");
    });

    test("should return same result as findCommonAncestor for cross-branch nodes", () => {
      const lcg = findLCG(graph, ["webapp", "embed"]);
      const common = findCommonAncestor(graph, "webapp", "embed");
      
      expect(lcg).not.toBeNull();
      expect(common).not.toBeNull();
      expect(lcg?.id).toBe(common?.id);
      expect(lcg?.id).toBe("root");
    });
  });

  describe("Works for 3+ nodes", () => {
    test("should find LCG for 3 nodes in same group", () => {
      const lcg = findLCG(graph, ["query", "pdf", "fetch"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("lambda");
    });

    test("should find LCG for 4 nodes in same group", () => {
      const lcg = findLCG(graph, ["query", "pdf", "fetch", "chat"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("lambda");
    });

    test("should find LCG for 3 nodes in different groups under same parent", () => {
      const lcg = findLCG(graph, ["api", "vector", "storage"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("aws");
    });

    test("should find LCG for nodes spanning multiple levels", () => {
      const lcg = findLCG(graph, ["query", "vector", "api"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("aws");
    });

    test("should find root as LCG for nodes in completely different branches", () => {
      const lcg = findLCG(graph, ["webapp", "api", "embed"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });
  });

  describe("Edge cases", () => {
    test("should return null for empty array", () => {
      const lcg = findLCG(graph, []);
      
      expect(lcg).toBeNull();
    });

    test("should return parent for single node", () => {
      const lcg = findLCG(graph, ["query"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("lambda");
    });

    test("should return root for single root-level node", () => {
      // Create a graph with a node at root level
      const rootLevelGraph: ElkGraphNode = {
        id: "root",
        labels: [],
        children: [
          {
            id: "node1",
            labels: [{ text: "Node 1" }]
          }
        ],
        edges: []
      };
      
      const lcg = findLCG(rootLevelGraph, ["node1"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });

    test("should return null when node not found", () => {
      const lcg = findLCG(graph, ["nonexistent"]);
      
      expect(lcg).toBeNull();
    });

    test("should return null when any node in array not found", () => {
      const lcg = findLCG(graph, ["query", "nonexistent", "pdf"]);
      
      expect(lcg).toBeNull();
    });

    test("should handle all nodes at root level", () => {
      const rootLevelGraph: ElkGraphNode = {
        id: "root",
        labels: [],
        children: [
          {
            id: "node1",
            labels: [{ text: "Node 1" }]
          },
          {
            id: "node2",
            labels: [{ text: "Node 2" }]
          },
          {
            id: "node3",
            labels: [{ text: "Node 3" }]
          }
        ],
        edges: []
      };
      
      const lcg = findLCG(rootLevelGraph, ["node1", "node2", "node3"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });

    test("should handle deeply nested structure", () => {
      const deepGraph: ElkGraphNode = {
        id: "root",
        labels: [],
        children: [
          {
            id: "level1",
            labels: [{ text: "Level 1" }],
            children: [
              {
                id: "level2",
                labels: [{ text: "Level 2" }],
                children: [
                  {
                    id: "level3",
                    labels: [{ text: "Level 3" }],
                    children: [
                      {
                        id: "level4a",
                        labels: [{ text: "Level 4a" }]
                      },
                      {
                        id: "level4b",
                        labels: [{ text: "Level 4b" }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ],
        edges: []
      };
      
      const lcg = findLCG(deepGraph, ["level4a", "level4b"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("level3");
    });
  });
});





