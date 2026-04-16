import { NextRequest, NextResponse } from "next/server";
import { deleteMediaByUrl, readMediaFile, uploadMediaFile } from "@/lib/local/media";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Media request failed.";
}

export async function GET(request: NextRequest) {
  try {
    const relativePath = request.nextUrl.searchParams.get("path");
    if (!relativePath) {
      return NextResponse.json({ error: "path is required." }, { status: 400 });
    }

    const file = await readMediaFile(relativePath);
    return new NextResponse(file.data, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 404 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const replaceUrl = formData.get("replaceUrl");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "file is required." }, { status: 400 });
      }

      const result = await uploadMediaFile(
        file,
        typeof replaceUrl === "string" ? replaceUrl : undefined,
      );
      return NextResponse.json(result);
    }

    const body = (await request.json()) as { action?: string; url?: string };
    if (body.action === "delete" && body.url) {
      await deleteMediaByUrl(body.url);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown media action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
