"use client";

import { Spinner } from "@/components/spinner";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/main/navigation";
import { SearchCommand } from "@/components/search-command";
import React, { useEffect } from "react";
import { useLocalConfig } from "@/hooks/use-local-config";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isConfigured, isLoading } = useLocalConfig();

  useEffect(() => {
    if (!isLoading && !isConfigured) {
      router.replace("/setup");
    }
  }, [isConfigured, isLoading, router]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isConfigured) {
    return null;
  }

  return (
    <div className="h-full flex dark:bg-[#1F1F1F]">
      <Navigation />
      <main className="flex-1 h-full overflow-y-auto">
        <SearchCommand />
        {children}
      </main>
    </div>
  );
}
