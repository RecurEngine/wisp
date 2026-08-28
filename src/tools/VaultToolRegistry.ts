import { App, TFile } from "obsidian";
import { LiteAgentToolRegistry } from "../core/LiteAgentToolRegistry";
import type { LiteAgentToolDefinition, LiteAgentToolResult } from "../core/LiteAgentTypes";
import { safeVaultPath } from "./VaultPath";

const SEARCH_BYTE_BUDGET = 2 * 1024 * 1024;

export function createVaultToolRegistry(app: App): LiteAgentToolRegistry {
  const registry = new LiteAgentToolRegistry();
  registry.registerAll([
    createListNotesTool(app),
    createReadNoteTool(app),
    createSearchVaultTool(app),
    createOpenNoteTool(app),
    createCurrentNoteTool(app),
    createRecentNotesTool(app),
    createNoteMetadataTool(app),
    createNoteLinksTool(app),
    createNoteTool(app),
    createAppendNoteTool(app),
    createUpdateNoteTool(app),
    createEditNoteTool(app)
  ]);
  return registry;
}

function createListNotesTool(app: App): LiteAgentToolDefinition {
  return {
    name: "list_notes",
    description: "List markdown notes in the vault or an optional folder, ordered by most recently modified.",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Optional vault-relative folder" },
        limit: { type: "integer", description: "Maximum notes, from 1 to 100" }
      }
    },
    mutates: false,
    async execute(args): Promise<LiteAgentToolResult> {
      const folderArg = readStringArg(args, "folder");
      const folder = folderArg === undefined ? undefined : safeVaultPath(folderArg);
      if (folderArg !== undefined && folder === null) return failure("folder must stay inside the vault");
      const limit = clampInteger(readNumberArg(args, "limit") ?? 20, 1, 100);
      const candidates = app.vault
        .getMarkdownFiles()
        .filter((file) => !folder || file.path.startsWith(`${folder}/`) || file.path === folder)
        .sort((left, right) => right.stat.mtime - left.stat.mtime);
      const notes = candidates.slice(0, limit).map((file) => ({
        path: file.path,
        size: file.stat.size,
        modifiedAt: file.stat.mtime
      }));
      return success({ notes, truncated: candidates.length > limit });
    }
  };
}

function createReadNoteTool(app: App): LiteAgentToolDefinition {
  return {
    name: "read_note",
    description: "Read a markdown note from the vault by its vault-relative path.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Vault-relative path, for example Notes/Idea.md" } },
      required: ["path"]
    },
    mutates: false,
    async execute(args): Promise<LiteAgentToolResult> {
      const path = readStringArg(args, "path");
      if (!path) return failure("path must be a non-empty string");
      const safePath = safeVaultPath(path);
      if (!safePath) return failure("path must stay inside the vault");
      const file = app.vault.getAbstractFileByPath(safePath);
      if (!(file instanceof TFile)) return failure(`Note not found: ${safePath}`);
      return success({ path: safePath, content: await app.vault.cachedRead(file) });
    }
  };
}

