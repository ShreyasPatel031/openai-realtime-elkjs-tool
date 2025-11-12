import { validateGraphInvariants } from "../client/state/viewStateOrchestrator";
import type { RawGraph } from "../client/components/graph/types";

describe("validateGraphInvariants", () => {
  it("returns ok for a well-formed graph", () => {
    const graph: RawGraph = {
      id: "root",
      children: [
        {
          id: "group-1",
          type: "group",
          children: [
            {
              id: "node-1",
              type: "node",
            } as any,
          ],
        } as any,
      ],
    };

    const result = validateGraphInvariants(graph);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects duplicate ids across the graph", () => {
    const graph: RawGraph = {
      id: "root",
      children: [
        { id: "node-1", type: "node" } as any,
        { id: "node-1", type: "node" } as any,
      ],
    };

    const result = validateGraphInvariants(graph);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Duplicate id "node-1"')]));
  });

  it("flags edges declared at the root level", () => {
    const graph: RawGraph = {
      id: "root",
      edges: [
        {
          id: "edge-1",
          type: "edge",
          sources: ["node-a"],
          targets: ["node-b"],
        } as any,
      ],
    };

    const result = validateGraphInvariants(graph);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Edge "edge-1" declared at root')])
    );
  });
});
