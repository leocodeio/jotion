"use client";

import { cn } from "@/lib/utils";
import { uploadMediaFile } from "@/lib/local-media-client";
import { KanbanBoard } from "@/components/kanban-board";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createDefaultKanbanDocument,
  type KanbanDocument,
  parseKanbanDocumentPayload,
  parseKanbanContent,
  serializeKanbanBlockPayload,
} from "@/lib/kanban";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import {
  CheckSquare2,
  ChevronDownSquare,
  CornerDownLeft,
  ImageIcon,
  KanbanSquare,
  Pilcrow,
  type LucideIcon,
} from "lucide-react";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { marked } from "marked";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";

interface EditorProps {
  onChange: (value: string) => void;
  initialContent?: string;
  editable?: boolean;
}

interface SlashCommand {
  value: "text" | "toggle" | "todo" | "image" | "kanban";
  title: string;
  description: string;
  template: string;
  visualHtml: string;
  cursorOffset?: number;
  aliases: string[];
  icon: LucideIcon;
}

interface SlashCommandContext {
  start: number;
  end: number;
  query: string;
}

interface PendingImageInsertion {
  mode: "markdown" | "visual";
  slashContext?: SlashCommandContext;
  visualRange?: Range;
}

interface KanbanBlockMatch {
  start: number;
  end: number;
  payload: string;
}

const KANBAN_BLOCK_PATTERN = /```kanban\s*\n([\s\S]*?)```/g;

const getCodeBlockLanguage = (className?: string) => {
  if (!className) return "";
  const match = /language-([^\s]+)/.exec(className);
  return match?.[1]?.toLowerCase() ?? "";
};

const decodeKanbanPayload = (encodedPayload: string) => {
  try {
    return decodeURIComponent(encodedPayload);
  } catch {
    return "";
  }
};

const buildVisualKanbanPlaceholderHtml = (payload: string, blockIndex?: number) => {
  const encodedPayload = encodeURIComponent(payload.trim());
  const indexAttribute = typeof blockIndex === "number" ? ` data-jotion-kanban-index="${blockIndex}"` : "";

  return `<div data-jotion-kanban="${encodedPayload}"${indexAttribute} contenteditable="false" class="my-3 cursor-pointer rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5">Kanban board · Click to edit</div><p><br /></p>`;
};

const buildKanbanBlockMarkdown = (payload: string) => `\n\
\
\`\`\`kanban
${payload.trim()}
\`\`\`
\
`;

const getKanbanBlockMatches = (content: string): KanbanBlockMatch[] => {
  const matches = Array.from(content.matchAll(/```kanban\s*\n([\s\S]*?)```/g));

  return matches.map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    payload: match[1]?.trim() ?? "",
  }));
};

const replaceKanbanBlockAtIndex = (content: string, blockIndex: number, nextPayload: string) => {
  const matches = getKanbanBlockMatches(content);
  const target = matches[blockIndex];
  if (!target) return content;

  const nextBlock = buildKanbanBlockMarkdown(nextPayload).trim();
  return `${content.slice(0, target.start)}${nextBlock}${content.slice(target.end)}`;
};

const createInlineKanbanBlockTemplate = () =>
  buildKanbanBlockMarkdown(serializeKanbanBlockPayload(createDefaultKanbanDocument()));

const normalizeLegacyKanbanContent = (content?: string | null) => {
  const legacy = parseKanbanContent(content);
  if (!legacy) return content ?? "";

  return buildKanbanBlockMarkdown(serializeKanbanBlockPayload(legacy)).trim();
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    value: "text",
    title: "Text",
    description: "Insert a normal text block.",
    template: "",
    visualHtml: "<p><br /></p>",
    icon: Pilcrow,
    aliases: ["paragraph", "normal"],
  },
  {
    value: "toggle",
    title: "Toggle",
    description: "Insert a collapsible section.",
    template: "<details>\n<summary>Toggle</summary>\n\n</details>\n",
    visualHtml: "<details><summary>Toggle</summary><p><br /></p></details>",
    cursorOffset: "<details>\n<summary>Toggle</summary>\n\n".length,
    icon: ChevronDownSquare,
    aliases: ["details", "collapse"],
  },
  {
    value: "todo",
    title: "To-do",
    description: "Insert a checklist item you can tick off.",
    template: "- [ ] ",
    visualHtml: "<ul><li><input type=\"checkbox\" /> </li></ul>",
    icon: CheckSquare2,
    aliases: ["to-do", "checkbox", "checklist"],
  },
  {
    value: "kanban",
    title: "Kanban",
    description: "Insert an inline Kanban board.",
    template: "",
    visualHtml: "",
    icon: KanbanSquare,
    aliases: ["board", "task board", "columns"],
  },
  {
    value: "image",
    title: "Image",
    description: "Upload and insert an image.",
    template: "",
    visualHtml: "",
    icon: ImageIcon,
    aliases: ["photo", "picture", "media", "upload"],
  },
];

