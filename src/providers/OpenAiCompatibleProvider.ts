import type {
  LiteAgentMessage,
  LiteAgentProvider,
  LiteAgentProviderEvent,
  LiteAgentProviderRequest,
  LiteAgentToolDefinition
} from "../core/LiteAgentTypes";

export interface OpenAiCompatibleConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

interface ToolCallAccumulator {
  readonly id: string;
  readonly name: string;
  arguments: string;
}

type OpenAiFinishReason = "stop" | "tool_calls" | "length" | "unknown";

export class OpenAiCompatibleProvider implements LiteAgentProvider {
  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async testConnection(): Promise<void> {
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: "user", content: "Reply with OK." }],
        max_tokens: 1,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Provider connection test failed (${response.status}): ${errorText.slice(0, 240)}`);
    }
  }

  async *stream(request: LiteAgentProviderRequest): AsyncIterable<LiteAgentProviderEvent> {
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: request.messages.map(toOpenAiMessage),
        tools: request.tools.length > 0 ? request.tools.map(toOpenAiTool) : undefined,
        tool_choice: request.tools.length > 0 ? "auto" : undefined,
        stream: true
      }),
      signal: request.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Provider request failed (${response.status}): ${errorText.slice(0, 240)}`);
    }
    if (!response.body) throw new Error("Provider returned an empty stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const toolCalls = new Map<number, ToolCallAccumulator>();
    let buffer = "";
    let finishReason: OpenAiFinishReason = "unknown";
    let streamEnded = false;

    try {
      while (!streamEnded) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
        const frames = takeSseFrames(buffer);
        buffer = frames.rest;

        for (const data of frames.data) {
          if (data === "[DONE]") {
            streamEnded = true;
            break;
          }

          const parsed = parseJson(data);
          if (!parsed) continue;
          const choice = firstChoice(parsed);
          if (!choice) continue;

          if (choice.finishReason) finishReason = mapFinishReason(choice.finishReason);
          const content = choice.delta?.content;
          if (typeof content === "string" && content.length > 0) yield { type: "text", text: content };

          for (const toolCall of choice.delta?.toolCalls ?? []) {
            const previous = toolCalls.get(toolCall.index) ?? {
              id: toolCall.id ?? `tool-call-${toolCall.index}`,
              name: "",
              arguments: ""
            };
            toolCalls.set(toolCall.index, {
              id: toolCall.id ?? previous.id,
              name: toolCall.name ?? previous.name,
              arguments: previous.arguments + (toolCall.arguments ?? "")
            });
          }
        }

        if (chunk.done) streamEnded = true;
      }
    } finally {
      await reader.cancel();
    }

    for (const call of [...toolCalls.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      yield toProviderToolCall(call);
    }
    yield { type: "done", finishReason: toolCalls.size > 0 ? "tool_calls" : finishReason };
  }
}

function toOpenAiMessage(message: LiteAgentMessage): Record<string, unknown> {
  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: call.rawArguments ?? JSON.stringify(call.arguments)
        }
      }))
    };
  }

  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      name: message.name,
      content: message.content
    };
  }

  return { role: message.role, content: message.content };
}

function toOpenAiTool(tool: LiteAgentToolDefinition): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
}

function toProviderToolCall(call: ToolCallAccumulator): LiteAgentProviderEvent {
  let args: unknown = {};
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    args = { rawArguments: call.arguments, parseError: true };
  }
  return { type: "tool_call", id: call.id, name: call.name, arguments: args, rawArguments: call.arguments };
}

function takeSseFrames(input: string): { data: string[]; rest: string } {
  const normalized = input.replaceAll("\r\n", "\n");
  const data: string[] = [];
  let rest = normalized;

  while (true) {
    const separator = rest.indexOf("\n\n");
    if (separator < 0) break;
    const frame = rest.slice(0, separator);
    rest = rest.slice(separator + 2);
    const lines = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (lines.length > 0) data.push(lines.join("\n"));
  }

  return { data, rest };
}

interface ParsedChoice {
  readonly finishReason?: string | null;
  readonly delta?: {
    readonly content?: unknown;
    readonly toolCalls?: Array<{
      readonly index: number;
      readonly id?: string;
      readonly name?: string;
      readonly arguments?: string;
    }>;
  };
}

function parseJson(input: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(input);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function firstChoice(input: Record<string, unknown>): ParsedChoice | null {
  if (!Array.isArray(input.choices) || input.choices.length === 0 || !isRecord(input.choices[0])) return null;
  const choice = input.choices[0];
  const delta = isRecord(choice.delta) ? choice.delta : null;
  const rawToolCalls = delta && Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
  return {
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
    delta: delta
      ? {
          content: delta.content,
          toolCalls: rawToolCalls.flatMap((value) => {
            if (!isRecord(value) || typeof value.index !== "number") return [];
            const fn = isRecord(value.function) ? value.function : {};
            return [
              {
                index: value.index,
                id: typeof value.id === "string" ? value.id : undefined,
                name: typeof fn.name === "string" ? fn.name : undefined,
                arguments: typeof fn.arguments === "string" ? fn.arguments : undefined
              }
            ];
          })
        }
      : undefined
  };
}

function mapFinishReason(reason: string): "stop" | "tool_calls" | "length" | "unknown" {
  if (reason === "stop" || reason === "tool_calls" || reason === "length") return reason;
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
