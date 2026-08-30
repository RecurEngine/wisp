import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { getUniqueImagePath, imageEmbedLink, imageFileName, importImage, isImageFile } from "../src/images/ImageImporter";

describe("ImageImporter", () => {
  it("recognizes image MIME types and common image extensions", () => {
    expect(isImageFile({ name: "photo", type: "image/jpeg", arrayBuffer: vi.fn() })).toBe(true);
    expect(isImageFile({ name: "photo.webp", type: "", arrayBuffer: vi.fn() })).toBe(true);
    expect(isImageFile({ name: "notes.txt", type: "text/plain", arrayBuffer: vi.fn() })).toBe(false);
  });

  it("creates a safe, stable image filename", () => {
    expect(imageFileName({ name: "IMG_0012.JPG", type: "image/jpeg" })).toBe("IMG_0012.jpg");
    expect(imageFileName({ name: "手机照片", type: "image/png" })).toBe("手机照片.png");
  });

  it("adds a suffix when the attachment filename already exists", () => {
    const existing = new Set(["Attachments/photo.png", "Attachments/photo 2.png"]);
    const vault = { getAbstractFileByPath: (path: string) => existing.has(path) ? new TFile() : null };
    expect(getUniqueImagePath(vault, "Attachments", "photo.png")).toBe("Attachments/photo 3.png");
  });

  it("imports into Obsidian's configured attachment folder and generates an embed", async () => {
    const binary = new ArrayBuffer(3);
    const createdFile = Object.assign(new TFile(), { path: "Attachments/photo.jpg" });
    const createBinary = vi.fn().mockResolvedValue(createdFile);
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        createBinary
      },
      fileManager: {
        getNewFileParent: vi.fn().mockReturnValue({ path: "Attachments" }),
        generateMarkdownLink: vi.fn().mockReturnValue("[[photo.jpg]]")
      }
    };
    const image = {
      name: "photo.jpg",
      type: "image/jpeg",
      arrayBuffer: vi.fn().mockResolvedValue(binary)
    };

    const imported = await importImage(app, image, "Notes/today.md");

    expect(imported).toBe(createdFile);
    expect(app.fileManager.getNewFileParent).toHaveBeenCalledWith("Notes/today.md", "photo.jpg");
    expect(createBinary).toHaveBeenCalledWith("Attachments/photo.jpg", binary);
    expect(imageEmbedLink(app, createdFile, "Notes/today.md")).toBe("![[photo.jpg]]");
  });
});
