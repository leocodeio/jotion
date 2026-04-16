import "server-only";

import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { getRequiredLocalConfig } from "@/lib/local/config";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".json": "application/json",
};

function normalizeRelativePath(relativePath: string) {
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    path.isAbsolute(normalized)
  ) {
    throw new Error("Invalid media path.");
  }

  return normalized;
}

async function getMediaRoot() {
  const { dataDir } = await getRequiredLocalConfig();
  const mediaRoot = path.join(dataDir, "media");
  await mkdir(mediaRoot, { recursive: true });
  return mediaRoot;
}

function toPublicMediaUrl(relativePath: string) {
  const safePath = normalizeRelativePath(relativePath);
  return `/api/local/media?path=${encodeURIComponent(safePath)}`;
}

function toRelativePathFromUrl(url: string) {
  try {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname !== "/api/local/media") {
      return null;
    }
    const relativePath = parsed.searchParams.get("path");
    if (!relativePath) return null;
    return normalizeRelativePath(relativePath);
  } catch {
    return null;
  }
}

async function resolveMediaFilePath(relativePath: string) {
  const mediaRoot = await getMediaRoot();
  const safeRelativePath = normalizeRelativePath(relativePath);
  const absolutePath = path.resolve(mediaRoot, safeRelativePath);
  const expectedRoot = path.resolve(mediaRoot);
  if (!absolutePath.startsWith(expectedRoot)) {
    throw new Error("Invalid media path.");
  }

  return absolutePath;
}

function getMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[extension] ?? "application/octet-stream";
}

export async function uploadMediaFile(file: File, replaceUrl?: string) {
  const mediaRoot = await getMediaRoot();
  const now = new Date();
  const folder = path.posix.join(
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
  );
  const extension = path.extname(file.name) || ".bin";
  const fileName = `${randomUUID()}${extension}`;
  const relativePath = path.posix.join(folder, fileName);
  const absoluteFolderPath = path.join(mediaRoot, folder);
  await mkdir(absoluteFolderPath, { recursive: true });

  const arrayBuffer = await file.arrayBuffer();
  const absoluteFilePath = path.join(absoluteFolderPath, fileName);
  await writeFile(absoluteFilePath, Buffer.from(arrayBuffer));

  if (replaceUrl) {
    await deleteMediaByUrl(replaceUrl);
  }

  return {
    url: toPublicMediaUrl(relativePath),
  };
}

export async function deleteMediaByUrl(url: string) {
  const relativePath = toRelativePathFromUrl(url);
  if (!relativePath) return;

  const absolutePath = await resolveMediaFilePath(relativePath);
  try {
    await unlink(absolutePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function readMediaFile(relativePath: string) {
  const absolutePath = await resolveMediaFilePath(relativePath);
  const data = await readFile(absolutePath);

  return {
    data,
    contentType: getMimeType(absolutePath),
  };
}
