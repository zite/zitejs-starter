import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Typography from "@tiptap/extension-typography"
import Image from "@tiptap/extension-image"
import { Markdown } from "tiptap-markdown"
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  Highlighter,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"

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

function ToolbarToggle({
  pressed,
  onPressedChange,
  children,
  title,
}: {
  pressed: boolean
  onPressedChange: () => void
  children: React.ReactNode
  title: string
}) {
  return (
    <Toggle
      size="sm"
      pressed={pressed}
      onPressedChange={onPressedChange}
      aria-label={title}
      title={title}
    >
      {children}
    </Toggle>
  )
}

function ToolbarButton({
  onClick,
  disabled,
  children,
  title,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  title: string
}) {
  return (
    <Toggle
      size="sm"
      pressed={false}
      onPressedChange={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
    >
      {children}
    </Toggle>
  )
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
        "rounded-md border border-input bg-background",
        className
      )}
    >
      {editable && (() => {
        const showInlineSection = !hideBold || !hideItalic || !hideStrikethrough || !hideCode || !hideHighlight
        const showHeadingsSection = !hideHeadings
        const showBlockSection = !hideBulletList || !hideOrderedList || !hideBlockquote || !hideHorizontalRule
        const showUndoRedoSection = !hideUndoRedo

        if (!showInlineSection && !showHeadingsSection && !showBlockSection && !showUndoRedoSection) {
          return null
        }

        return (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-input p-1">
            {showInlineSection && (
              <>
                {!hideBold && (
                  <ToolbarToggle
                    pressed={editor.isActive("bold")}
                    onPressedChange={() => editor.chain().focus().toggleBold().run()}
                    title="Bold"
                  >
                    <Bold className="size-4" />
                  </ToolbarToggle>
                )}
                {!hideItalic && (
                  <ToolbarToggle
                    pressed={editor.isActive("italic")}
                    onPressedChange={() => editor.chain().focus().toggleItalic().run()}
                    title="Italic"
                  >
                    <Italic className="size-4" />
                  </ToolbarToggle>
                )}
                {!hideStrikethrough && (
                  <ToolbarToggle
                    pressed={editor.isActive("strike")}
                    onPressedChange={() => editor.chain().focus().toggleStrike().run()}
                    title="Strikethrough"
                  >
                    <Strikethrough className="size-4" />
                  </ToolbarToggle>
                )}
                {!hideCode && (
                  <ToolbarToggle
                    pressed={editor.isActive("code")}
                    onPressedChange={() => editor.chain().focus().toggleCode().run()}
                    title="Inline code"
                  >
                    <Code className="size-4" />
                  </ToolbarToggle>
                )}
                {!hideHighlight && (
                  <ToolbarToggle
                    pressed={editor.isActive("highlight")}
                    onPressedChange={() =>
                      editor.chain().focus().toggleHighlight().run()
                    }
                    title="Highlight"
                  >
                    <Highlighter className="size-4" />
                  </ToolbarToggle>
                )}
              </>
            )}

            {showInlineSection && showHeadingsSection && (
              <Separator orientation="vertical" className="mx-1 h-6" />
            )}

            {showHeadingsSection && (
              <>
                <ToolbarToggle
                  pressed={editor.isActive("heading", { level: 1 })}
                  onPressedChange={() =>
                    editor.chain().focus().toggleHeading({ level: 1 }).run()
                  }
                  title="Heading 1"
                >
                  <Heading1 className="size-4" />
                </ToolbarToggle>
                <ToolbarToggle
                  pressed={editor.isActive("heading", { level: 2 })}
                  onPressedChange={() =>
                    editor.chain().focus().toggleHeading({ level: 2 }).run()
                  }
                  title="Heading 2"
                >
                  <Heading2 className="size-4" />
                </ToolbarToggle>
                <ToolbarToggle
                  pressed={editor.isActive("heading", { level: 3 })}
                  onPressedChange={() =>
                    editor.chain().focus().toggleHeading({ level: 3 }).run()
                  }
                  title="Heading 3"
                >
                  <Heading3 className="size-4" />
                </ToolbarToggle>
              </>
            )}

            {(showInlineSection || showHeadingsSection) && showBlockSection && (
              <Separator orientation="vertical" className="mx-1 h-6" />
            )}

            {showBlockSection && (
              <>
                {!hideBulletList && (
                  <ToolbarToggle
                    pressed={editor.isActive("bulletList")}
                    onPressedChange={() =>
                      editor.chain().focus().toggleBulletList().run()
                    }
                    title="Bullet list"
                  >
                    <List className="size-4" />
                  </ToolbarToggle>
                )}
                {!hideOrderedList && (
                  <ToolbarToggle
                    pressed={editor.isActive("orderedList")}
                    onPressedChange={() =>
                      editor.chain().focus().toggleOrderedList().run()
                    }
                    title="Ordered list"
                  >
                    <ListOrdered className="size-4" />
                  </ToolbarToggle>
                )}
                {!hideBlockquote && (
                  <ToolbarToggle
                    pressed={editor.isActive("blockquote")}
                    onPressedChange={() =>
                      editor.chain().focus().toggleBlockquote().run()
                    }
                    title="Blockquote"
                  >
                    <Quote className="size-4" />
                  </ToolbarToggle>
                )}
                {!hideHorizontalRule && (
                  <ToolbarButton
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    title="Horizontal rule"
                  >
                    <Minus className="size-4" />
                  </ToolbarButton>
                )}
              </>
            )}

            {(showInlineSection || showHeadingsSection || showBlockSection) && showUndoRedoSection && (
              <Separator orientation="vertical" className="mx-1 h-6" />
            )}

            {showUndoRedoSection && (
              <>
                <ToolbarButton
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  title="Undo"
                >
                  <Undo className="size-4" />
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                  title="Redo"
                >
                  <Redo className="size-4" />
                </ToolbarButton>
              </>
            )}
          </div>
        )
      })()}

      <EditorContent
        editor={editor}
        className={cn(
          "flex flex-col [&_.tiptap]:flex-1 prose prose-sm dark:prose-invert max-w-none p-4 overflow-y-auto focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap>:first-child]:mt-0 [&_blockquote_p:first-of-type]:before:content-none [&_blockquote_p:last-of-type]:after:content-none [&_li_p]:!my-0.5",
          { "h-32": height === "sm", "h-64": height === "md", "h-96": height === "lg" },
          { "min-h-32": height === "dynamic-sm", "min-h-64": height === "dynamic-md", "min-h-96": height === "dynamic-lg" },
          editorClassName,
        )}
      />
    </div>
  )
}
