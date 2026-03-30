"use client";

import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import {
  commonmark,
  toggleEmphasisCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { gfm, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { callCommand, replaceAll } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor, useInstance } from "@milkdown/react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Strikethrough,
} from "lucide-react";
import { useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MilkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

function ToolbarButton({
  onClick,
  children,
  title,
}: {
  onClick: (e: MouseEvent) => void;
  children: ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={onClick}
      title={title}
      className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-7 w-7 items-center justify-center rounded-md transition-colors"
    >
      {children}
    </button>
  );
}

function MilkdownToolbar() {
  const [loading, getInstance] = useInstance();

  const exec = useCallback(
    (command: Parameters<typeof callCommand>[0], ...args: unknown[]) => {
      if (loading) {
        return;
      }
      const editor = getInstance();
      if (!editor) {
        return;
      }
      editor.action(callCommand(command, ...args));
    },
    [loading, getInstance],
  );

  const handleParagraph = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(turnIntoTextCommand.key);
    },
    [exec],
  );
  const handleH1 = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(wrapInHeadingCommand.key, 1);
    },
    [exec],
  );
  const handleH2 = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(wrapInHeadingCommand.key, 2);
    },
    [exec],
  );
  const handleH3 = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(wrapInHeadingCommand.key, 3);
    },
    [exec],
  );
  const handleBold = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(toggleStrongCommand.key);
    },
    [exec],
  );
  const handleItalic = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(toggleEmphasisCommand.key);
    },
    [exec],
  );
  const handleStrikethrough = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(toggleStrikethroughCommand.key);
    },
    [exec],
  );
  const handleCode = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(wrapInBlockquoteCommand.key);
    },
    [exec],
  );
  const handleBulletList = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(wrapInBulletListCommand.key);
    },
    [exec],
  );
  const handleOrderedList = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(wrapInOrderedListCommand.key);
    },
    [exec],
  );
  const handleBlockquote = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      exec(wrapInBlockquoteCommand.key);
    },
    [exec],
  );

  return (
    <div className="border-border/40 flex items-center gap-0.5 border-b px-3 py-1.5">
      <ToolbarButton onClick={handleParagraph} title="Normal text">
        <Pilcrow className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={handleH1} title="Heading 1">
        <Heading1 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={handleH2} title="Heading 2">
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={handleH3} title="Heading 3">
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="bg-border/40 mx-1 h-4 w-px" />

      <ToolbarButton onClick={handleBold} title="Bold">
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={handleItalic} title="Italic">
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={handleStrikethrough} title="Strikethrough">
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={handleCode} title="Code">
        <Code className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="bg-border/40 mx-1 h-4 w-px" />

      <ToolbarButton onClick={handleBulletList} title="Bullet list">
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={handleOrderedList} title="Ordered list">
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={handleBlockquote} title="Blockquote">
        <Quote className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

function MilkdownInner({
  value,
  onChange,
  placeholder,
  autoFocus,
}: Omit<MilkdownEditorProps, "className">) {
  const lastEmittedRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
          ctx
            .get(listenerCtx)
            .markdownUpdated((_ctx, markdown, prevMarkdown) => {
              if (markdown !== prevMarkdown) {
                lastEmittedRef.current = markdown;
                onChangeRef.current(markdown);
              }
            })
            .mounted((_ctx) => {
              if (autoFocus) {
                const prosemirror = root.querySelector<HTMLElement>(".ProseMirror");
                prosemirror?.focus();
              }
              if (placeholder) {
                const prosemirror = root.querySelector<HTMLElement>(".ProseMirror");
                prosemirror?.setAttribute("data-placeholder", placeholder);
              }
            });
        })
        .use(commonmark)
        .use(gfm)
        .use(listener),
    [],
  );

  const [loading, getInstance] = useInstance();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (value === lastEmittedRef.current) {
      return;
    }
    const editor = getInstance();
    if (!editor) {
      return;
    }
    lastEmittedRef.current = value;
    editor.action(replaceAll(value));
  }, [value, loading, getInstance]);

  return <Milkdown />;
}

export function MilkdownEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
}: MilkdownEditorProps) {
  const stableOnChange = useCallback((v: string) => onChange(v), [onChange]);

  return (
    <div className={cn("milkdown-wrap flex flex-col", className)}>
      <MilkdownProvider>
        <MilkdownToolbar />
        <div
          className={cn(
            "prose prose-sm dark:prose-invert",
            "prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5",
            "prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs",
            "max-w-none flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed",
          )}
        >
          <MilkdownInner
            value={value}
            onChange={stableOnChange}
            placeholder={placeholder}
            autoFocus={autoFocus}
          />
        </div>
      </MilkdownProvider>
    </div>
  );
}
