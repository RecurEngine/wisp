import type { Plugin } from "obsidian";
import type { LiteAgentImageAttachment, LiteAgentMessage } from "../core/LiteAgentTypes";
import { safeVaultPath } from "../tools/VaultPath";

const DEFAULT_TITLE = "New chat";

export interface WispSession {
  readonly id: string;
  title: string;
  readonly createdAt: number;
  updatedAt: number;
  history: LiteAgentMessage[];
}

interface PersistedSession {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
  readonly history?: unknown;
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

  async clearHistory(id: string): Promise<boolean> {
    const session = this.sessions.find((candidate) => candidate.id === id);
    if (!session) return false;
    session.history = [];
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
      history: []
    };
  }

  private async persist(): Promise<void> {
    const current = await this.plugin.loadData();
    const base = isRecord(current) ? current : {};
    await this.plugin.saveData({
      ...base,
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
  return {
    id: persisted.id,
    title: typeof persisted.title === "string" && persisted.title.trim() ? persisted.title.trim() : DEFAULT_TITLE,
    createdAt,
    updatedAt,
    history: Array.isArray(persisted.history) ? sanitizeHistory(persisted.history) : []
  };
}

function sanitizeHistory(history: readonly LiteAgentMessage[] | readonly unknown[]): LiteAgentMessage[] {
  return history.flatMap((value) => {
    if (!isRecord(value) || (value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") return [];
    const attachments = sanitizeAttachments(value.attachments);
    return [{
      role: value.role,
      content: value.content,
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
