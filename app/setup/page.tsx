"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useLocalConfig } from "@/hooks/use-local-config";

export default function SetupPage() {
  const router = useRouter();
  const { isLoading, isConfigured, dataDir, refresh } = useLocalConfig();
  const [folderPath, setFolderPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (dataDir) {
      setFolderPath(dataDir);
    }
  }, [dataDir]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const request = fetch("/api/local/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataDir: folderPath }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to save local folder.");
        }
      })
      .then(async () => {
        await refresh();
        router.push("/documents");
      })
      .finally(() => {
        setIsSubmitting(false);
      });

    toast.promise(request, {
      loading: "Saving local folder...",
      success: "Local folder configured.",
      error: (error) =>
        error instanceof Error ? error.message : "Failed to configure folder.",
    });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-2xl bg-background border rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Local workspace setup</h1>
          <p className="text-sm text-muted-foreground">
            Grant a local folder path. Jotion will create a SQLite DB and a
            folder-based media store there.
          </p>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="folderPath">Folder path</Label>
            <Input
              id="folderPath"
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
              placeholder="C:\\Users\\you\\JotionLocal"
              disabled={isSubmitting || isLoading}
              required
            />
            <p className="text-xs text-muted-foreground">
              Use an absolute path on this machine.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting || isLoading}>
              Save folder
            </Button>
            {isConfigured && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push("/documents")}
                disabled={isSubmitting}
              >
                Continue to documents
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
