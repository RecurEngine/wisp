import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { createVaultToolRegistry } from "../src/tools/VaultToolRegistry";

describe("VaultToolRegistry", () => {
  const openLinkText = vi.fn();
  const openFile = vi.fn();

  beforeEach(() => {
    openLinkText.mockReset().mockResolvedValue(undefined);
    openFile.mockReset().mockResolvedValue(undefined);
  });

  it("exposes the mobile-safe vault and workspace operation set", () => {
    const registry = createVaultToolRegistry({} as never);

    expect(registry.list().map((tool) => tool.name)).toEqual([
      "list_notes",
      "read_note",
      "search_vault",
      "open_note",
      "get_current_note",
      "get_recent_notes",
      "get_note_metadata",
      "get_note_links",
      "create_note",
      "append_note",
      "update_note",
      "edit_note",
      "insert_image_into_note"
    ]);
  });

  it("opens a requested note in the workspace", async () => {
    const file = Object.assign(new TFile(), { path: "Notes/idea.md" });
    const app = {
      vault: { getAbstractFileByPath: vi.fn().mockReturnValue(file) },
      workspace: { getLeaf: vi.fn().mockReturnValue({ openFile }) }
    };

    const tool = createVaultToolRegistry(app as never).get("open_note");
    const result = await tool?.execute({ path: "Notes/idea.md" });

    expect(result).toEqual({ ok: true, value: { path: "Notes/idea.md", opened: true } });
    expect(openFile).toHaveBeenCalledWith(file);
  });

  it("lists markdown notes with bounded file metadata", async () => {
    const files = [
      Object.assign(new TFile(), { path: "Notes/idea.md", stat: { size: 12, mtime: 20 } }),
      Object.assign(new TFile(), { path: "Archive/old.md", stat: { size: 8, mtime: 10 } }),
      Object.assign(new TFile(), { path: "Notes/task.md", stat: { size: 7, mtime: 30 } })
    ];
    const app = { vault: { getMarkdownFiles: vi.fn().mockReturnValue(files) } };

    const tool = createVaultToolRegistry(app as never).get("list_notes");
    const result = await tool?.execute({ folder: "Notes", limit: 1 });

    expect(result).toEqual({
      ok: true,
      value: {
        notes: [{ path: "Notes/task.md", size: 7, modifiedAt: 30 }],
        truncated: true
      }
    });
  });

  it("returns metadata and resolved inbound and outbound links", async () => {
    const file = Object.assign(new TFile(), { path: "Notes/idea.md" });
    const app = {
      vault: { getAbstractFileByPath: vi.fn().mockReturnValue(file) },
      metadataCache: {
        getFileCache: vi.fn().mockReturnValue({
          frontmatter: { tags: ["project"] },
          tags: [{ tag: "#project" }],
          headings: [{ level: 2, heading: "Next", position: { start: { line: 4 } } }],
          links: [{ link: "Notes/task" }],
          embeds: [{ link: "Assets/diagram.png" }]
        }),
        resolvedLinks: {
          "Notes/idea.md": { "Notes/task.md": 1 },
          "Notes/other.md": { "Notes/idea.md": 2 }
        }
      }
    };

    const registry = createVaultToolRegistry(app as never);
    const metadata = await registry.get("get_note_metadata")?.execute({ path: "Notes/idea.md" });
    const links = await registry.get("get_note_links")?.execute({ path: "Notes/idea.md" });

    expect(metadata).toEqual({
      ok: true,
      value: {
        path: "Notes/idea.md",
        frontmatter: { tags: ["project"] },
        tags: ["#project"],
        headings: [{ level: 2, text: "Next", line: 4 }],
        outboundLinks: ["Notes/task"],
        embeds: ["Assets/diagram.png"]
      }
    });
    expect(links).toEqual({
      ok: true,
      value: {
        path: "Notes/idea.md",
        inbound: ["Notes/other.md"],
        outbound: ["Notes/task.md"]
      }
    });
  });

  it("replaces one exact occurrence in a note", async () => {
    const file = Object.assign(new TFile(), { path: "Notes/idea.md" });
    const modify = vi.fn().mockResolvedValue(undefined);
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(file),
        read: vi.fn().mockResolvedValue("before\nafter"),
        modify
      }
    };

    const tool = createVaultToolRegistry(app as never).get("edit_note");
    const result = await tool?.execute({ path: "Notes/idea.md", oldText: "before", newText: "updated" });

    expect(result).toEqual({ ok: true, value: { path: "Notes/idea.md", replaced: 1 } });
    expect(modify).toHaveBeenCalledWith(file, "updated\nafter");
  });

  it("inserts an image attachment into the active note", async () => {
    const image = Object.assign(new TFile(), { path: "Attachments/photo.jpg" });
    const note = Object.assign(new TFile(), { path: "Notes/idea.md" });
    const modify = vi.fn().mockResolvedValue(undefined);
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => path === image.path ? image : note),
        read: vi.fn().mockResolvedValue("Existing note"),
        modify
      },
      workspace: { getActiveFile: vi.fn().mockReturnValue(note) },
      fileManager: { generateMarkdownLink: vi.fn().mockReturnValue("[[photo.jpg]]") }
    };

    const tool = createVaultToolRegistry(app as never).get("insert_image_into_note");
    const result = await tool?.execute({ imagePath: image.path });

    expect(result).toEqual({ ok: true, value: { imagePath: image.path, notePath: note.path, inserted: true } });
    expect(modify).toHaveBeenCalledWith(note, "Existing note\n![[photo.jpg]]");
  });
});
