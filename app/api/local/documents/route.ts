import { NextRequest, NextResponse } from "next/server";
import {
  archiveDocument,
  createDocument,
  getDocumentById,
  getSearchDocuments,
  getSidebarDocuments,
  getTrashDocuments,
  removeDocument,
  removeDocumentCoverImage,
  removeDocumentIcon,
  restoreDocument,
  updateDocument,
} from "@/lib/local/documents";

export const runtime = "nodejs";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get("action");
    switch (action) {
      case "getSidebar": {
        const parentDocument = request.nextUrl.searchParams.get("parentDocument");
        const data = await getSidebarDocuments(parentDocument ?? undefined);
        return NextResponse.json({ data });
      }
      case "getTrash": {
        const data = await getTrashDocuments();
        return NextResponse.json({ data });
      }
      case "getSearch": {
        const data = await getSearchDocuments();
        return NextResponse.json({ data });
      }
      case "getById": {
        const documentId = request.nextUrl.searchParams.get("documentId");
        if (!documentId) {
          return NextResponse.json(
            { error: "documentId is required." },
            { status: 400 },
          );
        }
        const data = await getDocumentById(documentId);
        return NextResponse.json({ data });
      }
      default:
        return NextResponse.json({ error: "Unknown query action." }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { action?: string; args?: unknown };
    const action = body.action;
    const args = (body.args ?? {}) as Record<string, unknown>;

    switch (action) {
      case "create": {
        const title = typeof args.title === "string" ? args.title : "Untitled";
        const parentDocument =
          typeof args.parentDocument === "string" ? args.parentDocument : undefined;
        const data = await createDocument({ title, parentDocument });
        return NextResponse.json({ data });
      }
      case "archive": {
        if (typeof args.id !== "string") {
          return NextResponse.json({ error: "id is required." }, { status: 400 });
        }
        const data = await archiveDocument(args.id);
        return NextResponse.json({ data });
      }
      case "restore": {
        if (typeof args.id !== "string") {
          return NextResponse.json({ error: "id is required." }, { status: 400 });
        }
        const data = await restoreDocument(args.id);
        return NextResponse.json({ data });
      }
      case "remove": {
        if (typeof args.id !== "string") {
          return NextResponse.json({ error: "id is required." }, { status: 400 });
        }
        const data = await removeDocument(args.id);
        return NextResponse.json({ data });
      }
      case "update": {
        if (typeof args.id !== "string") {
          return NextResponse.json({ error: "id is required." }, { status: 400 });
        }
        const { id, ...rest } = args;
        const data = await updateDocument(id, {
          title: typeof rest.title === "string" ? rest.title : undefined,
          content: typeof rest.content === "string" ? rest.content : undefined,
          coverImage:
            typeof rest.coverImage === "string" || rest.coverImage === null
              ? (rest.coverImage ?? "")
              : undefined,
          icon:
            typeof rest.icon === "string" || rest.icon === null
              ? (rest.icon ?? "")
              : undefined,
          isPublished:
            typeof rest.isPublished === "boolean" ? rest.isPublished : undefined,
        });
        return NextResponse.json({ data });
      }
      case "removeIcon": {
        if (typeof args.id !== "string") {
          return NextResponse.json({ error: "id is required." }, { status: 400 });
        }
        const data = await removeDocumentIcon(args.id);
        return NextResponse.json({ data });
      }
      case "removeCoverImage": {
        if (typeof args.id !== "string") {
          return NextResponse.json({ error: "id is required." }, { status: 400 });
        }
        const data = await removeDocumentCoverImage(args.id);
        return NextResponse.json({ data });
      }
      default:
        return NextResponse.json(
          { error: "Unknown mutation action." },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
