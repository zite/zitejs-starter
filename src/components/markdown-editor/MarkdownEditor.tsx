import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Typography from "@tiptap/extension-typography"
import Image from "@tiptap/extension-image"
import { Markdown } from "tiptap-markdown"
import { cn } from "@/lib/utils"
import { MarkdownEditorToolbar } from "./MarkdownEditorToolbar"

import './markdown-editor.css';

export interface MarkdownEditorProps {
  /** Initial markdown content to populate the editor with. */
  content?: string
  /** Callback fired on every change, receiving the current markdown string. */
  onChange?: (markdown: string) => void
  /** Additional class names applied to the outer wrapper element. */
  className?: string
  /** Additional class names applied to the editor content area. */
  editorClassName?: string
  /**
   * Whether the editor content is editable. When `false`, the toolbar is hidden.
   * @default true
   */
  editable?: boolean
  /** Hide the bold button from the toolbar. */
  hideBold?: boolean
  /** Hide the italic button from the toolbar. */
  hideItalic?: boolean
  /** Hide the strikethrough button from the toolbar. */
  hideStrikethrough?: boolean
  /** Hide the inline code button from the toolbar. */
  hideCode?: boolean
  /** Hide the highlight button from the toolbar. */
  hideHighlight?: boolean
  /** Hide the heading buttons (H1, H2, H3) from the toolbar. */
  hideHeadings?: boolean
  /** Hide the bullet list button from the toolbar. */
  hideBulletList?: boolean
  /** Hide the ordered list button from the toolbar. */
  hideOrderedList?: boolean
  /** Hide the blockquote button from the toolbar. */
  hideBlockquote?: boolean
  /** Hide the horizontal rule button from the toolbar. */
  hideHorizontalRule?: boolean
  /** Hide the undo/redo buttons from the toolbar. */
  hideUndoRedo?: boolean
  /**
   * Controls the editor height. Fixed values (`sm`, `md`, `lg`) set a fixed height.
   * Dynamic values (`dynamic-sm`, `dynamic-md`, `dynamic-lg`) set a minimum height
   * that grows with content.
   * @default "dynamic-md"
   */
  height?: "sm" | "md" | "lg" | "dynamic-sm" | "dynamic-md" | "dynamic-lg"
}

export function MarkdownEditor({
  content = "",
  onChange,
  className,
  editorClassName,
  editable = true,
  hideBold,
  hideItalic,
  hideStrikethrough,
  hideCode,
  hideHighlight,
  hideHeadings,
  hideBulletList,
  hideOrderedList,
  hideBlockquote,
  hideHorizontalRule,
  hideUndoRedo,
  height = "dynamic-md",
}: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      Typography,
      Image,
      Markdown,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.((editor.storage as any).markdown.getMarkdown())
    },
  })

  if (!editor) {
    return null
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-transparent shadow-sm focus-within:ring-1 focus-visible:outline-none focus-within:ring-ring",
        className
      )}
    >
      {editable && (
        <MarkdownEditorToolbar
          editor={editor}
          hideBold={hideBold}
          hideItalic={hideItalic}
          hideStrikethrough={hideStrikethrough}
          hideCode={hideCode}
          hideHighlight={hideHighlight}
          hideHeadings={hideHeadings}
          hideBulletList={hideBulletList}
          hideOrderedList={hideOrderedList}
          hideBlockquote={hideBlockquote}
          hideHorizontalRule={hideHorizontalRule}
          hideUndoRedo={hideUndoRedo}
        />
      )}
      <EditorContent
        editor={editor}
        className={cn(
          "flex flex-col [&_.tiptap]:flex-1 text-base prose prose-sm dark:prose-invert max-w-none p-4 overflow-y-auto focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap>:first-child]:mt-0 [&_blockquote_p:first-of-type]:before:content-none [&_blockquote_p:last-of-type]:after:content-none [&_li_p]:!my-0.5 [&_code]:before:content-none [&_code]:after:content-none",
          { "h-32": height === "sm", "h-64": height === "md", "h-96": height === "lg" },
          { "min-h-32": height === "dynamic-sm", "min-h-64": height === "dynamic-md", "min-h-96": height === "dynamic-lg" },
          editorClassName,
        )}
      />
    </div>
  )
}
