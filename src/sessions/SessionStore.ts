import { closePendingCalls, type AgentRun } from "../core/AgentRun";
import type { Plugin } from "obsidian";
import type { LiteAgentImageAttachment, LiteAgentMessage } from "../core/LiteAgentTypes";
import { patchPluginData } from "../storage/PluginData";
import { safeVaultPath } from "../tools/VaultPath";

const DEFAULT_TITLE = "New chat";

export interface WispSession {
  readonly id: string;
  title: string;
  readonly createdAt: number;
  updatedAt: number;
  history: LiteAgentMessage[];
  runs: AgentRun[];
}

interface PersistedSession {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
  readonly history?: unknown;
  readonly runs?: unknown;
}

export class SessionStore {
  private sessions: WispSession[] = [];
  private activeSessionId = "";

  constructor(private readonly plugin: Plugin, private readonly now: () => number = () => Date.now()) {}

  async load(): Promise<void> {
    const data = await this.plugin.loadData();
    const persisted = isRecord(data) ? data : {};
    const sessions = Array.isArray(persisted.sessions)
      ? persisted.sessions.map((value) => readSession(value)).filter((value): value is WispSession => value !== null)
      : [];
    this.sessions = sessions.length > 0 ? sessions : [this.createSession()];
    const requestedActiveId = typeof persisted.activeSessionId === "string" ? persisted.activeSessionId : "";
    this.activeSessionId = this.sessions.some((session) => session.id === requestedActiveId)
      ? requestedActiveId
      : this.sessions[0].id;
    if (sessions.length === 0) await this.persist();
  }

  list(): WispSession[] {
    return [...this.sessions];
  }

  active(): WispSession {
    return this.sessions.find((session) => session.id === this.activeSessionId) ?? this.sessions[0];
  }

  async create(): Promise<WispSession> {
    const session = this.createSession();
    const activeIndex = this.sessions.findIndex((candidate) => candidate.id === this.activeSessionId);
    this.sessions.splice(activeIndex < 0 ? this.sessions.length : activeIndex + 1, 0, session);
    this.activeSessionId = session.id;
    await this.persist();
    return session;
  }

  async delete(id: string): Promise<boolean> {
    if (this.sessions.length <= 1) return false;
    const index = this.sessions.findIndex((session) => session.id === id);
    if (index < 0) return false;

    const wasActive = this.activeSessionId === id;
    this.sessions.splice(index, 1);
    if (wasActive) {
      const nextIndex = Math.min(index, this.sessions.length - 1);
      this.activeSessionId = this.sessions[nextIndex].id;
    }
    await this.persist();
    return true;
  }

  async reorder(id: string, targetIndex: number): Promise<boolean> {
    const currentIndex = this.sessions.findIndex((session) => session.id === id);
    if (currentIndex < 0 || this.sessions.length <= 1) return false;
    const boundedIndex = Math.min(Math.max(Math.floor(targetIndex), 0), this.sessions.length - 1);
    if (currentIndex === boundedIndex) return true;

    const [session] = this.sessions.splice(currentIndex, 1);
    this.sessions.splice(boundedIndex, 0, session);
    await this.persist();
    return true;
  }

  async switchTo(id: string): Promise<boolean> {
    if (!this.sessions.some((session) => session.id === id)) return false;
    this.activeSessionId = id;
    await this.persist();
    return true;
  }

  async updateHistory(id: string, history: readonly LiteAgentMessage[]): Promise<void> {
    const session = this.sessions.find((candidate) => candidate.id === id);
    if (!session) return;
    session.history = sanitizeHistory(history);
    session.updatedAt = this.now();
    if (session.title === DEFAULT_TITLE) {
      const firstUserMessage = session.history.find((message) => message.role === "user");
      if (firstUserMessage) session.title = toTitle(firstUserMessage.content);
    }
    await this.persist();
  }

  conversationHistory(id: string): LiteAgentMessage[] {
    const session = this.sessions.find((candidate) => candidate.id === id);
    if (!session) return [];
    const latest = session.runs.at(-1);
    if (!latest) return structuredClone(session.history);
    const snapshot = structuredClone(latest);
    closePendingCalls(snapshot);
    return sanitizeHistory(snapshot.messages);
  }

  async saveRun(id: string, run: AgentRun): Promise<void> {
    const session = this.sessions.find((candidate) => candidate.id === id);
    if (!session) throw new Error("Session no longer exists");
    const previous = structuredClone(session);
    const snapshot = structuredClone(run);
    const index = session.runs.findIndex((candidate) => candidate.id === run.id);
    if (index < 0) session.runs.push(snapshot);
    else session.runs[index] = snapshot;
    session.history = sanitizeHistory(run.messages);
    session.updatedAt = this.now();
    if (session.title === DEFAULT_TITLE) session.title = toTitle(run.input);
    try { await this.persist(); }
    catch (error) { Object.assign(session, previous); throw error; }
  }

