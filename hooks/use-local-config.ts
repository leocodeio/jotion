"use client";

import { useCallback, useEffect, useState } from "react";

interface LocalConfigState {
  isLoading: boolean;
  isConfigured: boolean;
  dataDir: string | null;
}

const initialState: LocalConfigState = {
  isLoading: true,
  isConfigured: false,
  dataDir: null,
};

export function useLocalConfig() {
  const [state, setState] = useState<LocalConfigState>(initialState);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    const response = await fetch("/api/local/config", { cache: "no-store" });
    const payload = (await response.json()) as {
      configured: boolean;
      dataDir: string | null;
    };

    setState({
      isLoading: false,
      isConfigured: !!payload.configured,
      dataDir: payload.dataDir,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}