function createSearchVaultTool(app: App): LiteAgentToolDefinition {
  return {
    name: "search_vault",
    description: "Search markdown notes by full-text content and return bounded excerpts.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for" },
        scope: {
          type: "object",
          description: "Optional folder or tag scope",
          properties: {
            folder: { type: "string", description: "Vault-relative folder" },
            tag: { type: "string", description: "Tag, with or without a leading #" },
            limit: { type: "integer", description: "Maximum matches, from 1 to 100" }
          }
        },
        limit: { type: "integer", description: "Maximum matches, from 1 to 100" }
      },
      required: ["query"]
    },
    mutates: false,
    async execute(args): Promise<LiteAgentToolResult> {
      const query = readStringArg(args, "query")?.trim();
      if (!query) return failure("query must be a non-empty string");
      const scope = readRecordArg(args, "scope");
      const folderArg = readStringArg(scope, "folder");
      const folder = folderArg === undefined ? undefined : safeVaultPath(folderArg);
      if (folderArg !== undefined && folder === null) return failure("folder must stay inside the vault");
      const scopeTag = readStringArg(scope, "tag");
      const limit = clampInteger(
        readNumberArg(scope, "limit") ?? readNumberArg(args, "limit") ?? 10,
        1,
        100
      );
      const needle = query.toLocaleLowerCase();
      const matches: Array<{ path: string; line: number; excerpt: string }> = [];
      let bytesScanned = 0;

      const wikilinkMatch = /^\[\[([^\]]+)\]\]$/.exec(query);
      if (wikilinkMatch) {
        const resolved = app.metadataCache.getFirstLinkpathDest(wikilinkMatch[1], "");
        if (resolved instanceof TFile && (!folder || resolved.path.startsWith(`${folder}/`) || resolved.path === folder)) {
          return success({
            matches: [{ path: resolved.path, line: 0, excerpt: "(exact match)" }],
            strategy: "linkpath",
            truncated: false
          });
        }
      }

      const files = app.vault.getMarkdownFiles().filter((file) => {
        if (folder && !file.path.startsWith(`${folder}/`) && file.path !== folder) return false;
        if (!scopeTag) return true;
        const tag = scopeTag.startsWith("#") ? scopeTag : `#${scopeTag}`;
        const cache = app.metadataCache.getFileCache(file);
        const inlineTags = cache?.tags?.map((item) => item.tag) ?? [];
        const frontmatterTags = cache?.frontmatter?.tags;
        const values = Array.isArray(frontmatterTags) ? frontmatterTags.map(String) : typeof frontmatterTags === "string" ? [frontmatterTags] : [];
        return inlineTags.includes(tag) || values.some((value) => (value.startsWith("#") ? value : `#${value}`) === tag);
      });

      for (const file of files) {
        if (matches.length >= limit || bytesScanned >= SEARCH_BYTE_BUDGET) break;
        const content = await app.vault.cachedRead(file);
        bytesScanned += content.length;
        const lines = content.split("\n");
        for (let index = 0; index < lines.length && matches.length < limit; index += 1) {
          if (lines[index].toLocaleLowerCase().includes(needle)) {
            matches.push({ path: file.path, line: index + 1, excerpt: lines[index].slice(0, 240) });
          }
        }
      }

      return success({
        matches,
        strategy: scopeTag ? "tag" : "fulltext",
        bytesScanned,
        truncated: matches.length >= limit || bytesScanned >= SEARCH_BYTE_BUDGET
      });
    }
  };
}

function createOpenNoteTool(app: App): LiteAgentToolDefinition {
  return {
    name: "open_note",
    description: "Open a markdown note in an existing Obsidian workspace leaf. Use this when the user asks to open or navigate to a note.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Vault-relative path of the note to open" } },
      required: ["path"]
    },
    mutates: false,
    async execute(args): Promise<LiteAgentToolResult> {
      const path = readStringArg(args, "path");
      if (!path) return failure("path must be a non-empty string");
      const safePath = safeVaultPath(path);
      if (!safePath) return failure("path must stay inside the vault");
      const file = app.vault.getAbstractFileByPath(safePath);
      if (!(file instanceof TFile)) return failure(`Note not found: ${safePath}`);
      await app.workspace.getLeaf(false).openFile(file);
      return success({ path: safePath, opened: true });
    }
  };
}

function createCurrentNoteTool(app: App): LiteAgentToolDefinition {
  return {
    name: "get_current_note",
    description: "Read the note currently active in the Obsidian workspace, if any.",
    parameters: { type: "object", properties: {} },
    mutates: false,
    async execute(): Promise<LiteAgentToolResult> {
      const file = app.workspace.getActiveFile();
      if (!(file instanceof TFile)) return failure("No active markdown note");
      return success({ path: file.path, content: await app.vault.cachedRead(file) });
    }
  };
}