  async clearHistory(id: string): Promise<boolean> {
    const session = this.sessions.find((candidate) => candidate.id === id);
    if (!session) return false;
    session.history = [];
    session.runs = [];
    session.updatedAt = this.now();
    await this.persist();
    return true;
  }

  async rename(id: string, title: string): Promise<void> {
    const session = this.sessions.find((candidate) => candidate.id === id);
    if (!session) return;
    session.title = toTitle(title);
    session.updatedAt = this.now();
    await this.persist();
  }

  private createSession(): WispSession {
    const timestamp = this.now();
    return {
      id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      title: DEFAULT_TITLE,
      createdAt: timestamp,
      updatedAt: timestamp,
      runs: [],
      history: []
    };
  }

  private async persist(): Promise<void> {
    await patchPluginData(this.plugin, {
      sessions: this.sessions,
      activeSessionId: this.activeSessionId
    });
  }
}

function readSession(value: unknown): WispSession | null {
  if (!isRecord(value)) return null;
  const persisted = value as PersistedSession;
  if (typeof persisted.id !== "string" || !persisted.id) return null;
  const createdAt = typeof persisted.createdAt === "number" ? persisted.createdAt : Date.now();
  const updatedAt = typeof persisted.updatedAt === "number" ? persisted.updatedAt : createdAt;
  const runs = Array.isArray(persisted.runs) ? persisted.runs.filter(isAgentRun).map((value) => {
    const run = structuredClone(value);
    if (run.status === "running") run.status = "stopped";
    closePendingCalls(run);
    return run;
  }) : [];
  return {
    id: persisted.id,
    title: typeof persisted.title === "string" && persisted.title.trim() ? persisted.title.trim() : DEFAULT_TITLE,
    createdAt,
    updatedAt,
    runs,
    history: runs.length > 0 ? sanitizeHistory(runs[runs.length - 1].messages) : Array.isArray(persisted.history) ? sanitizeHistory(persisted.history) : []
  };
}

function sanitizeHistory(history: readonly LiteAgentMessage[] | readonly unknown[]): LiteAgentMessage[] {
  return history.flatMap((value): LiteAgentMessage[] => {
    if (!isRecord(value) || !["user", "assistant", "tool"].includes(String(value.role)) || typeof value.content !== "string") return [];
    if (value.role === "tool") {
      if (typeof value.toolCallId !== "string" || typeof value.name !== "string") return [];
      return [{ role: "tool", content: value.content, toolCallId: value.toolCallId, name: value.name }];
    }
    const toolCalls = Array.isArray(value.toolCalls) ? value.toolCalls.filter((call) => isRecord(call) && typeof call.id === "string" && typeof call.name === "string") : [];
    const attachments = sanitizeAttachments(value.attachments);
    return [{
      role: value.role as "user" | "assistant",
      content: value.content,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(attachments.length > 0 ? { attachments } : {})
    }];
  });
}

function sanitizeAttachments(value: unknown): LiteAgentImageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((attachment) => {
    if (!isRecord(attachment) || attachment.type !== "image") return [];
    if (typeof attachment.path !== "string" || typeof attachment.name !== "string" || typeof attachment.mimeType !== "string") return [];
    const path = safeVaultPath(attachment.path);
    if (!path || !attachment.name.trim() || !attachment.mimeType.toLowerCase().startsWith("image/")) return [];
    return [{ type: "image", path, name: attachment.name.trim(), mimeType: attachment.mimeType.toLowerCase() }];
  });
}

function toTitle(value: string): string {
  const title = value.trim().replace(/\s+/g, " ");
  return title ? title.slice(0, 60) : DEFAULT_TITLE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentRun(value: unknown): value is AgentRun {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.input !== "string") return false;
  if (!["running", "completed", "failed", "stopped"].includes(String(value.status))) return false;
  if (!Array.isArray(value.messages) || !Array.isArray(value.operations)) return false;
  return value.messages.every((message) => isRecord(message) && typeof message.content === "string" && ["user", "assistant", "tool"].includes(String(message.role)))
    && value.operations.every((operation) => isRecord(operation) && isRecord(operation.call)
      && typeof operation.call.id === "string" && typeof operation.call.name === "string"
      && typeof operation.mutates === "boolean" && ["planned", "running", "succeeded", "failed", "denied", "skipped"].includes(String(operation.status)));
}
