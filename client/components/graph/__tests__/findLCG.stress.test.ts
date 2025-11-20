// findLCG.stress.test.ts - Real production edge cases

import { findLCG } from "../mutations";
import { ElkGraphNode, NodeID } from "../../../types/graph";

describe("findLCG - Production Edge Cases", () => {
  let graph: ElkGraphNode;

  beforeEach(() => {
    graph = {
      id: "root",
      labels: [],
      children: [
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
                  id: "chat",
                  labels: [{ text: "Chat" }]
                }
              ]
            }
          ]
        },
        {
          id: "ui",
          labels: [{ text: "UI" }],
          children: [
            {
              id: "webapp",
              labels: [{ text: "Web App" }]
            }
          ]
        }
      ],
      edges: []
    };
  });

  describe("Edge Case 1: Parent and child selected together", () => {
    test("should handle when user selects a group AND its direct child", () => {
      // Real scenario: User shift-clicks and accidentally selects both aws group and api inside it
      const lcg = findLCG(graph, ["aws", "api"]);
      
      // Expected: LCG should be root (parent of aws), not aws itself
      // Because we need a scope that contains BOTH aws and api as separate entities
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });

    test("should handle when user selects a group AND its deeply nested child", () => {
      // User selects aws AND query (which is deep inside aws)
      const lcg = findLCG(graph, ["aws", "query"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });

    test("should handle multiple groups at different nesting levels", () => {
      // User selects lambda group AND chat (inside lambda)
      const lcg = findLCG(graph, ["lambda", "chat"]);
      
      // LCG should be aws (parent of lambda)
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("aws");
    });
  });

  describe("Edge Case 2: Root node in selection", () => {
    test("should handle root in selection with other nodes", () => {
      // Unlikely but possible: user somehow selects root + other nodes
      const lcg = findLCG(graph, ["root", "api", "webapp"]);
      
      // LCG should be root itself
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });

    test("should handle root as only selection", () => {
      const lcg = findLCG(graph, ["root"]);
      
      // For single node, we return parent (or root if no parent)
      // Root has no parent, so return root
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });
  });

  describe("Edge Case 3: Duplicate IDs in selection", () => {
    test("should handle duplicate node IDs gracefully", () => {
      // User might accidentally include same node twice in selection
      const lcg = findLCG(graph, ["api", "api", "lambda"]);
      
      // Should still work - LCG of [api, lambda] is aws
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("aws");
    });

    test("should handle all duplicates", () => {
      const lcg = findLCG(graph, ["api", "api", "api"]);
      
      // All same node - parent should be aws
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("aws");
    });
  });

  describe("Edge Case 4: Invalid/malformed node IDs", () => {
    test("should handle empty string in selection", () => {
      const lcg = findLCG(graph, ["api", "", "lambda"]);
      
      // Empty string won't be found, should return null
      expect(lcg).toBeNull();
    });

    test("should handle whitespace-only string", () => {
      const lcg = findLCG(graph, ["api", "   ", "lambda"]);
      
      expect(lcg).toBeNull();
    });

    test("should handle mixed valid and invalid IDs", () => {
      const lcg = findLCG(graph, ["api", "nonexistent", "lambda"]);
      
      expect(lcg).toBeNull();
    });

    test("should handle special characters in expected node IDs", () => {
      // Create graph with special char nodes
      const specialGraph: ElkGraphNode = {
        id: "root",
        labels: [],
        children: [
          {
            id: "node-with-dash",
            labels: [{ text: "Node" }]
          },
          {
            id: "node_with_underscore",
            labels: [{ text: "Node" }]
          },
          {
            id: "node.with.dots",
            labels: [{ text: "Node" }]
          }
        ],
        edges: []
      };
      
      const lcg = findLCG(specialGraph, [
        "node-with-dash",
        "node_with_underscore", 
        "node.with.dots"
      ]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });
  });

  describe("Edge Case 5: Sibling groups (all children of same parent)", () => {
    test("should correctly identify parent as LCG for sibling groups", () => {
      // User selects aws and ui - both are direct children of root
      const lcg = findLCG(graph, ["aws", "ui"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });

    test("should handle mix of sibling groups and their children", () => {
      // Select aws group, ui group, and api (child of aws)
      const lcg = findLCG(graph, ["aws", "ui", "api"]);
      
      // All paths converge at root
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });

    test("should handle all children of a group", () => {
      // Select all direct children of aws
      const lcg = findLCG(graph, ["api", "lambda"]);
      
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("aws");
    });
  });

  describe("Edge Case 6: Wrapper section scenario (from spec)", () => {
    test("should find LCG for scattered nodes requiring wrapper", () => {
      // Nodes scattered across different branches with no common parent except root
      const lcg = findLCG(graph, ["api", "webapp"]);
      
      // No common parent except root
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });

    test("should find deeper LCG when nodes share closer ancestor", () => {
      // Nodes within same branch
      const lcg = findLCG(graph, ["query", "chat"]);
      
      // Common parent is lambda, not root
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("lambda");
    });
  });

  describe("Edge Case 7: Graph structure edge cases", () => {
    test("should handle graph with only root and no children", () => {
      const emptyGraph: ElkGraphNode = {
        id: "root",
        labels: [],
        children: [],
        edges: []
      };
      
      const lcg = findLCG(emptyGraph, ["nonexistent"]);
      expect(lcg).toBeNull();
    });

    test("should handle single-level flat graph", () => {
      const flatGraph: ElkGraphNode = {
        id: "root",
        labels: [],
        children: [
          { id: "node1", labels: [{ text: "1" }] },
          { id: "node2", labels: [{ text: "2" }] },
          { id: "node3", labels: [{ text: "3" }] }
        ],
        edges: []
      };
      
      const lcg = findLCG(flatGraph, ["node1", "node2", "node3"]);
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("root");
    });

    test("should handle very deep nesting (10+ levels)", () => {
      // Create deeply nested structure
      let deepGraph: ElkGraphNode = { id: "root", labels: [], children: [], edges: [] };
      let current = deepGraph;
      
      for (let i = 1; i <= 10; i++) {
        const child: ElkGraphNode = {
          id: `level${i}`,
          labels: [{ text: `Level ${i}` }],
          children: [],
          edges: []
        };
        current.children = [child];
        current = child;
      }
      
      // Add two siblings at deepest level
      current.children = [
        { id: "deepA", labels: [{ text: "A" }] },
        { id: "deepB", labels: [{ text: "B" }] }
      ];
      
      const lcg = findLCG(deepGraph, ["deepA", "deepB"]);
      expect(lcg).not.toBeNull();
      expect(lcg?.id).toBe("level10");
    });
  });
});





