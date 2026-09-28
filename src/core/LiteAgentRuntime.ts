import type {
  LiteAgentMessage,
  LiteAgentImageAttachment,
  LiteAgentProvider,
  LiteAgentRuntimeEvent,
  LiteAgentToolCall,
  LiteAgentToolResult
} from "./LiteAgentTypes";
import { closePendingCalls, hasUncertainWrites, type AgentRun } from "./AgentRun";
import { LiteAgentToolRegistry } from "./LiteAgentToolRegistry";

export const DEFAULT_MAX_STEPS = 0;

export interface LiteAgentRunOptions {
  readonly resume?: AgentRun;
  readonly onCheckpoint?: (run: AgentRun) => Promise<void>;
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
    if (options.resume && hasUncertainWrites(options.resume)) {
      throw new Error("A previous write has an unknown outcome. Inspect the operation record and file before starting a new request.");
    }
    const run: AgentRun = options.resume ? structuredClone(options.resume) : {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, input, status: "running",
      messages: [...(options.history ?? []), { role: "user", content: input,
        ...((options.attachments?.length ?? 0) > 0 ? { attachments: options.attachments } : {}) }],
      operations: []
    };
    if (options.resume) {
      closePendingCalls(run);
      run.messages.push({ role: "user", content: "Continue the interrupted task using the recorded tool results. Do not repeat successful writes. Read current notes again before further edits." });
    }
    const completedWrites = options.resume?.operations.filter((operation) => operation.mutates && operation.status === "succeeded") ?? [];
    run.status = "running";
    delete run.error;
    const messages = run.messages;
    let persistenceFailed = false;
    const checkpoint = async () => {
      try { await options.onCheckpoint?.(structuredClone(run)); }
      catch (error) { persistenceFailed = true; throw error; }
    };
    await checkpoint();
    try {
      const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
      for (let step = 0; maxSteps === 0 || step < maxSteps; step += 1) {
        if (options.signal?.aborted) return;

        const assistantText: string[] = [];
        const toolCalls: LiteAgentToolCall[] = [];

        try {
          for await (const event of this.provider.stream({
            messages: this.systemPrompt.trim() ? [{ role: "system", content: this.systemPrompt.trim() }, ...messages] : messages,
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
          run.status = "failed";
          run.error = error instanceof Error ? error.message : "Provider request failed";
          yield {
            type: "error",
            message: error instanceof Error ? error.message : "Provider request failed",
            details: error instanceof Error ? error.stack : String(error)
          };
          yield { type: "done" };
          return;
        }

        if (toolCalls.length === 0) {
          messages.push({ role: "assistant", content: assistantText.join("") });
          run.status = "completed";
          yield { type: "done" };
          return;
        }

        messages.push({ role: "assistant", content: assistantText.join(""), toolCalls });
        const operations = toolCalls.map((call) => ({ call, mutates: this.tools.get(call.name)?.mutates ?? false, status: "planned" as const }));
        run.operations.push(...operations);
        await checkpoint();
        let approvalDenied = false;

        for (const operation of run.operations.slice(-toolCalls.length)) {
          const call = operation.call;
          if (options.signal?.aborted) return;
          const tool = this.tools.get(call.name);
          const mutates = tool?.mutates ?? false;
          yield { type: "tool_call", id: call.id, name: call.name, arguments: call.arguments, mutates };

          let result: LiteAgentToolResult;
          let uncertain = false;
          const previousWrite = tool?.mutates ? completedWrites.find((previous) => previous.call.name === call.name && stableArguments(previous.call.arguments) === stableArguments(call.arguments)) : undefined;
          if (previousWrite?.result) {
            result = previousWrite.result;
          } else if (!tool) {
            result = { ok: false, error: `Unknown tool: ${call.name}` };
          } else if (tool.mutates && !(await options.approveTool?.(tool.name, call.arguments) ?? false)) {
            result = { ok: false, error: "User approval required" };
            approvalDenied = true;
            operation.status = "denied";
          } else {
            if (options.signal?.aborted) return;
            operation.status = "running";
            await checkpoint();
            if (options.signal?.aborted) { operation.status = "planned"; return; }
            try {
              result = await tool.execute(call.arguments, options.signal);
            } catch (error) {
              uncertain = tool.mutates;
              result = {
                ok: false,
                error: error instanceof Error ? error.name || "Tool error" : "Tool error",
                details: error instanceof Error ? error.message : String(error)
              };
            }
          }

          operation.result = result;
          if (!uncertain && operation.status !== "denied") operation.status = result.ok ? "succeeded" : "failed";
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify(result)
          });
          await checkpoint();
          yield { type: "tool_result", id: call.id, name: call.name, result };
          if (uncertain) {
            run.status = "failed";
            run.error = "A write has an unknown outcome. Inspect the operation record and file before starting a new request.";
            yield { type: "error", message: run.error };
            yield { type: "done" };
            return;
          }
          if (approvalDenied) break;
        }

        if (approvalDenied) {
          run.status = "stopped";
          yield { type: "done" };
          return;
        }
      }

      run.status = "failed";
      run.error = "Step limit reached";
      yield { type: "error", code: "step_limit", message: "The agent reached its step limit. Completed operations remain in effect. You can increase the maximum steps in Wisp settings." };
      yield { type: "done" };
    } finally {
      if (run.status === "running") run.status = options.signal?.aborted ? "stopped" : "failed";
      if (!persistenceFailed) {
        closePendingCalls(run);
        await checkpoint();
      }
    }
  }
}

function stableArguments(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableArguments).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableArguments(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
