import { NextResponse } from "next/server";
import {
  readLocalConfig,
  writeLocalConfig,
  type LocalConfig,
} from "@/lib/local/config";

export const runtime = "nodejs";

function serializeConfig(config: LocalConfig | null) {
  return {
    configured: !!config,
    dataDir: config?.dataDir ?? null,
  };
}

export async function GET() {
  const config = await readLocalConfig();
  return NextResponse.json(serializeConfig(config));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { dataDir?: string };
    if (!body.dataDir) {
      return NextResponse.json(
        { error: "dataDir is required." },
        { status: 400 },
      );
    }

    const config = await writeLocalConfig(body.dataDir);
    return NextResponse.json(serializeConfig(config));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save local config.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
