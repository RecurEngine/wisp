import type { LiteAgentMessage, LiteAgentToolCall, LiteAgentToolResult } from "./LiteAgentTypes";

export interface AgentOperation {
  call: LiteAgentToolCall;
  mutates: boolean;
  status: "planned" | "running" | "succeeded" | "failed" | "denied" | "skipped";
  result?: LiteAgentToolResult;
}

export interface AgentRun {
  id: string;
  input: string;
  status: "running" | "completed" | "failed" | "stopped";
  messages: LiteAgentMessage[];
  operations: AgentOperation[];
  error?: string;
}

export function hasUncertainWrites(run: AgentRun): boolean {
  return run.operations.some((operation) => operation.mutates && operation.status === "running");
}

/** Close unfulfilled tool calls before asking the model to continue. Never replay them. */
export function closePendingCalls(run: AgentRun): void {
  for (const operation of run.operations) {
    if (operation.status !== "planned" && operation.status !== "running") continue;
    const result: LiteAgentToolResult = { ok: false, error: operation.status === "running"
      ? "Execution interrupted; outcome unknown. Inspect the file before making any further change."
      : "Not executed: task interrupted. Reassess remaining work before requesting this operation again." };
    if (operation.status === "running" && operation.mutates) {
      if (operation.result) continue;
    } else operation.status = "skipped";
    operation.result = result;
    run.messages.push({ role: "tool", toolCallId: operation.call.id, name: operation.call.name, content: JSON.stringify(result) });
  }
}
