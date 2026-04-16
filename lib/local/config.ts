import "server-only";

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

export interface LocalConfig {
  dataDir: string;
}

const CONFIG_FILE = path.join(process.cwd(), ".jotion-local.json");

export async function readLocalConfig(): Promise<LocalConfig | null> {
  try {
    const content = await readFile(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(content) as Partial<LocalConfig>;
    if (!parsed.dataDir || !path.isAbsolute(parsed.dataDir)) {
      return null;
    }

    return { dataDir: parsed.dataDir };
  } catch {
    return null;
  }
}

export async function writeLocalConfig(dataDir: string): Promise<LocalConfig> {
  if (!path.isAbsolute(dataDir)) {
    throw new Error("Please provide an absolute folder path.");
  }

  const normalizedDataDir = path.normalize(dataDir);
  await mkdir(normalizedDataDir, { recursive: true });
  await mkdir(path.join(normalizedDataDir, "media"), { recursive: true });

  const config: LocalConfig = { dataDir: normalizedDataDir };
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  return config;
}

export async function getRequiredLocalConfig(): Promise<LocalConfig> {
  const config = await readLocalConfig();
  if (!config) {
    throw new Error(
      "Local storage is not configured yet. Open /setup and grant a folder.",
    );
  }

  return config;
}
