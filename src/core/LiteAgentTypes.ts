export type LiteAgentRole = "system" | "user" | "assistant" | "tool";

export interface LiteAgentToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: unknown;
  readonly rawArguments?: string;
}

export interface LiteAgentMessage {
  readonly role: LiteAgentRole;
  readonly content: string;
  readonly attachments?: readonly LiteAgentImageAttachment[];
  readonly toolCalls?: readonly LiteAgentToolCall[];
  readonly toolCallId?: string;
  readonly name?: string;
}

export interface LiteAgentImageAttachment {
  readonly type: "image";
  readonly path: string;
  readonly name: string;
  readonly mimeType: string;
}

export function formatImageAttachmentContext(attachments: readonly LiteAgentImageAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return "";
  const files = attachments
    .map((attachment) => `- ${attachment.name} (${attachment.mimeType}) — Vault path: ${attachment.path}`)
    .join("\n");
  return `Attached image files. The Vault paths below are authoritative and can be passed to insert_image_into_note:\n${files}`;
}

export interface LiteAgentJsonSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, LiteAgentJsonSchemaProperty>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

export interface LiteAgentJsonSchemaProperty {
  readonly type: "string" | "number" | "integer" | "boolean" | "object" | "array";
  readonly description?: string;
  readonly items?: LiteAgentJsonSchemaProperty;
  readonly properties?: Readonly<Record<string, LiteAgentJsonSchemaProperty>>;
  readonly required?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface LiteAgentToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: LiteAgentJsonSchema;
  readonly mutates: boolean;
  execute(args: unknown, signal?: AbortSignal): Promise<LiteAgentToolResult>;
}

export type LiteAgentToolResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string; readonly details?: unknown };

export interface LiteAgentProviderRequest {
  readonly messages: readonly LiteAgentMessage[];
  readonly tools: readonly LiteAgentToolDefinition[];
  readonly loadImage?: (attachment: LiteAgentImageAttachment) => Promise<string | null>;
  readonly signal?: AbortSignal;
}

export type LiteAgentProviderEvent =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool_call";
      readonly id: string;
      readonly name: string;
      readonly arguments: unknown;
      readonly rawArguments?: string;
    }
  | { readonly type: "done"; readonly finishReason: "stop" | "tool_calls" | "length" | "unknown" };

export interface LiteAgentProvider {
  stream(request: LiteAgentProviderRequest): AsyncIterable<LiteAgentProviderEvent>;
}

export type LiteAgentRuntimeEvent =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool_call";
      readonly id: string;
      readonly name: string;
      readonly arguments: unknown;
      readonly mutates: boolean;
    }
  | { readonly type: "tool_result"; readonly id: string; readonly name: string; readonly result: LiteAgentToolResult }
  | { readonly type: "status"; readonly text: string }
  | { readonly type: "error"; readonly message: string; readonly details?: string }
  | { readonly type: "done" };
