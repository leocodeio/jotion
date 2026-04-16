"use client";

export async function uploadMediaFile(file: File, replaceUrl?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (replaceUrl) {
    formData.append("replaceUrl", replaceUrl);
  }

  const response = await fetch("/api/local/media", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json()) as { url?: string; error?: string };

  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? "Failed to upload media.");
  }

  return payload.url;
}

export async function deleteMediaFile(url: string) {
  const response = await fetch("/api/local/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "delete",
      url,
    }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Failed to delete media.");
  }
}
