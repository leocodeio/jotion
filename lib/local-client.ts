"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type MutationEndpoint, type QueryEndpoint } from "@/lib/local-api";

const DATA_CHANGED_EVENT = "jotion:data-changed";

function objectToSearchParams(input?: Record<string, unknown>) {
  const params = new URLSearchParams();
  if (!input) return params;

  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    params.set(key, String(value));
  });
  return params;
}

function serializeArgs(args?: Record<string, unknown>) {
  return JSON.stringify(args ?? {});
}

export function useQuery<TArgs extends Record<string, unknown> | void, TResult>(
  endpoint: QueryEndpoint<TArgs, TResult>,
  args?: TArgs,
) {
  const serializedArgs = useMemo(
    () => serializeArgs(args as Record<string, unknown> | undefined),
    [args],
  );
  const [data, setData] = useState<TResult | undefined>(undefined);

  const fetchData = useCallback(async () => {
    const parsedArgs = serializedArgs
      ? (JSON.parse(serializedArgs) as Record<string, unknown>)
      : undefined;
    const params = objectToSearchParams({
      action: endpoint.action,
      ...(parsedArgs ?? {}),
    });
    const response = await fetch(`${endpoint.path}?${params.toString()}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      data?: TResult;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to fetch data.");
    }

    setData(payload.data as TResult);
  }, [endpoint.action, endpoint.path, serializedArgs]);

  useEffect(() => {
    let mounted = true;
    setData(undefined);

    const run = async () => {
      try {
        await fetchData();
      } catch (error) {
        if (!mounted) return;
        console.error(error);
        setData(undefined);
      }
    };

    void run();

    const onChanged = () => {
      void run();
    };

    window.addEventListener(DATA_CHANGED_EVENT, onChanged);
    return () => {
      mounted = false;
      window.removeEventListener(DATA_CHANGED_EVENT, onChanged);
    };
  }, [fetchData]);

  return data;
}

export function useMutation<TArgs extends Record<string, unknown>, TResult>(
  endpoint: MutationEndpoint<TArgs, TResult>,
) {
  return useCallback(
    async (args: TArgs) => {
      const response = await fetch(endpoint.path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: endpoint.action,
          args,
        }),
      });
      const payload = (await response.json()) as {
        data?: TResult;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Request failed.");
      }

      window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
      return payload.data as TResult;
    },
    [endpoint.action, endpoint.path],
  );
}
