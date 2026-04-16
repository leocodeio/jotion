"use client";

import { cn } from "@/lib/utils";
import { uploadMediaFile } from "@/lib/local-media-client";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import {
  CheckSquare2,
  ChevronDownSquare,
  CornerDownLeft,
  ImageIcon,
  Pilcrow,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

interface EditorProps {
  onChange: (value: string) => void;
  initialContent?: string;
  editable?: boolean;
}

interface SlashCommand {
  value: "text" | "toggle" | "todo";
  title: string;
  description: string;
  template: string;
  cursorOffset?: number;
  aliases: string[];
  icon: LucideIcon;
}

interface SlashCommandContext {
  start: number;
  end: number;
  query: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    value: "text",
    title: "Text",
    description: "Insert a normal text block.",
    template: "",
    icon: Pilcrow,
    aliases: ["paragraph", "normal"],
  },
  {
    value: "toggle",
    title: "Toggle",
    description: "Insert a collapsible toggle block.",
    template: "<details>\n<summary>Toggle</summary>\n\n</details>\n",
    cursorOffset: "<details>\n<summary>Toggle</summary>\n\n".length,
    icon: ChevronDownSquare,
    aliases: ["details", "collapse"],
  },
  {
    value: "todo",
    title: "To-do",
    description: "Insert a checklist item.",
    template: "- [ ] ",
    icon: CheckSquare2,
    aliases: ["to-do", "checkbox", "checklist"],
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
  li: ({ className, ...props }) => (
    <li className={cn("leading-7 marker:text-muted-foreground", className)} {...props} />
  ),
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
      className={cn("group my-3 rounded-lg border border-border/70 bg-muted/30 p-3", className)}
      {...props}
    />
  ),
  summary: ({ className, ...props }) => (
    <summary className={cn("cursor-pointer font-medium text-foreground", className)} {...props} />
  ),
  input: ({ className, ...props }) => {
    if (props.type === "checkbox") {
      return (
        <input
          {...props}
          disabled
          className={cn(
            "mr-2 h-4 w-4 rounded border border-input align-middle accent-primary",
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
  const [value, setValue] = useState(initialContent ?? "");
  const [isUploading, setIsUploading] = useState(false);
  const [slashContext, setSlashContext] = useState<SlashCommandContext | null>(null);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const isSlashCommandMenuOpen = editable !== false && slashContext !== null;
  const isSlashCommandMenuVisible = isSlashCommandMenuOpen && filteredSlashCommands.length > 0;
  const selectedSlashCommand = filteredSlashCommands[selectedSlashCommandIndex];

  const closeSlashCommandMenu = () => {
    setSlashContext(null);
    setSelectedSlashCommandIndex(0);
  };

  const applySlashCommand = (command: SlashCommand) => {
    if (!slashContext) return;

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
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await uploadMediaFile(file);
      setValue((currentValue) => {
        const nextValue = `${currentValue}\n\n![${file.name}](${url})`.trim();
        onChange(nextValue);
        return nextValue;
      });
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
            components={MARKDOWN_COMPONENTS}
          >
            {value}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Start writing to see rendered markdown.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {editable !== false && (
        <div className="flex items-center gap-2">
          <label htmlFor="editor-image-upload">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={isUploading}
              asChild
            >
              <span>
                <ImageIcon className="h-4 w-4 mr-2" />
                {isUploading ? "Uploading..." : "Insert image"}
              </span>
            </Button>
          </label>
          <input
            id="editor-image-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      )}

      {editable === false ? (
        renderedOutput
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="relative rounded-xl bg-muted/20 px-2 py-1">
            <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Write
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
                    return (
                      <button
                        key={command.value}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          applySlashCommand(command);
                        }}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
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
                          <span className="block text-xs text-muted-foreground">
                            {command.description}
                          </span>
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
          {renderedOutput}
        </div>
      )}
    </div>
  );
};

export default Editor;
