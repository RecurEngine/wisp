import type { LiteAgentJsonSchema, LiteAgentToolDefinition } from "./LiteAgentTypes";

export interface LiteAgentProviderTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: LiteAgentJsonSchema;
}

export class LiteAgentToolRegistry {
  private readonly tools = new Map<string, LiteAgentToolDefinition>();

  register(tool: LiteAgentToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: readonly LiteAgentToolDefinition[]): void {
    for (const tool of tools) this.register(tool);
  }

  get(name: string): LiteAgentToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): LiteAgentToolDefinition[] {
    return [...this.tools.values()];
  }

  toProviderTools(): LiteAgentProviderTool[] {
    return this.list().map(({ name, description, parameters }) => ({ name, description, parameters }));
  }
}

