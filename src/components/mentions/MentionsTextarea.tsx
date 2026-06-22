import { useEffect, useRef } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extensions"
import { Markdown, type MarkdownStorage } from "tiptap-markdown"
import { cn } from "@/lib/utils"
import { createMentionExtension } from "./MentionExtension"
import { normalizeMentionMarkdown } from "./mentionMarkdown"
import type { MentionListProps, MentionPopupClassNames } from "./MentionList"
import type { MentionSource } from "./mentionTypes"

import "../markdown/markdown.css"
import "./mentions.css"

declare module "@tiptap/core" {
  interface Storage {
    markdown: MarkdownStorage
  }
}

export interface MentionsTextareaProps {
  /** Where to resolve `@` mention candidates from. */
  source: MentionSource
  /** Initial markdown content. */
  content?: string
  /** Fires on every change with the current markdown string (not normalized). */
  onChange?: (markdown: string) => void
  /**
   * Fires on ⌘/Ctrl+Enter with the submit-ready markdown (whitespace and
   * trailing mention `&nbsp;` trimmed via `normalizeMentionMarkdown`).
   */
  onSubmit?: (markdown: string) => void
  /** Placeholder text shown when empty. */
  placeholder?: string
  /** @default true */
  editable?: boolean
  /** Focus the field on mount. */
  autoFocus?: boolean
  /** The `@` trigger character. @default "@" */
  char?: string
  /** Class names on the outer (textarea-like) wrapper. */
  className?: string
  /** Class names on the editable content area. */
  editorClassName?: string
  /** Extra class names appended to mention chips. */
  chipClassName?: string
  /** Class overrides for the mention picker popup. */
  popupClassNames?: MentionPopupClassNames
  /** Custom popup row renderer. */
  renderItem?: MentionListProps["renderItem"]
}

export function MentionsTextarea({
  source,
  content = "",
  onChange,
  onSubmit,
  placeholder = "Write a message… use @ to mention",
  editable = true,
  autoFocus,
  char = "@",
  className,
  editorClassName,
  chipClassName,
  popupClassNames,
  renderItem,
}: MentionsTextareaProps) {
  const valueRef = useRef(content)
  const onSubmitRef = useRef(onSubmit)
  onSubmitRef.current = onSubmit

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Markdown,
      createMentionExtension({
        source,
        char,
        chipClassName,
        popupClassNames,
        renderItem,
      }),
    ],
    content,
    editable,
    autofocus: autoFocus,
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          const markdown = normalizeMentionMarkdown(
            editor?.storage.markdown.getMarkdown() ?? ""
          )
          onSubmitRef.current?.(markdown)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown()
      valueRef.current = markdown
      onChange?.(markdown)
    },
  })

  useEffect(() => {
    if (editor && content !== valueRef.current) {
      valueRef.current = content
      editor.commands.setContent(content, { emitUpdate: false })
    }
  }, [content, editor])

  if (!editor) {
    return null
  }

  return (
    <div
      className={cn(
        "w-full rounded-md border border-input bg-transparent text-base shadow-sm transition-colors focus-within:outline-none focus-within:ring-1 focus-within:ring-ring md:text-sm",
        !editable && "border-transparent shadow-none",
        className
      )}
    >
      <EditorContent
        editor={editor}
        className={cn(
          "prose prose-sm max-w-none px-3 py-2",
          "min-h-[60px] overflow-y-auto",
          "[&_.tiptap]:outline-none [&_.tiptap]:min-h-[inherit]",
          "[&_.tiptap>:first-child]:mt-0 [&_.tiptap>:last-child]:mb-0",
          // Placeholder styling (theme-aware).
          "[&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:float-left",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:h-0",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          editorClassName
        )}
      />
    </div>
  )
}
