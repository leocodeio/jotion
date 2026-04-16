import "server-only";

import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { getDatabase } from "@/lib/local/db";
import {
  type DocumentId,
  type DocumentRecord,
  type DocumentUpdateInput,
} from "@/lib/local/types";

interface DocumentRow {
  id: string;
  title: string;
  isArchived: number;
  parentDocument: string | null;
  content: string | null;
  coverImage: string | null;
  icon: string | null;
  isPublished: number;
  createdAt: string;
  updatedAt: string;
}

function mapDocument(row: DocumentRow): DocumentRecord {
  return {
    _id: row.id,
    title: row.title,
    isArchived: !!row.isArchived,
    parentDocument: row.parentDocument ?? undefined,
    content: row.content ?? undefined,
    coverImage: row.coverImage ?? undefined,
    icon: row.icon ?? undefined,
    isPublished: !!row.isPublished,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function getRowById(database: Database.Database, id: DocumentId) {
  const statement = database.prepare("SELECT * FROM documents WHERE id = ?");
  return statement.get(id) as DocumentRow | undefined;
}

function collectDescendantIds(database: Database.Database, id: DocumentId) {
  const descendants: string[] = [];
  const queue = [id];
  const statement = database.prepare("SELECT id FROM documents WHERE parentDocument = ?");

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = statement.all(current) as Array<{ id: string }>;
    for (const child of children) {
      descendants.push(child.id);
      queue.push(child.id);
    }
  }

  return descendants;
}

export async function getSidebarDocuments(parentDocument?: DocumentId) {
  const database = await getDatabase();
  const rows = parentDocument
    ? ((database
        .prepare(
          "SELECT * FROM documents WHERE isArchived = 0 AND parentDocument = ? ORDER BY updatedAt DESC",
        )
        .all(parentDocument) as DocumentRow[]) ?? [])
    : ((database
        .prepare(
          "SELECT * FROM documents WHERE isArchived = 0 AND parentDocument IS NULL ORDER BY updatedAt DESC",
        )
        .all() as DocumentRow[]) ?? []);

  return rows.map(mapDocument);
}

export async function getTrashDocuments() {
  const database = await getDatabase();
  const rows = database
    .prepare("SELECT * FROM documents WHERE isArchived = 1 ORDER BY updatedAt DESC")
    .all() as DocumentRow[];
  return rows.map(mapDocument);
}

export async function getSearchDocuments() {
  const database = await getDatabase();
  const rows = database
    .prepare("SELECT * FROM documents WHERE isArchived = 0 ORDER BY updatedAt DESC")
    .all() as DocumentRow[];
  return rows.map(mapDocument);
}

export async function getDocumentById(documentId: DocumentId) {
  const database = await getDatabase();
  const row = getRowById(database, documentId);
  return row ? mapDocument(row) : null;
}

export async function createDocument(input: {
  title: string;
  parentDocument?: DocumentId;
}) {
  const database = await getDatabase();
  const id = randomUUID();
  const timestamp = nowIso();

  database
    .prepare(
      `INSERT INTO documents (
        id, title, isArchived, parentDocument, content, coverImage, icon, isPublished, createdAt, updatedAt
      ) VALUES (
        @id, @title, 0, @parentDocument, NULL, NULL, NULL, 0, @createdAt, @updatedAt
      )`,
    )
    .run({
      id,
      title: input.title,
      parentDocument: input.parentDocument ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

  return id;
}

export async function archiveDocument(id: DocumentId) {
  const database = await getDatabase();
  const existing = getRowById(database, id);
  if (!existing) {
    throw new Error("Document not found.");
  }

  const ids = [id, ...collectDescendantIds(database, id)];
  const timestamp = nowIso();
  const updateStatement = database.prepare(
    "UPDATE documents SET isArchived = 1, updatedAt = ? WHERE id = ?",
  );

  database.transaction((documentIds: string[]) => {
    for (const documentId of documentIds) {
      updateStatement.run(timestamp, documentId);
    }
  })(ids);

  const updated = getRowById(database, id);
  return updated ? mapDocument(updated) : null;
}

export async function restoreDocument(id: DocumentId) {
  const database = await getDatabase();
  const existing = getRowById(database, id);
  if (!existing) {
    throw new Error("Document not found.");
  }

  const timestamp = nowIso();
  let parentDocument = existing.parentDocument;
  if (parentDocument) {
    const parent = getRowById(database, parentDocument);
    if (parent?.isArchived) {
      parentDocument = null;
    }
  }

  const descendants = collectDescendantIds(database, id);
  const restoreRootStatement = database.prepare(
    "UPDATE documents SET isArchived = 0, parentDocument = ?, updatedAt = ? WHERE id = ?",
  );
  const restoreDescendantStatement = database.prepare(
    "UPDATE documents SET isArchived = 0, updatedAt = ? WHERE id = ?",
  );

  database.transaction(() => {
    restoreRootStatement.run(parentDocument, timestamp, id);
    for (const descendantId of descendants) {
      restoreDescendantStatement.run(timestamp, descendantId);
    }
  })();

  const updated = getRowById(database, id);
  return updated ? mapDocument(updated) : null;
}

export async function removeDocument(id: DocumentId) {
  const database = await getDatabase();
  const existing = getRowById(database, id);
  if (!existing) {
    throw new Error("Document not found.");
  }

  const ids = [id, ...collectDescendantIds(database, id)];
  const deleteStatement = database.prepare("DELETE FROM documents WHERE id = ?");

  database.transaction((documentIds: string[]) => {
    for (const documentId of documentIds) {
      deleteStatement.run(documentId);
    }
  })(ids);

  return true;
}

export async function updateDocument(
  id: DocumentId,
  updates: DocumentUpdateInput,
) {
  const database = await getDatabase();
  const existing = getRowById(database, id);
  if (!existing) {
    throw new Error("Document not found.");
  }

  const patch: Array<{ key: keyof DocumentUpdateInput; value: unknown }> = [];
  if (updates.title !== undefined) patch.push({ key: "title", value: updates.title });
  if (updates.content !== undefined) patch.push({ key: "content", value: updates.content });
  if (updates.coverImage !== undefined) {
    patch.push({ key: "coverImage", value: updates.coverImage || null });
  }
  if (updates.icon !== undefined) patch.push({ key: "icon", value: updates.icon || null });
  if (updates.isPublished !== undefined) {
    patch.push({ key: "isPublished", value: updates.isPublished ? 1 : 0 });
  }

  if (patch.length > 0) {
    const assignments = patch.map((entry) => `${entry.key} = @${entry.key}`);
    assignments.push("updatedAt = @updatedAt");

    const statement = database.prepare(
      `UPDATE documents SET ${assignments.join(", ")} WHERE id = @id`,
    );

    const params = patch.reduce<Record<string, unknown>>((acc, entry) => {
      acc[entry.key] = entry.value;
      return acc;
    }, {});

    statement.run({
      ...params,
      id,
      updatedAt: nowIso(),
    });
  }

  const updated = getRowById(database, id);
  return updated ? mapDocument(updated) : null;
}

export async function removeDocumentIcon(id: DocumentId) {
  return updateDocument(id, { icon: "" });
}

export async function removeDocumentCoverImage(id: DocumentId) {
  return updateDocument(id, { coverImage: "" });
}