function createRecentNotesTool(app: App): LiteAgentToolDefinition {
  return {
    name: "get_recent_notes",
    description: "List recently modified markdown notes without reading their full contents.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "Maximum notes, from 1 to 20" } }
    },
    mutates: false,
    async execute(args): Promise<LiteAgentToolResult> {
      const limit = clampInteger(readNumberArg(args, "limit") ?? 10, 1, 20);
      const notes = [...app.vault.getMarkdownFiles()]
        .sort((left, right) => right.stat.mtime - left.stat.mtime)
        .slice(0, limit)
        .map((file) => ({ path: file.path, modifiedAt: file.stat.mtime }));
      return success({ notes });
    }
  };
}

function createNoteMetadataTool(app: App): LiteAgentToolDefinition {
  return {
    name: "get_note_metadata",
    description: "Get a note's frontmatter, tags, headings, links, and embeds from Obsidian's metadata cache.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Vault-relative path of the note" } },
      required: ["path"]
    },
    mutates: false,
    async execute(args): Promise<LiteAgentToolResult> {
      const file = getNoteFile(app, args);
      if ("error" in file) return failure(file.error);
      const cache = app.metadataCache.getFileCache(file.value);
      return success({
        path: file.value.path,
        frontmatter: cache?.frontmatter ?? null,
        tags: cache?.tags?.map((item) => item.tag) ?? [],
        headings: cache?.headings?.map((item) => ({ level: item.level, text: item.heading, line: item.position.start.line })) ?? [],
        outboundLinks: cache?.links?.map((item) => item.link) ?? [],
        embeds: cache?.embeds?.map((item) => item.link) ?? []
      });
    }
  };
}

function createNoteLinksTool(app: App): LiteAgentToolDefinition {
  return {
    name: "get_note_links",
    description: "List inbound and outbound resolved links for a note.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Vault-relative path of the note" } },
      required: ["path"]
    },
    mutates: false,
    async execute(args): Promise<LiteAgentToolResult> {
      const file = getNoteFile(app, args);
      if ("error" in file) return failure(file.error);
      const path = file.value.path;
      const resolvedLinks = app.metadataCache.resolvedLinks ?? {};
      const outbound = Object.keys(resolvedLinks[path] ?? {});
      const inbound = Object.entries(resolvedLinks)
        .filter(([, targets]) => path in targets)
        .map(([source]) => source);
      return success({ path, inbound, outbound });
    }
  };
}

function createNoteTool(app: App): LiteAgentToolDefinition {
  return {
    name: "create_note",
    description: "Create a new vault note. This never overwrites an existing note.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path for the new note" },
        content: { type: "string", description: "Markdown content for the new note" }
      },
      required: ["path", "content"]
    },
    mutates: true,
    async execute(args): Promise<LiteAgentToolResult> {
      const path = readStringArg(args, "path");
      const content = readStringArg(args, "content");
      if (path === undefined || content === undefined) return failure("path and content are required");
      const safePath = safeVaultPath(path);
      if (!safePath) return failure("path must stay inside the vault");
      if (app.vault.getAbstractFileByPath(safePath)) return failure(`Note already exists: ${safePath}`);
      await ensureParentFolder(app, safePath);
      await app.vault.create(safePath, content);
      return success({ path: safePath, created: true });
    }
  };
}

function createAppendNoteTool(app: App): LiteAgentToolDefinition {
  return {
    name: "append_note",
    description: "Append markdown to an existing vault note. This never creates a missing note.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path of an existing note" },
        content: { type: "string", description: "Markdown content to append" }
      },
      required: ["path", "content"]
    },
    mutates: true,
    async execute(args): Promise<LiteAgentToolResult> {
      const path = readStringArg(args, "path");
      const content = readStringArg(args, "content");
      if (path === undefined || content === undefined) return failure("path and content are required");
      const safePath = safeVaultPath(path);
      if (!safePath) return failure("path must stay inside the vault");
      const file = app.vault.getAbstractFileByPath(safePath);
      if (!(file instanceof TFile)) return failure(`Note not found: ${safePath}`);
      const before = await app.vault.read(file);
      const separator = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      await app.vault.modify(file, `${before}${separator}${content}`);
      return success({ path: safePath, appendedCharacters: content.length + separator.length });
    }
  };
}

