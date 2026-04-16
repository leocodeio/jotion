import "server-only";

import path from "node:path";
import Database from "better-sqlite3";
import { getRequiredLocalConfig } from "@/lib/local/config";

let db: Database.Database | null = null;
let dbFilePath: string | null = null;

function initializeSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      isArchived INTEGER NOT NULL DEFAULT 0,
      parentDocument TEXT,
      content TEXT,
      coverImage TEXT,
      icon TEXT,
      isPublished INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_parent
      ON documents(parentDocument);
    CREATE INDEX IF NOT EXISTS idx_documents_archived_updated
      ON documents(isArchived, updatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_documents_updated
      ON documents(updatedAt DESC);
  `);
}

export async function getDatabase() {
  const { dataDir } = await getRequiredLocalConfig();
  const nextDbPath = path.join(dataDir, "jotion.sqlite");

  if (!db || dbFilePath !== nextDbPath) {
    db?.close();
    db = new Database(nextDbPath);
    db.pragma("journal_mode = WAL");
    initializeSchema(db);
    dbFilePath = nextDbPath;
  }

  return db;
}
