import type { LiteAgentToolDefinition, LiteAgentToolResult } from "../core/LiteAgentTypes";

export function createCurrentTimeTool(): LiteAgentToolDefinition {
  return {
    name: "get_current_time",
    description: "Return the real current date and time on this device, in the local timezone and UTC. Use this whenever content references the current date or time, because a conversation can span multiple days.",
    parameters: {
      type: "object",
      properties: {}
    },
    mutates: false,
    execute(): Promise<LiteAgentToolResult> {
      const now = new Date();
      return Promise.resolve({
        ok: true,
        value: {
          iso: now.toISOString(),
          local: now.toString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      });
    }
  };
}
