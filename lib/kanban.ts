export interface KanbanCard {
  id: string;
  title: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

export interface KanbanDocument {
  type: "kanban";
  version: 1;
  columns: KanbanColumn[];
}

const KANBAN_PREFIX = "jotion:kanban:";

const createId = () =>
  `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const toCard = (input: unknown): KanbanCard | null => {
  if (!input || typeof input !== "object") return null;

  const record = input as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : "";
  const id = typeof record.id === "string" && record.id ? record.id : createId();

  return {
    id,
    title,
  };
};

const toColumn = (input: unknown): KanbanColumn | null => {
  if (!input || typeof input !== "object") return null;

  const record = input as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : "";
  const id = typeof record.id === "string" && record.id ? record.id : createId();
  const cards = Array.isArray(record.cards)
    ? record.cards.map(toCard).filter((card): card is KanbanCard => card !== null)
    : [];

  return {
    id,
    title,
    cards,
  };
};

export const parseKanbanDocumentPayload = (input: unknown): KanbanDocument | null => {
  if (!input || typeof input !== "object") return null;

  const parsed = input as Record<string, unknown>;
  if (parsed.type !== "kanban") return null;

  const columns = Array.isArray(parsed.columns)
    ? parsed.columns.map(toColumn).filter((column): column is KanbanColumn => column !== null)
    : [];

  return {
    type: "kanban",
    version: 1,
    columns,
  };
};

export const createDefaultKanbanDocument = (): KanbanDocument => ({
  type: "kanban",
  version: 1,
  columns: [
    {
      id: createId(),
      title: "To do",
      cards: [
        { id: createId(), title: "Define scope" },
        { id: createId(), title: "Break work into tasks" },
      ],
    },
    {
      id: createId(),
      title: "In progress",
      cards: [{ id: createId(), title: "Implement core flow" }],
    },
    {
      id: createId(),
      title: "Done",
      cards: [{ id: createId(), title: "Project setup" }],
    },
  ],
});

export const serializeKanbanContent = (document: KanbanDocument) =>
  `${KANBAN_PREFIX}${JSON.stringify(document)}`;

export const serializeKanbanBlockPayload = (document: KanbanDocument) =>
  JSON.stringify(document, null, 2);

export const parseKanbanContent = (value?: string | null): KanbanDocument | null => {
  if (!value || !value.startsWith(KANBAN_PREFIX)) return null;

  const payload = value.slice(KANBAN_PREFIX.length).trim();
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return parseKanbanDocumentPayload(parsed);
  } catch {
    return null;
  }
};
