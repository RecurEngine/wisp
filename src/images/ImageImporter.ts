import { normalizePath } from "obsidian";
import type { App, TAbstractFile, TFile } from "obsidian";
import type { LiteAgentImageAttachment } from "../core/LiteAgentTypes";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "heic", "jpeg", "jpg", "png", "svg", "webp"]);

const MIME_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp"
};

export interface ImageFile {
  readonly name: string;
  readonly type: string;
  readonly previewUrl?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ImageImportApp {
  readonly vault: {
    getAbstractFileByPath(path: string): TAbstractFile | null;
    createBinary(path: string, data: ArrayBuffer): Promise<TFile>;
  };
  readonly fileManager: {
    getNewFileParent(sourcePath: string, newFilePath?: string): { readonly path: string };
    generateMarkdownLink(file: TFile, sourcePath: string, subpath?: string, alias?: string): string;
  };
}

export function pickImages(): Promise<ImageFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";

    const cleanup = (): void => {
      input.remove();
    };
    const finish = (files: ImageFile[]): void => {
      cleanup();
      resolve(files);
    };

    input.addEventListener("change", () => finish(Array.from(input.files ?? []).map(toImageFile)), { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export function releaseImagePreview(file: ImageFile): void {
  if (file.previewUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(file.previewUrl);
  }
}

export function isImageFile(file: ImageFile): boolean {
  if (file.type.toLowerCase().startsWith("image/")) return true;
  const extension = getFileExtension(file.name);
  return extension !== undefined && IMAGE_EXTENSIONS.has(extension);
}

export function imageFileName(file: Pick<ImageFile, "name" | "type">): string {
  const lastSegment = file.name.replaceAll("\\", "/").split("/").pop() ?? "";
  const extension = getImageExtension(lastSegment, file.type);
  const baseName = lastSegment.replace(/\.[^.]*$/, "");
  const safeBaseName = baseName
    .replace(/[^\p{L}\p{N}._ -]/gu, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.-]+|[.-]+$/g, "") || "image";
  return `${safeBaseName}.${extension}`;
}

export async function importImage(
  app: ImageImportApp | App,
  file: ImageFile,
  sourcePath: string
): Promise<TFile> {
  const imageName = imageFileName(file);
  const folder = app.fileManager.getNewFileParent(sourcePath, imageName);
  const imagePath = getUniqueImagePath(app.vault, folder.path, imageName);
  return app.vault.createBinary(imagePath, await file.arrayBuffer());
}

export function imageEmbedLink(
  app: Pick<ImageImportApp, "fileManager">,
  file: TFile,
  sourcePath: string
): string {
  const markdownLink = app.fileManager.generateMarkdownLink(file, sourcePath);
  return markdownLink.startsWith("!") ? markdownLink : `!${markdownLink}`;
}

export function createImageAttachment(file: Pick<ImageFile, "name" | "type">, importedFile: TFile): LiteAgentImageAttachment {
  const extension = getImageExtension(file.name, file.type);
  return {
    type: "image",
    path: importedFile.path,
    name: file.name || importedFile.name,
    mimeType: file.type.toLowerCase() || `image/${extension}`
  };
}

export function arrayBufferToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function getUniqueImagePath(
  vault: Pick<ImageImportApp["vault"], "getAbstractFileByPath">,
  folderPath: string,
  fileName: string
): string {
  const basePath = joinVaultPath(folderPath, fileName);
  if (!vault.getAbstractFileByPath(basePath)) return basePath;

  const extension = getFileExtension(fileName);
  const nameWithoutExtension = extension ? fileName.slice(0, -(extension.length + 1)) : fileName;
  let suffix = 2;
  let candidate = basePath;
  while (vault.getAbstractFileByPath(candidate)) {
    candidate = joinVaultPath(folderPath, `${nameWithoutExtension} ${suffix}.${extension ?? "png"}`);
    suffix += 1;
  }
  return candidate;
}

function getImageExtension(fileName: string, mimeType: string): string {
  const fileExtension = getFileExtension(fileName);
  if (fileExtension && IMAGE_EXTENSIONS.has(fileExtension)) return fileExtension;
  return MIME_EXTENSIONS[mimeType.toLowerCase()] ?? "png";
}

function toImageFile(file: File): ImageFile {
  const previewUrl = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : undefined;
  return {
    name: file.name,
    type: file.type,
    ...(previewUrl ? { previewUrl } : {}),
    arrayBuffer: () => file.arrayBuffer()
  };
}

function getFileExtension(fileName: string): string | undefined {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match?.[1]?.toLowerCase();
}

function joinVaultPath(folderPath: string, fileName: string): string {
  const normalizedFolder = normalizePath(folderPath).replace(/^\/+|\/+$/g, "");
  return normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName;
}