const normalizeSlashSearchTerm = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9-]/g, "");

const getSlashCommandScore = (command: SlashCommand, query: string, index: number) => {
  const normalizedQuery = normalizeSlashSearchTerm(query);
  if (!normalizedQuery) return index;

  let bestScore = Number.POSITIVE_INFINITY;
  const terms = [command.value, command.title, ...command.aliases].map(normalizeSlashSearchTerm);

  terms.forEach((term) => {
    if (term === normalizedQuery) {
      bestScore = Math.min(bestScore, 0);
      return;
    }

    if (term.startsWith(normalizedQuery)) {
      bestScore = Math.min(bestScore, 10 + (term.length - normalizedQuery.length));
      return;
    }

    const containsIndex = term.indexOf(normalizedQuery);
    if (containsIndex !== -1) {
      bestScore = Math.min(bestScore, 50 + containsIndex);
    }
  });

  return bestScore;
};

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ className, ...props }) => (
    <h1 className={cn("mt-6 mb-2 text-3xl font-bold tracking-tight", className)} {...props} />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn("mt-5 mb-2 text-2xl font-semibold tracking-tight", className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("mt-4 mb-2 text-xl font-semibold", className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("my-2 whitespace-pre-wrap leading-7 text-foreground", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("my-2 list-disc pl-5 space-y-1", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("my-2 list-decimal pl-5 space-y-1", className)} {...props} />
  ),
  li: ({ className, children, ...props }) => {
    const hasTaskCheckbox = Children.toArray(children).some(
      (child) =>
        isValidElement<{ type?: string }>(child) &&
        child.type === "input" &&
        child.props.type === "checkbox",
    );

    if (hasTaskCheckbox) {
      return (
        <li
          className={cn(
            "my-1 -ml-2 flex list-none items-start gap-2 rounded-md px-2 py-1 leading-7 marker:hidden",
            className,
          )}
          {...props}
        >
          {children}
        </li>
      );
    }

    return <li className={cn("leading-7 marker:text-muted-foreground", className)} {...props} />;
  },
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("my-3 border-l-2 border-border/80 pl-4 text-muted-foreground italic", className)}
      {...props}
    />
  ),
  code: ({ className, ...props }) => (
    <code
      className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn("my-3 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-sm", className)}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a className={cn("text-primary underline underline-offset-4", className)} {...props} />
  ),
  img: ({ className, src, alt }) => {
    if (!src) return null;
    const imageSource = typeof src === "string" ? src : String(src);

    return (
      <span className={cn("my-3 block overflow-hidden rounded-lg border border-border/50", className)}>
        <Image
          src={imageSource}
          alt={alt ?? ""}
          width={1200}
          height={800}
          unoptimized
          className="h-auto w-full object-contain"
        />
      </span>
    );
  },
  details: ({ className, ...props }) => (
    <details
      className={cn(
        "group my-3 rounded-lg border border-border/70 bg-muted/25 p-3 transition-colors open:bg-muted/40",
        className,
      )}
      {...props}
    />
  ),
  summary: ({ className, children, ...props }) => (
    <summary
      className={cn(
        "flex list-none cursor-pointer items-center gap-2 font-medium text-foreground [&::-webkit-details-marker]:hidden",
        className,
      )}
      {...props}
    >
      <span className="inline-block text-[10px] text-muted-foreground transition-transform group-open:rotate-90">
        ▶
      </span>
      <span>{children}</span>
    </summary>
  ),
  input: ({ className, ...props }) => {
    if (props.type === "checkbox") {
      return (
        <input
          {...props}
          disabled
          className={cn(
            "mt-1 h-4 w-4 shrink-0 rounded border border-input align-middle accent-primary",
            className,
          )}
        />
      );
    }

    return <input className={className} {...props} />;
  },
};

const getSlashCommandContext = (
  content: string,
  cursorPosition: number,
): SlashCommandContext | null => {
  const lineStart = content.lastIndexOf("\n", Math.max(cursorPosition - 1, 0)) + 1;
  const lineToCursor = content.slice(lineStart, cursorPosition);
  const slashIndex = lineToCursor.lastIndexOf("/");

  if (slashIndex === -1) return null;

  if (slashIndex > 0 && !/\s/.test(lineToCursor[slashIndex - 1])) return null;

  const query = lineToCursor.slice(slashIndex + 1);
  if (/\s/.test(query)) return null;

  return {
    start: lineStart + slashIndex,
    end: cursorPosition,
    query: query.toLowerCase(),
  };
};

