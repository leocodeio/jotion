import { type DocumentRecord, type DocumentUpdateInput } from "@/lib/local/types";

export interface QueryEndpoint<TArgs, TResult> {
  kind: "query";
  path: string;
  action: string;
  _types?: {
    args: TArgs;
    result: TResult;
  };
}

export interface MutationEndpoint<TArgs, TResult> {
  kind: "mutation";
  path: string;
  action: string;
  _types?: {
    args: TArgs;
    result: TResult;
  };
}

const DOCUMENTS_PATH = "/api/local/documents";

function query<TArgs, TResult>(action: string): QueryEndpoint<TArgs, TResult> {
  return {
    kind: "query",
    path: DOCUMENTS_PATH,
    action,
  };
}

function mutation<TArgs, TResult>(
  action: string,
): MutationEndpoint<TArgs, TResult> {
  return {
    kind: "mutation",
    path: DOCUMENTS_PATH,
    action,
  };
}

export const api = {
  documents: {
    getSidebar: query<{ parentDocument?: string }, DocumentRecord[]>("getSidebar"),
    getTrash: query<void, DocumentRecord[]>("getTrash"),
    getSearch: query<void, DocumentRecord[]>("getSearch"),
    getById: query<{ documentId: string }, DocumentRecord | null>("getById"),
    create: mutation<{ title: string; parentDocument?: string }, string>("create"),
    archive: mutation<{ id: string }, DocumentRecord | null>("archive"),
    restore: mutation<{ id: string }, DocumentRecord | null>("restore"),
    remove: mutation<{ id: string }, boolean>("remove"),
    update: mutation<{ id: string } & DocumentUpdateInput, DocumentRecord | null>(
      "update",
    ),
    removeIcon: mutation<{ id: string }, DocumentRecord | null>("removeIcon"),
    removeCoverImage: mutation<{ id: string }, DocumentRecord | null>(
      "removeCoverImage",
    ),
  },
} as const;
