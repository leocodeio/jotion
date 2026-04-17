"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type KanbanCard,
  type KanbanColumn,
  type KanbanDocument,
  createDefaultKanbanDocument,
} from "@/lib/kanban";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

interface KanbanBoardProps {
  value?: KanbanDocument | null;
  editable?: boolean;
  onChange: (nextValue: KanbanDocument) => void;
}

type DraggedItem =
  | {
      type: "column";
      columnId: string;
    }
  | {
      type: "card";
      columnId: string;
      cardId: string;
    };

const createId = () =>
  `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const ensureDocument = (input?: KanbanDocument | null): KanbanDocument => {
  if (!input || !Array.isArray(input.columns)) {
    return createDefaultKanbanDocument();
  }

  return {
    type: "kanban",
    version: 1,
    columns: input.columns.map((column) => ({
      id: column.id,
      title: column.title,
      cards: column.cards.map((card) => ({
        id: card.id,
        title: card.title,
      })),
    })),
  };
};

const moveArrayItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  if (fromIndex === toIndex) return items;

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
};

export const KanbanBoard = ({ value, editable = true, onChange }: KanbanBoardProps) => {
  const board = useMemo(() => ensureDocument(value), [value]);
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const updateColumns = (nextColumns: KanbanColumn[]) => {
    onChange({
      type: "kanban",
      version: 1,
      columns: nextColumns,
    });
  };

  const addColumn = () => {
    if (!editable) return;

    updateColumns([
      ...board.columns,
      {
        id: createId(),
        title: "New column",
        cards: [],
      },
    ]);
  };

  const removeColumn = (columnId: string) => {
    if (!editable) return;
    updateColumns(board.columns.filter((column) => column.id !== columnId));
  };

  const renameColumn = (columnId: string, title: string) => {
    if (!editable) return;
    updateColumns(
      board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              title,
            }
          : column,
      ),
    );
  };

  const addCard = (columnId: string) => {
    if (!editable) return;
    updateColumns(
      board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: [...column.cards, { id: createId(), title: "" }],
            }
          : column,
      ),
    );
  };

  const updateCard = (columnId: string, cardId: string, title: string) => {
    if (!editable) return;
    updateColumns(
      board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: column.cards.map((card) =>
                card.id === cardId
                  ? {
                      ...card,
                      title,
                    }
                  : card,
              ),
            }
          : column,
      ),
    );
  };

  const removeCard = (columnId: string, cardId: string) => {
    if (!editable) return;
    updateColumns(
      board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cards: column.cards.filter((card) => card.id !== cardId),
            }
          : column,
      ),
    );
  };

  const reorderColumns = (sourceColumnId: string, targetColumnId: string) => {
    const fromIndex = board.columns.findIndex((column) => column.id === sourceColumnId);
    const toIndex = board.columns.findIndex((column) => column.id === targetColumnId);
    if (fromIndex === -1 || toIndex === -1) return;

    updateColumns(moveArrayItem(board.columns, fromIndex, toIndex));
  };

  const moveCardToColumn = (
    card: KanbanCard,
    sourceColumnId: string,
    targetColumnId: string,
    targetIndex: number,
  ) => {
    const sourceColumn = board.columns.find((column) => column.id === sourceColumnId);
    const targetColumn = board.columns.find((column) => column.id === targetColumnId);
    if (!sourceColumn || !targetColumn) return;

    const sourceCardIndex = sourceColumn.cards.findIndex((item) => item.id === card.id);
    if (sourceCardIndex === -1) return;

    if (sourceColumnId === targetColumnId) {
      const boundedIndex = Math.max(0, Math.min(targetIndex, sourceColumn.cards.length));
      const nextColumns = board.columns.map((column) =>
        column.id === sourceColumnId
          ? {
              ...column,
              cards: moveArrayItem(column.cards, sourceCardIndex, boundedIndex),
            }
          : column,
      );

      updateColumns(nextColumns);
      return;
    }

    const nextColumns = board.columns.map((column) => {
      if (column.id === sourceColumnId) {
        return {
          ...column,
          cards: column.cards.filter((item) => item.id !== card.id),
        };
      }

      if (column.id === targetColumnId) {
        const nextCards = [...column.cards];
        const boundedIndex = Math.max(0, Math.min(targetIndex, nextCards.length));
        nextCards.splice(boundedIndex, 0, card);
        return {
          ...column,
          cards: nextCards,
        };
      }

      return column;
    });

    updateColumns(nextColumns);
  };

  const reorderCardWithinColumn = (columnId: string, sourceCardId: string, targetCardId: string) => {
    const column = board.columns.find((entry) => entry.id === columnId);
    if (!column) return;

    const fromIndex = column.cards.findIndex((card) => card.id === sourceCardId);
    const toIndex = column.cards.findIndex((card) => card.id === targetCardId);
    if (fromIndex === -1 || toIndex === -1) return;

    updateColumns(
      board.columns.map((entry) =>
        entry.id === columnId
          ? {
              ...entry,
              cards: moveArrayItem(entry.cards, fromIndex, toIndex),
            }
          : entry,
      ),
    );
  };

  const onDropColumn = (targetColumnId: string) => {
    if (!editable || !draggedItem || draggedItem.type !== "column") return;
    reorderColumns(draggedItem.columnId, targetColumnId);
    setDraggedItem(null);
    setDropTarget(null);
  };

  const onColumnDragStart = (event: React.DragEvent<HTMLButtonElement>, columnId: string) => {
    if (!editable) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `column:${columnId}`);
    setDraggedItem({ type: "column", columnId });
    setDropTarget(`column:${columnId}`);
  };

  const onCardDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    columnId: string,
    cardId: string,
  ) => {
    if (!editable) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `card:${cardId}`);
    setDraggedItem({
      type: "card",
      columnId,
      cardId,
    });
    setDropTarget(`card:${cardId}`);
  };

  const onDropCardOnCard = (targetColumnId: string, targetCardId: string) => {
    if (!editable || !draggedItem || draggedItem.type !== "card") return;

    if (draggedItem.columnId === targetColumnId) {
      reorderCardWithinColumn(targetColumnId, draggedItem.cardId, targetCardId);
    } else {
      const targetColumn = board.columns.find((column) => column.id === targetColumnId);
      if (!targetColumn) return;
      const card = board.columns
        .find((column) => column.id === draggedItem.columnId)
        ?.cards.find((entry) => entry.id === draggedItem.cardId);
      if (!card) return;
      const index = targetColumn.cards.findIndex((entry) => entry.id === targetCardId);
      moveCardToColumn(card, draggedItem.columnId, targetColumnId, index);
    }

    setDraggedItem(null);
    setDropTarget(null);
  };

  const onDropCardOnColumn = (targetColumnId: string) => {
    if (!editable || !draggedItem || draggedItem.type !== "card") return;
    const card = board.columns
      .find((column) => column.id === draggedItem.columnId)
      ?.cards.find((entry) => entry.id === draggedItem.cardId);

    if (!card) return;

    const targetColumn = board.columns.find((column) => column.id === targetColumnId);
    if (!targetColumn) return;

    moveCardToColumn(card, draggedItem.columnId, targetColumnId, targetColumn.cards.length);
    setDraggedItem(null);
    setDropTarget(null);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Kanban board
        </p>
        {editable ? (
          <Button type="button" size="sm" variant="outline" onClick={addColumn}>
            <Plus className="mr-1 h-4 w-4" /> Add column
          </Button>
        ) : null}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {board.columns.map((column) => (
          <div
            key={column.id}
            onDragOver={(event) => {
              if (!editable || draggedItem?.type !== "column") return;
              event.preventDefault();
              setDropTarget(`column:${column.id}`);
            }}
            onDrop={(event) => {
              event.preventDefault();
              onDropColumn(column.id);
            }}
            onDragEnd={() => {
              setDraggedItem(null);
              setDropTarget(null);
            }}
            className={cn(
              "flex w-[300px] min-w-[300px] flex-col rounded-xl border border-border/70 bg-muted/20 p-3",
              dropTarget === `column:${column.id}` && draggedItem?.type === "column"
                ? "ring-2 ring-primary/30"
                : undefined,
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                draggable={editable}
                onDragStart={(event) => onColumnDragStart(event, column.id)}
                onDragEnd={() => {
                  setDraggedItem(null);
                  setDropTarget(null);
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="Drag column"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <Input
                value={column.title}
                readOnly={!editable}
                onChange={(event) => renameColumn(column.id, event.target.value)}
                className="h-8 border-0 bg-transparent px-1 text-sm font-medium focus-visible:ring-1"
              />
              {editable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removeColumn(column.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            <div
              className={cn(
                "min-h-[80px] space-y-2 rounded-lg border border-dashed border-border/60 p-2",
                dropTarget === `column-drop:${column.id}` && draggedItem?.type === "card"
                  ? "border-primary/60 bg-primary/5"
                  : undefined,
              )}
              onDragOver={(event) => {
                if (!editable || draggedItem?.type !== "card") return;
                event.preventDefault();
                setDropTarget(`column-drop:${column.id}`);
              }}
              onDrop={(event) => {
                event.preventDefault();
                onDropCardOnColumn(column.id);
              }}
            >
              {column.cards.length === 0 ? (
                <p className="rounded-md border border-border/50 bg-background/70 px-2 py-3 text-xs text-muted-foreground">
                  Drop a card here
                </p>
              ) : null}

              {column.cards.map((card) => (
                <div
                  key={card.id}
                  onDragOver={(event) => {
                    if (!editable || draggedItem?.type !== "card") return;
                    event.preventDefault();
                    setDropTarget(`card:${card.id}`);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    onDropCardOnCard(column.id, card.id);
                  }}
                  onDragEnd={() => {
                    setDraggedItem(null);
                    setDropTarget(null);
                  }}
                  className={cn(
                    "rounded-lg border border-border/60 bg-background p-2 shadow-sm",
                    dropTarget === `card:${card.id}` && draggedItem?.type === "card"
                      ? "ring-2 ring-primary/30"
                      : undefined,
                  )}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      draggable={editable}
                      onDragStart={(event) => onCardDragStart(event, column.id, card.id)}
                      onDragEnd={() => {
                        setDraggedItem(null);
                        setDropTarget(null);
                      }}
                      className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      aria-label="Drag card"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <textarea
                      value={card.title}
                      readOnly={!editable}
                      onChange={(event) => updateCard(column.id, card.id, event.target.value)}
                      placeholder="Card title"
                      className="min-h-[48px] w-full resize-y border-0 bg-transparent text-sm outline-none"
                    />
                    {editable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => removeCard(column.id, card.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {editable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 justify-start"
                onClick={() => addCard(column.id)}
              >
                <Plus className="mr-1 h-4 w-4" /> Add card
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
};