const Editor = ({ onChange, initialContent, editable }: EditorProps) => {
  const [value, setValue] = useState(normalizeLegacyKanbanContent(initialContent));
  const [isUploading, setIsUploading] = useState(false);
  const [editorMode, setEditorMode] = useState<"visual" | "markdown">("visual");
  const [editingVisualKanbanIndex, setEditingVisualKanbanIndex] = useState<number | null>(null);
  const [slashContext, setSlashContext] = useState<SlashCommandContext | null>(null);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageUploadInputRef = useRef<HTMLInputElement>(null);
  const visualEditorRef = useRef<HTMLDivElement>(null);
  const isVisualEditingRef = useRef(false);
  const pendingImageInsertionRef = useRef<PendingImageInsertion | null>(null);
  const turndownService = useMemo(
    () => {
      const service = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
      });

      service.addRule("taskListItem", {
        filter: (node) =>
          node.nodeName === "LI" &&
          Boolean((node as HTMLElement).querySelector("input[type='checkbox']")),
        replacement: (_content, node) => {
          const listItem = node as HTMLElement;
          const checkbox = listItem.querySelector("input[type='checkbox']") as
            | HTMLInputElement
            | null;
          const label = listItem.textContent?.replace(/\s+/g, " ").trim() ?? "";
          const checkMark = checkbox?.checked || checkbox?.hasAttribute("checked") ? "x" : " ";
          return `\n- [${checkMark}] ${label}\n`;
        },
      });

      service.addRule("detailsBlock", {
        filter: "details",
        replacement: (_content, node) => {
          const detailsNode = node as HTMLElement;
          const summaryNode = detailsNode.querySelector("summary");
          const summaryText = summaryNode?.textContent?.trim() || "Toggle";

          const clone = detailsNode.cloneNode(true) as HTMLElement;
          const cloneSummary = clone.querySelector("summary");
          if (cloneSummary) cloneSummary.remove();

          const bodyHtml = clone.innerHTML.trim();
          const convertedBody = bodyHtml ? service.turndown(bodyHtml).trim() : "";
          const bodyMarkdown = convertedBody || bodyHtml;

          return `\n<details>\n<summary>${summaryText}</summary>\n\n${bodyMarkdown}\n</details>\n`;
        },
      });

      service.addRule("kanbanBlock", {
        filter: (node) =>
          node.nodeName === "DIV" &&
          Boolean((node as HTMLElement).getAttribute("data-jotion-kanban")),
        replacement: (_content, node) => {
          const encodedPayload = (node as HTMLElement).getAttribute("data-jotion-kanban") ?? "";
          const payload = decodeKanbanPayload(encodedPayload);
          if (!payload) return "";
          return buildKanbanBlockMarkdown(payload);
        },
      });

      return service;
    },
    [],
  );

  const toHtml = (markdownValue: string) => {
    let blockIndex = -1;
    const transformed = markdownValue.replace(KANBAN_BLOCK_PATTERN, (_full, payload: string) => {
      blockIndex += 1;
      return buildVisualKanbanPlaceholderHtml(payload.trim(), blockIndex);
    });
    const rendered = marked.parse(transformed, { gfm: true, breaks: true });
    return typeof rendered === "string" ? rendered : "";
  };

  const toMarkdown = (htmlValue: string) =>
    turndownService.turndown(htmlValue).replace(/\n{3,}/g, "\n\n").trim();

  const normalizeVisualToggleLists = (rootElement: HTMLElement) => {
    rootElement.querySelectorAll("details ul, details ol").forEach((listNode) => {
      const listElement = listNode as HTMLElement;
      const listItems = Array.from(listElement.children).filter(
        (child): child is HTMLLIElement => child instanceof HTMLLIElement,
      );
      if (!listItems.length) return;

      const hasCheckboxItem = listItems.some((item) =>
        Boolean(item.querySelector("input[type='checkbox']")),
      );

      if (!hasCheckboxItem) {
        const replacementNodes = listItems
          .map((item) => {
            const text = item.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
            if (!text) return null;

            const paragraph = document.createElement("p");
            paragraph.innerHTML = item.innerHTML;
            return paragraph;
          })
          .filter((node): node is HTMLParagraphElement => node !== null);

        if (!replacementNodes.length) {
          listElement.remove();
          return;
        }

        const fragment = document.createDocumentFragment();
        replacementNodes.forEach((node) => fragment.appendChild(node));
        listElement.replaceWith(fragment);
        return;
      }

      const nodesToInsertAfterList = listItems
        .map((item) => {
          if (item.querySelector("input[type='checkbox']")) return null;

          const text = item.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
          item.remove();
          if (!text) return null;

          const paragraph = document.createElement("p");
          paragraph.innerHTML = item.innerHTML;
          return paragraph;
        })
        .filter((node): node is HTMLParagraphElement => node !== null);

      nodesToInsertAfterList
        .slice()
        .reverse()
        .forEach((node) => {
          listElement.insertAdjacentElement("afterend", node);
        });

      if (!listElement.querySelector("li")) {
        listElement.remove();
      }
    });
  };

  const styleVisualTaskLists = (rootElement: HTMLElement) => {
    rootElement.querySelectorAll("ul").forEach((listElement) => {
      if (!listElement.querySelector("input[type='checkbox']")) return;

      (listElement as HTMLElement).style.listStyleType = "none";
      (listElement as HTMLElement).style.paddingLeft = "0";
    });

    rootElement.querySelectorAll("li").forEach((listItemElement) => {
      if (!listItemElement.querySelector("input[type='checkbox']")) return;

      (listItemElement as HTMLElement).style.listStyleType = "none";
      (listItemElement as HTMLElement).style.marginLeft = "0";
    });
  };

  const updateKanbanBlockByIndex = useCallback(
    (blockIndex: number, nextBoard: KanbanDocument) => {
      const nextPayload = serializeKanbanBlockPayload(nextBoard);
      setValue((currentValue) => {
        const nextValue = replaceKanbanBlockAtIndex(currentValue, blockIndex, nextPayload);
        onChange(nextValue);
        return nextValue;
      });
    },
    [onChange],
  );

  const markdownComponents = useMemo<Components>(() => {
    let kanbanRenderIndex = -1;

    return {
      ...MARKDOWN_COMPONENTS,
      code: ({ className, children, ...props }) => {
        if (getCodeBlockLanguage(className) === "kanban") {
          const payload = Children.toArray(children).map((child) => String(child)).join("").trim();
          let parsedPayload: unknown = null;
          try {
            parsedPayload = JSON.parse(payload);
          } catch {
            parsedPayload = null;
          }

          const board = parseKanbanDocumentPayload(parsedPayload) ?? createDefaultKanbanDocument();
          const blockIndex = ++kanbanRenderIndex;

          return (
            <div className="my-3">
              <KanbanBoard
                value={board}
                editable={editable !== false}
                onChange={(nextBoard) => {
                  if (editable === false) return;

                  updateKanbanBlockByIndex(blockIndex, nextBoard);
                }}
              />
            </div>
          );
        }

        return (
          <code
            className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]", className)}
            {...props}
          >
            {children}
          </code>
        );
      },
      pre: ({ className, ...props }) => {
        const onlyChild = Children.count(props.children) === 1
          ? (Children.only(props.children) as ReactElement<{ className?: string }> | null)
          : null;

        if (
          onlyChild &&
          isValidElement<{ className?: string }>(onlyChild) &&
          getCodeBlockLanguage(onlyChild.props.className) === "kanban"
        ) {
          return <>{props.children}</>;
        }

        return (
          <pre
            className={cn("my-3 overflow-x-auto rounded-lg bg-muted px-3 py-2 text-sm", className)}
            {...props}
          />
        );
      },
    };
  }, [editable, updateKanbanBlockByIndex]);

  const inlineKanbanBlocks = useMemo(() => {
    return getKanbanBlockMatches(value)
      .map((match, index) => {
        let parsedPayload: unknown = null;
        try {
          parsedPayload = JSON.parse(match.payload);
        } catch {
          parsedPayload = null;
        }

        const board = parseKanbanDocumentPayload(parsedPayload);
        if (!board) return null;

        return {
          index,
          board,
        };
      })
      .filter((entry): entry is { index: number; board: ReturnType<typeof createDefaultKanbanDocument> } => entry !== null);
  }, [value]);

  const visualEditingKanban = useMemo(() => {
    if (editingVisualKanbanIndex === null) return null;
    return inlineKanbanBlocks.find((entry) => entry.index === editingVisualKanbanIndex) ?? null;
  }, [editingVisualKanbanIndex, inlineKanbanBlocks]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashContext || editable === false) return [];

    return SLASH_COMMANDS.map((command, index) => ({
      command,
      index,
      score: getSlashCommandScore(command, slashContext.query, index),
    }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map(({ command }) => command);
  }, [slashContext, editable]);

  useEffect(() => {
    if (!filteredSlashCommands.length) {
      setSelectedSlashCommandIndex(0);
      return;
    }

    if (selectedSlashCommandIndex > filteredSlashCommands.length - 1) {
      setSelectedSlashCommandIndex(0);
    }
  }, [filteredSlashCommands.length, selectedSlashCommandIndex]);

  useEffect(() => {
    setValue(normalizeLegacyKanbanContent(initialContent));
  }, [initialContent]);

  useEffect(() => {
    if (editorMode !== "visual") return;
    if (isVisualEditingRef.current) return;

    const editorElement = visualEditorRef.current;
    if (!editorElement) return;

    editorElement.innerHTML = value.trim() ? toHtml(value) : "<p></p>";
    normalizeVisualToggleLists(editorElement);
    styleVisualTaskLists(editorElement);
  }, [editorMode, value]);

  useEffect(() => {
    if (editorMode !== "visual") return;
    setSlashContext(null);
    setSelectedSlashCommandIndex(0);
  }, [editorMode]);

  const isSlashCommandMenuOpen = editable !== false && slashContext !== null;
  const isSlashCommandMenuVisible = isSlashCommandMenuOpen && filteredSlashCommands.length > 0;
  const selectedSlashCommand = filteredSlashCommands[selectedSlashCommandIndex];

  const closeSlashCommandMenu = () => {
    setSlashContext(null);
    setSelectedSlashCommandIndex(0);
  };

  const updateVisualSlashContext = (editorElement: HTMLDivElement) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setSlashContext(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorElement.contains(range.endContainer)) {
      setSlashContext(null);
      return;
    }

    const prefixRange = range.cloneRange();
    prefixRange.selectNodeContents(editorElement);
    prefixRange.setEnd(range.endContainer, range.endOffset);

    const cursorPosition = prefixRange.toString().length;
    const plainText = editorElement.innerText.replace(/\r\n/g, "\n");
    const nextSlashContext = getSlashCommandContext(plainText, cursorPosition);

    setSlashContext(nextSlashContext);
    if (nextSlashContext) setSelectedSlashCommandIndex(0);
  };

  const triggerImagePicker = () => {
    imageUploadInputRef.current?.click();
  };

  const prepareImageInsertion = () => {
    if (!slashContext) return;

    if (editorMode === "visual") {
      const editorElement = visualEditorRef.current;
      const selection = window.getSelection();
      if (!editorElement || !selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      if (!editorElement.contains(range.endContainer)) return;

      pendingImageInsertionRef.current = {
        mode: "visual",
        visualRange: range.cloneRange(),
      };
    } else {
      pendingImageInsertionRef.current = {
        mode: "markdown",
        slashContext: { ...slashContext },
      };
    }

    closeSlashCommandMenu();
    triggerImagePicker();
  };

  const applyVisualSlashCommand = (command: SlashCommand) => {
    const editorElement = visualEditorRef.current;
    if (!editorElement) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editorElement.contains(range.endContainer)) return;

    if (range.endContainer.nodeType === Node.TEXT_NODE) {
      const textNode = range.endContainer as Text;
      const textBeforeCursor = textNode.data.slice(0, range.endOffset);
      const match = textBeforeCursor.match(/\/[^\s/]*$/);
      if (match) {
        const deleteRange = document.createRange();
        deleteRange.setStart(textNode, textBeforeCursor.length - match[0].length);
        deleteRange.setEnd(textNode, range.endOffset);
        deleteRange.deleteContents();
        range.setStart(textNode, textBeforeCursor.length - match[0].length);
        range.collapse(true);
      }
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = command.visualHtml;

    const fragment = document.createDocumentFragment();
    let lastInsertedNode: ChildNode | null = null;
    while (wrapper.firstChild) {
      const node = wrapper.firstChild;
      lastInsertedNode = node;
      fragment.appendChild(node);
    }

    range.insertNode(fragment);
    if (lastInsertedNode) {
      range.setStartAfter(lastInsertedNode);
      range.setEndAfter(lastInsertedNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    normalizeVisualToggleLists(editorElement);
    styleVisualTaskLists(editorElement);
    syncVisualToMarkdown(editorElement.innerHTML);
    closeSlashCommandMenu();
  };

  const applySlashCommand = (command: SlashCommand) => {
    if (!slashContext) return;

    if (command.value === "kanban") {
      if (editorMode === "visual") {
        applyVisualSlashCommand({
          ...command,
          visualHtml: buildVisualKanbanPlaceholderHtml(
            serializeKanbanBlockPayload(createDefaultKanbanDocument()),
          ),
        });
        return;
      }

      const inlineBlock = createInlineKanbanBlockTemplate();
      const nextValue = value.slice(0, slashContext.start) + inlineBlock + value.slice(slashContext.end);
      const nextCursorPosition = slashContext.start + inlineBlock.length;

      setValue(nextValue);
      onChange(nextValue);
      closeSlashCommandMenu();

      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
      });
      return;
    }

    if (command.value === "image") {
      if (isUploading) return;
      prepareImageInsertion();
      return;
    }

    if (editorMode === "visual") {
      applyVisualSlashCommand(command);
      return;
    }

    const nextValue =
      value.slice(0, slashContext.start) + command.template + value.slice(slashContext.end);
    const nextCursorPosition =
      slashContext.start + (command.cursorOffset ?? command.template.length);

    setValue(nextValue);
    onChange(nextValue);
    closeSlashCommandMenu();

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      pendingImageInsertionRef.current = null;
      return;
    }

    setIsUploading(true);
    try {
      const url = await uploadMediaFile(file);
      const markdownImage = `![${file.name}](${url})`;
      const pendingImageInsertion = pendingImageInsertionRef.current;

      if (pendingImageInsertion?.mode === "markdown" && pendingImageInsertion.slashContext) {
        const { start, end } = pendingImageInsertion.slashContext;
        const nextValue = value.slice(0, start) + markdownImage + value.slice(end);
        const nextCursorPosition = start + markdownImage.length;

        setValue(nextValue);
        onChange(nextValue);

        requestAnimationFrame(() => {
          const textarea = textareaRef.current;
          if (!textarea) return;

          textarea.focus();
          textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
        });
      } else if (pendingImageInsertion?.mode === "visual" && pendingImageInsertion.visualRange) {
        const editorElement = visualEditorRef.current;
        const selection = window.getSelection();
        const range = pendingImageInsertion.visualRange;

        if (editorElement && selection) {
          if (range.endContainer.nodeType === Node.TEXT_NODE) {
            const textNode = range.endContainer as Text;
            const textBeforeCursor = textNode.data.slice(0, range.endOffset);
            const match = textBeforeCursor.match(/\/[^\s/]*$/);
            if (match) {
              const deleteRange = document.createRange();
              deleteRange.setStart(textNode, textBeforeCursor.length - match[0].length);
              deleteRange.setEnd(textNode, range.endOffset);
              deleteRange.deleteContents();
              range.setStart(textNode, textBeforeCursor.length - match[0].length);
              range.collapse(true);
            }
          }

          const imageElement = document.createElement("img");
          imageElement.src = url;
          imageElement.alt = file.name;

          range.insertNode(imageElement);

          const nextParagraph = document.createElement("p");
          nextParagraph.innerHTML = "<br />";
          imageElement.insertAdjacentElement("afterend", nextParagraph);

          const nextRange = document.createRange();
          nextRange.setStart(nextParagraph, 0);
          nextRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(nextRange);

          normalizeVisualToggleLists(editorElement);
          styleVisualTaskLists(editorElement);
          syncVisualToMarkdown(editorElement.innerHTML);
        }
      } else {
        setValue((currentValue) => {
          const nextValue = `${currentValue}\n\n${markdownImage}`.trim();
          onChange(nextValue);
          return nextValue;
        });
      }

      pendingImageInsertionRef.current = null;
      closeSlashCommandMenu();
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const onTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    const cursorPosition = event.target.selectionStart ?? nextValue.length;
    const nextSlashContext = getSlashCommandContext(nextValue, cursorPosition);

    setSlashContext(nextSlashContext);
    setSelectedSlashCommandIndex(0);
    setValue(nextValue);
    onChange(nextValue);
  };

  const onTextSelect = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    if (editable === false) return;

    const cursorPosition = event.currentTarget.selectionStart ?? value.length;
    setSlashContext(getSlashCommandContext(value, cursorPosition));
    setSelectedSlashCommandIndex(0);
  };

  const onTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isSlashCommandMenuOpen) return;

    if (event.key === "ArrowDown") {
      if (!filteredSlashCommands.length) return;
      event.preventDefault();
      setSelectedSlashCommandIndex((currentIndex) => {
        if (currentIndex >= filteredSlashCommands.length - 1) return 0;
        return currentIndex + 1;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      if (!filteredSlashCommands.length) return;
      event.preventDefault();
      setSelectedSlashCommandIndex((currentIndex) => {
        if (currentIndex <= 0) return filteredSlashCommands.length - 1;
        return currentIndex - 1;
      });
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      const selectedCommand = filteredSlashCommands[selectedSlashCommandIndex];
      if (!selectedCommand) return;
      event.preventDefault();
      applySlashCommand(selectedCommand);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSlashCommandMenu();
    }
  };

  const onVisualFocus = () => {
    isVisualEditingRef.current = true;
  };

  const syncVisualToMarkdown = (htmlValue: string) => {
    const nextValue = toMarkdown(htmlValue);
    setValue(nextValue);
    onChange(nextValue);
  };

  const onVisualInput = (event: React.FormEvent<HTMLDivElement>) => {
    normalizeVisualToggleLists(event.currentTarget);
    styleVisualTaskLists(event.currentTarget);
    updateVisualSlashContext(event.currentTarget);
    syncVisualToMarkdown(event.currentTarget.innerHTML);
  };

  const onVisualMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    const targetElement = event.target instanceof Element ? event.target : null;
    const kanbanPlaceholder = targetElement?.closest("[data-jotion-kanban-index]");
    if (kanbanPlaceholder && editable !== false) {
      const blockIndex = Number(kanbanPlaceholder.getAttribute("data-jotion-kanban-index"));
      if (Number.isFinite(blockIndex)) {
        setEditingVisualKanbanIndex(blockIndex);
      }
    }

    updateVisualSlashContext(event.currentTarget);
  };

  const onVisualKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const anchorNode = selection.getRangeAt(0).startContainer;
        const anchorElement =
          anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
        const summaryElement =
          anchorNode instanceof Element
            ? anchorNode.closest("summary")
            : anchorNode.parentElement?.closest("summary");
        const detailsElement = summaryElement?.closest("details");

        if (summaryElement && detailsElement && !detailsElement.hasAttribute("open")) {
          event.preventDefault();

          const nextParagraph = document.createElement("p");
          nextParagraph.innerHTML = "<br />";
          detailsElement.insertAdjacentElement("afterend", nextParagraph);

          const nextRange = document.createRange();
          nextRange.setStart(nextParagraph, 0);
          nextRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(nextRange);

          closeSlashCommandMenu();
          return;
        }

        const taskListItemElement = anchorElement?.closest("li");
        const toggleContainerElement = anchorElement?.closest("details");
        if (
          taskListItemElement &&
          toggleContainerElement &&
          taskListItemElement.querySelector("input[type='checkbox']")
        ) {
          event.preventDefault();

          const listContainer = taskListItemElement.closest("ul,ol");
          const nextParagraph = document.createElement("p");
          nextParagraph.innerHTML = "<br />";

          if (listContainer) {
            listContainer.insertAdjacentElement("afterend", nextParagraph);
          } else {
            taskListItemElement.insertAdjacentElement("afterend", nextParagraph);
          }

          const nextRange = document.createRange();
          nextRange.setStart(nextParagraph, 0);
          nextRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(nextRange);

          styleVisualTaskLists(event.currentTarget);
          syncVisualToMarkdown(event.currentTarget.innerHTML);
          closeSlashCommandMenu();
          return;
        }
      }
    }

    if (!isSlashCommandMenuOpen) return;

    if (event.key === "ArrowDown") {
      if (!filteredSlashCommands.length) return;
      event.preventDefault();
      setSelectedSlashCommandIndex((currentIndex) => {
        if (currentIndex >= filteredSlashCommands.length - 1) return 0;
        return currentIndex + 1;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      if (!filteredSlashCommands.length) return;
      event.preventDefault();
      setSelectedSlashCommandIndex((currentIndex) => {
        if (currentIndex <= 0) return filteredSlashCommands.length - 1;
        return currentIndex - 1;
      });
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      const selectedCommand = filteredSlashCommands[selectedSlashCommandIndex];
      if (!selectedCommand) return;
      event.preventDefault();
      applySlashCommand(selectedCommand);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSlashCommandMenu();
    }
  };

  const onVisualBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    isVisualEditingRef.current = false;
    closeSlashCommandMenu();
    normalizeVisualToggleLists(event.currentTarget);
    styleVisualTaskLists(event.currentTarget);
    syncVisualToMarkdown(event.currentTarget.innerHTML);
  };

  const renderedOutput = (
    <div className="rounded-xl border border-border/70 bg-background/50 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Rendered output
      </p>
      {value.trim() ? (
        <div className="text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={markdownComponents}
          >
            {value}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Start writing to see rendered markdown.</p>
      )}
    </div>
  );

  const markdownEditor = (
    <div className="relative rounded-xl bg-muted/20 px-2 py-1">
      <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Markdown source
      </p>
      {isSlashCommandMenuOpen && (
        <div className="absolute left-3 top-9 z-20 w-[340px] rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-xl backdrop-blur-sm">
          <div className="px-2 pb-1 text-xs text-muted-foreground">
            Slash commands
            {selectedSlashCommand ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                <CornerDownLeft className="h-3 w-3" />
                {selectedSlashCommand.title}
              </span>
            ) : null}
          </div>
          {isSlashCommandMenuVisible ? (
            filteredSlashCommands.map((command, index) => {
              const Icon = command.icon;
              const isImageCommand = command.value === "image";
              return (
                <button
                  key={command.value}
                  type="button"
                  disabled={isImageCommand && isUploading}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySlashCommand(command);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                    isImageCommand && isUploading && "cursor-not-allowed opacity-60",
                    index === selectedSlashCommandIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <span className="mt-0.5 rounded-md bg-muted p-1">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{command.title}</span>
                    <span className="block text-xs text-muted-foreground">{command.description}</span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matching command.</p>
          )}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onTextChange}
        onSelect={onTextSelect}
        onKeyDown={onTextKeyDown}
        placeholder="Type '/' for commands..."
        className="w-full min-h-[420px] resize-y border-0 bg-transparent p-3 text-base outline-none focus-visible:ring-0"
      />
    </div>
  );

  const visualEditor = (
    <div className="relative rounded-xl border border-border/70 bg-background/50 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Visual editor
      </p>
      {isSlashCommandMenuOpen && (
        <div className="absolute left-3 top-9 z-20 w-[340px] rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-xl backdrop-blur-sm">
          <div className="px-2 pb-1 text-xs text-muted-foreground">
            Slash commands
            {selectedSlashCommand ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                <CornerDownLeft className="h-3 w-3" />
                {selectedSlashCommand.title}
              </span>
            ) : null}
          </div>
          {isSlashCommandMenuVisible ? (
            filteredSlashCommands.map((command, index) => {
              const Icon = command.icon;
              const isImageCommand = command.value === "image";
              return (
                <button
                  key={command.value}
                  type="button"
                  disabled={isImageCommand && isUploading}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySlashCommand(command);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                    isImageCommand && isUploading && "cursor-not-allowed opacity-60",
                    index === selectedSlashCommandIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <span className="mt-0.5 rounded-md bg-muted p-1">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{command.title}</span>
                    <span className="block text-xs text-muted-foreground">{command.description}</span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matching command.</p>
          )}
        </div>
      )}
      <div
        ref={visualEditorRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={onVisualFocus}
        onInput={onVisualInput}
        onMouseUp={onVisualMouseUp}
        onKeyDown={onVisualKeyDown}
        onBlur={onVisualBlur}
        className="min-h-[420px] rounded-lg bg-background/40 p-3 text-sm leading-7 outline-none focus-visible:ring-0 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border/80 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_details]:my-3 [&_details]:rounded-lg [&_details]:border [&_details]:border-border/70 [&_details]:bg-muted/25 [&_details]:p-3 [&_h1]:mb-2 [&_h1]:mt-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-semibold [&_img]:my-3 [&_img]:rounded-lg [&_img]:border [&_img]:border-border/50 [&_input[type='checkbox']]:mt-1 [&_input[type='checkbox']]:h-4 [&_input[type='checkbox']]:w-4 [&_input[type='checkbox']]:accent-primary [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:my-2 [&_summary]:flex [&_summary]:list-none [&_summary]:cursor-pointer [&_summary]:items-center [&_summary]:gap-2 [&_summary]:font-medium [&_summary::-webkit-details-marker]:hidden [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {editable !== false && (
        <div className="flex items-center justify-end gap-2">
          <input
            ref={imageUploadInputRef}
            id="editor-image-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
            disabled={isUploading}
          />
          <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5">
            <Button
              type="button"
              size="sm"
              variant={editorMode === "visual" ? "secondary" : "ghost"}
              className="h-8 px-3"
              onClick={() => setEditorMode("visual")}
            >
              Visual
            </Button>
            <Button
              type="button"
              size="sm"
              variant={editorMode === "markdown" ? "secondary" : "ghost"}
              className="h-8 px-3"
              onClick={() => setEditorMode("markdown")}
            >
              Markdown
            </Button>
          </div>
        </div>
      )}

      {editable === false ? renderedOutput : editorMode === "visual" ? visualEditor : markdownEditor}

      <Dialog
        open={editingVisualKanbanIndex !== null && editable !== false}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingVisualKanbanIndex(null);
        }}
      >
        <DialogContent className="max-w-[1200px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Edit Kanban block</DialogTitle>
            <DialogDescription>
              This board is embedded in your current page and will update in place.
            </DialogDescription>
          </DialogHeader>

          {visualEditingKanban ? (
            <KanbanBoard
              value={visualEditingKanban.board}
              editable={editable !== false}
              onChange={(nextBoard) => {
                if (editable === false) return;
                updateKanbanBlockByIndex(visualEditingKanban.index, nextBoard);
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Kanban block not found.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Editor;
