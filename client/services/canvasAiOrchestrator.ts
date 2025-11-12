import type { RawGraph } from "../components/graph/types";

export interface AiMutationOperation {
  type: string;
  payload: unknown;
}

export interface AiMutationContext {
  scopeId: string;
  operations: AiMutationOperation[];
}

export interface AiOrchestratorOptions {
  runScopeLayout: (scopeId: string) => Promise<void>;
  applyDomainMutations: (operations: AiMutationOperation[]) => Promise<RawGraph>;
}

export class CanvasAiOrchestrator {
  constructor(private readonly options: AiOrchestratorOptions) {}

  async applyAiMutations(context: AiMutationContext): Promise<RawGraph> {
    const graph = await this.options.applyDomainMutations(context.operations);
    await this.options.runScopeLayout(context.scopeId);
    return graph;
  }
}
