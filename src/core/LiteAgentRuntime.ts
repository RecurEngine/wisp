import type {
  LiteAgentMessage,
  LiteAgentImageAttachment,
  LiteAgentProvider,
  LiteAgentRuntimeEvent,
  LiteAgentToolCall,
  LiteAgentToolResult
} from "./LiteAgentTypes";
import { LiteAgentToolRegistry } from "./LiteAgentToolRegistry";

const DEFAULT_MAX_STEPS = 6;

export interface LiteAgentRunOptions {
  readonly history?: readonly LiteAgentMessage[];
  readonly attachments?: readonly LiteAgentImageAttachment[];
  readonly signal?: AbortSignal;
  readonly maxSteps?: number;
  readonly approveTool?: (toolName: string, args: unknown) => Promise<boolean>;
}

export interface LiteAgentRuntimeDeps {
  readonly loadImage?: (attachment: LiteAgentImageAttachment) => Promise<string | null>;
}

export class LiteAgentRuntime {
  constructor(
    private readonly provider: LiteAgentProvider,
    private readonly tools: LiteAgentToolRegistry,
    private readonly systemPrompt = "You are a helpful assistant with access to an Obsidian vault.",
    private readonly deps: LiteAgentRuntimeDeps = {}
  ) {}

  async *run(input: string, options: LiteAgentRunOptions = {}): AsyncIterable<LiteAgentRuntimeEvent> {
    const messages: LiteAgentMessage[] = [];
    if (this.systemPrompt.trim()) messages.push({ role: "system", content: this.systemPrompt.trim() });
    messages.push(...(options.history ?? []));
    const attachments = options.attachments ?? [];
    messages.push({ role: "user", content: input, ...(attachments.length > 0 ? { attachments } : {}) });

    const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
    for (let step = 0; step < maxSteps; step += 1) {
      if (options.signal?.aborted) return;

      const assistantText: string[] = [];
      const toolCalls: LiteAgentToolCall[] = [];

      try {
        for await (const event of this.provider.stream({
          messages,
          tools: this.tools.list(),
          ...(this.deps.loadImage ? { loadImage: this.deps.loadImage } : {}),
          signal: options.signal
        })) {
          if (options.signal?.aborted) return;
          if (event.type === "text") {
            assistantText.push(event.text);
            yield event;
          } else if (event.type === "tool_call") {
            toolCalls.push(event);
          }
        }
      } catch (error) {
        if (options.signal?.aborted) return;
        yield {
          type: "error",
          message: error instanceof Error ? error.message : "Provider request failed",
          details: error instanceof Error ? error.stack : String(error)
        };
        yield { type: "done" };
        return;
      }

      if (toolCalls.length === 0) {
        yield { type: "done" };
        return;
      }

      messages.push({ role: "assistant", content: assistantText.join(""), toolCalls });
      let approvalDenied = false;

      for (const call of toolCalls) {
        if (options.signal?.aborted) return;
        const tool = this.tools.get(call.name);
        const mutates = tool?.mutates ?? false;
        yield { type: "tool_call", id: call.id, name: call.name, arguments: call.arguments, mutates };

        let result: LiteAgentToolResult;
        if (!tool) {
          result = { ok: false, error: `Unknown tool: ${call.name}` };
        } else if (tool.mutates && !(await options.approveTool?.(tool.name, call.arguments) ?? false)) {
          result = { ok: false, error: "User approval required" };
          approvalDenied = true;
        } else {
          try {
            result = await tool.execute(call.arguments, options.signal);
          } catch (error) {
            result = {
              ok: false,
              error: error instanceof Error ? error.name || "Tool error" : "Tool error",
              details: error instanceof Error ? error.message : String(error)
            };
          }
        }

        yield { type: "tool_result", id: call.id, name: call.name, result };
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(result)
        });
      }

      if (approvalDenied) {
        yield { type: "done" };
        return;
      }
    }

    yield { type: "error", message: "The agent reached its step limit." };
    yield { type: "done" };
  }
}