function createUpdateNoteTool(app: App): LiteAgentToolDefinition {
  return {
    name: "update_note",
    description: "Replace the full content of an existing vault note. This never creates a missing note.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path of an existing note" },
        content: { type: "string", description: "The complete replacement markdown content" }
      },
      required: ["path", "content"]
    },
    mutates: true,
    async execute(args): Promise<LiteAgentToolResult> {
      const path = readStringArg(args, "path");
      const content = readStringArg(args, "content");
      if (path === undefined || content === undefined) return failure("path and content are required");
      const safePath = safeVaultPath(path);
      if (!safePath) return failure("path must stay inside the vault");
      const file = app.vault.getAbstractFileByPath(safePath);
      if (!(file instanceof TFile)) return failure(`Note not found: ${safePath}`);
      await app.vault.modify(file, content);
      return success({ path: safePath, updated: true });
    }
  };
}

function createEditNoteTool(app: App): LiteAgentToolDefinition {
  return {
    name: "edit_note",
    description: "Replace an exact text occurrence in an existing note. Refuses ambiguous edits unless occurrences matches.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path of the note" },
        oldText: { type: "string", description: "Exact text to replace" },
        newText: { type: "string", description: "Replacement text" },
        occurrences: { type: "integer", description: "Expected match count, default 1" }
      },
      required: ["path", "oldText", "newText"]
    },
    mutates: true,
    async execute(args): Promise<LiteAgentToolResult> {
      const path = readStringArg(args, "path");
      const oldText = readStringArg(args, "oldText");
      const newText = readStringArg(args, "newText");
      if (path === undefined || oldText === undefined || newText === undefined) return failure("path, oldText, and newText are required");
      if (!oldText) return failure("oldText must be non-empty");
      const safePath = safeVaultPath(path);
      if (!safePath) return failure("path must stay inside the vault");
      const file = app.vault.getAbstractFileByPath(safePath);
      if (!(file instanceof TFile)) return failure(`Note not found: ${safePath}`);
      const before = await app.vault.read(file);
      const expected = Math.max(1, Math.trunc(readNumberArg(args, "occurrences") ?? 1));
      const count = countOccurrences(before, oldText);
      if (count === 0) return failure("No matching text found");
      if (count !== expected) return failure(`Edit is ambiguous: found ${count} occurrences, expected ${expected}`);
      await app.vault.modify(file, replaceAll(before, oldText, newText));
      return success({ path: safePath, replaced: count });
    }
  };
}

async function ensureParentFolder(app: App, path: string): Promise<void> {
  const parts = path.split("/");
  parts.pop();
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}

function readStringArg(args: unknown, key: string): string | undefined {
  if (!isRecord(args) || typeof args[key] !== "string") return undefined;
  return args[key];
}

function readNumberArg(args: unknown, key: string): number | undefined {
  if (!isRecord(args) || typeof args[key] !== "number") return undefined;
  return args[key];
}

function readRecordArg(args: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(args) || !isRecord(args[key])) return undefined;
  return args[key];
}

function getNoteFile(app: App, args: unknown): { value: TFile } | { error: string } {
  const path = readStringArg(args, "path");
  if (!path) return { error: "path must be a non-empty string" };
  const safePath = safeVaultPath(path);
  if (!safePath) return { error: "path must stay inside the vault" };
  const file = app.vault.getAbstractFileByPath(safePath);
  return file instanceof TFile ? { value: file } : { error: `Note not found: ${safePath}` };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function replaceAll(haystack: string, needle: string, replacement: string): string {
  return haystack.split(needle).join(replacement);
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function success(value: unknown): LiteAgentToolResult {
  return { ok: true, value };
}

function failure(error: string): LiteAgentToolResult {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
