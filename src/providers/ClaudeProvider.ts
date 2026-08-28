import type {
  LiteAgentMessage,
  LiteAgentProvider,
  LiteAgentProviderEvent,
  LiteAgentProviderRequest,
  LiteAgentToolDefinition
} from "../core/LiteAgentTypes";

export interface ClaudeProviderConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly apiVersion?: string;
  readonly maxTokens?: number;
}

interface ToolUseAccumulator {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  inputJson: string;
}

type ClaudeFinishReason = "stop" | "tool_calls" | "length" | "unknown";

export class ClaudeProvider implements LiteAgentProvider {
  constructor(private readonly config: ClaudeProviderConfig) {}

  async *stream(request: LiteAgentProviderRequest): AsyncIterable<LiteAgentProviderEvent> {
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/v1/messages`;
    const converted = toClaudeRequest(request.messages, request.tools);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        "anthropic-dangerous-direct-browser-access": "true",
        "anthropic-version": this.config.apiVersion ?? "2023-06-01",
        Authorization: `Bearer ${this.config.apiKey}`,
        "x-api-key": this.config.apiKey
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens ?? 4096,
        messages: converted.messages,
        ...(converted.system ? { system: converted.system } : {}),
        ...(converted.tools.length > 0 ? { tools: converted.tools } : {}),
        stream: true
      }),
      signal: request.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude request failed (${response.status}): ${errorText.slice(0, 240)}`);
    }
    if (!response.body) throw new Error("Claude returned an empty stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolUses = new Map<number, ToolUseAccumulator>();
    let buffer = "";
    let finishReason: ClaudeFinishReason = "unknown";

    try {
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
        const frames = takeSseFrames(buffer);
        buffer = frames.rest;

        for (const frame of frames.frames) {
          const event = parseClaudeEvent(frame.data);
          if (!event) continue;
          if (event.type === "error") {
            throw new Error(`Claude stream error: ${event.message}`);
          }
          if (event.type === "content_block_start") {
            const block = event.contentBlock;
            if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
              yield { type: "text", text: block.text };
            }
            if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
              toolUses.set(event.index, {
                index: event.index,
                id: block.id,
                name: block.name,
                inputJson: isRecord(block.input) && Object.keys(block.input).length > 0 ? JSON.stringify(block.input) : ""
              });
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta" && typeof event.delta.text === "string" && event.delta.text.length > 0) {
              yield { type: "text", text: event.delta.text };
            } else if (event.delta.type === "input_json_delta") {
              const toolUse = toolUses.get(event.index);
              const partialJson = event.delta.partial_json;
              if (toolUse && typeof partialJson === "string") toolUse.inputJson += partialJson;
            }
          } else if (event.type === "message_delta") {
            finishReason = mapFinishReason(event.stopReason);
          }
        }

        if (chunk.done) break;
      }
    } finally {
      await reader.cancel();
    }

    for (const toolUse of [...toolUses.values()].sort((left, right) => left.index - right.index)) {
      yield toProviderToolCall(toolUse);
    }
    yield { type: "done", finishReason: toolUses.size > 0 ? "tool_calls" : finishReason };
  }
}

function toClaudeRequest(
  messages: readonly LiteAgentMessage[],
  tools: readonly LiteAgentToolDefinition[]
): {
  readonly system: string;
  readonly messages: Array<{ role: "user" | "assistant"; content: string | Array<Record<string, unknown>> }>;
  readonly tools: Array<Record<string, unknown>>;
} {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const converted: ClaudeMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: message.content
          }
        ]
      });
      continue;
    }
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      const content: ClaudeContentBlock[] = [];
      if (message.content) content.push({ type: "text", text: message.content });
      for (const call of message.toolCalls) {
        content.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: isRecord(call.arguments) ? call.arguments : { value: call.arguments }
        });
      }
      converted.push({ role: "assistant", content });
      continue;
    }
    converted.push({ role: message.role, content: message.content });
  }

  return {
    system,
    messages: mergeToolResultMessages(converted),
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }))
  };
}

function mergeToolResultMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
  const merged: ClaudeMessage[] = [];
  for (const message of messages) {
    const last = merged.at(-1);
    const isToolResultMessage = Array.isArray(message.content) && message.content.every((block) => block.type === "tool_result");
    const canMerge =
      isToolResultMessage &&
      last?.role === "user" &&
      Array.isArray(last.content) &&
      last.content.every((block) => block.type === "tool_result");
    if (canMerge) {
      last.content.push(...message.content as ClaudeContentBlock[]);
    } else {
      merged.push(message);
    }
  }
  return merged;
}

function toProviderToolCall(toolUse: ToolUseAccumulator): LiteAgentProviderEvent {
  let args: unknown = {};
  try {
    args = toolUse.inputJson ? JSON.parse(toolUse.inputJson) : {};
  } catch {
    args = { rawArguments: toolUse.inputJson, parseError: true };
  }
  return {
    type: "tool_call",
    id: toolUse.id,
    name: toolUse.name,
    arguments: args,
    rawArguments: toolUse.inputJson
  };
}

interface ClaudeSseFrame {
  readonly event: string;
  readonly data: string;
}

type ClaudeContentBlock = Record<string, unknown>;
type ClaudeMessage = {
  readonly role: "user" | "assistant";
  readonly content: string | ClaudeContentBlock[];
};

function takeSseFrames(input: string): { frames: ClaudeSseFrame[]; rest: string } {
  const normalized = input.replaceAll("\r\n", "\n");
  const frames: ClaudeSseFrame[] = [];
  let rest = normalized;
  while (true) {
    const separator = rest.indexOf("\n\n");
    if (separator < 0) break;
    const raw = rest.slice(0, separator);
    rest = rest.slice(separator + 2);
    const event = raw.match(/^event:\s*(.+)$/m)?.[1]?.trim() ?? "";
    const data = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data) frames.push({ event, data });
  }
  return { frames, rest };
}

type ClaudeEvent =
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "content_block_start"; readonly index: number; readonly contentBlock: Record<string, unknown> }
  | { readonly type: "content_block_delta"; readonly index: number; readonly delta: Record<string, unknown> }
  | { readonly type: "message_delta"; readonly stopReason?: string };

function parseClaudeEvent(data: string): ClaudeEvent | null {
  const parsed = parseJson(data);
  if (!parsed || typeof parsed.type !== "string") return null;
  if (parsed.type === "error") {
    const error = isRecord(parsed.error) ? parsed.error.message : undefined;
    return { type: "error", message: typeof error === "string" ? error : "Unknown Claude error" };
  }
  if (parsed.type === "content_block_start" && typeof parsed.index === "number" && isRecord(parsed.content_block)) {
    return { type: parsed.type, index: parsed.index, contentBlock: parsed.content_block };
  }
  if (parsed.type === "content_block_delta" && typeof parsed.index === "number" && isRecord(parsed.delta)) {
    return { type: parsed.type, index: parsed.index, delta: parsed.delta };
  }
  if (parsed.type === "message_delta") {
    const delta = isRecord(parsed.delta) ? parsed.delta : {};
    return {
      type: parsed.type,
      stopReason: typeof delta.stop_reason === "string" ? delta.stop_reason : undefined
    };
  }
  return null;
}

function mapFinishReason(reason: string | undefined): ClaudeFinishReason {
  if (reason === "end_turn") return "stop";
  if (reason === "tool_use") return "tool_calls";
  if (reason === "max_tokens") return "length";
  return "unknown";
}

function parseJson(input: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(input);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
