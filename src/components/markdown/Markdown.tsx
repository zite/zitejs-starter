import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { MENTION_CLASS, getMentionId, isMentionHref } from "@/components/mentions";

import "./markdown.css";
import "@/components/mentions/mentions.css";

// Runs before rehype-raw: remove any raw HTML nodes that aren't <mark> tags.
function rehypeAllowOnlyMark() {
  return (tree: any) => {
    const filter = (node: any) => {
      if (!node.children) return;
      node.children = node.children.filter((child: any) => {
        if (child.type === "raw") {
          return /^<\/?mark(\s[^>]*)?>$/i.test(child.value.trim());
        }
        filter(child);
        return true;
      });
    };
    filter(tree);
  };
}

interface MarkdownProps {
  /** The markdown string to render. */
  children: string;
  /** Additional class names merged onto the prose wrapper. */
  className?: string;
  /**
   * Resolve a mention's *current* display name from its user id (UUID).
   * Falls back to the label stored in the markdown link text.
   */
  resolveMention?: (id: string) => string | undefined;
  /** Extra class names appended to rendered mention chips. */
  mentionClassName?: string;
  /** Invoked when a mention chip is clicked, with the mention's user id. */
  onMentionClick?: (id: string) => void;
}

/**
 * Renders a markdown string as styled HTML. Use this for read-only rendering
 * of formatted/markdown content (descriptions, AI-generated text, stored
 * rich text from the database, etc.).
 *
 * Supports GitHub Flavored Markdown (tables, strikethrough, task lists) and
 * allows raw `<mark>` tags for highlighted text. All other raw HTML is
 * stripped for safety. Links using the `mention:` scheme (`[@Name](mention:<uuid>)`)
 * are rendered as mention chips.
 *
 * For an editable rich text input, import `MarkdownEditor` from
 * `@/components/markdown-editor` instead.
 *
 * DO NOT render markdown manually (regex, `dangerouslySetInnerHTML`,
 * marked.js, etc.) and DO NOT swap in a different library — use this
 * component.
 *
 * @example
 * ```tsx
 * import { Markdown } from "@/components/markdown"
 *
 * <Markdown>{post.body}</Markdown>
 * ```
 */
export function Markdown({
  children,
  className,
  resolveMention,
  mentionClassName,
  onMentionClick,
}: MarkdownProps) {
  return (
    <div className={cn("prose max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeAllowOnlyMark, rehypeRaw]}
        components={{
          a({ href, children, ...props }: ComponentProps<"a">) {
            if (isMentionHref(href)) {
              const id = getMentionId(href);
              const fallback =
                typeof children === "string"
                  ? children.replace(/^@/, "")
                  : undefined;
              const resolved = resolveMention?.(id);
              const label = resolved ?? fallback;
              return (
                <a
                  {...props}
                  href={href}
                  data-mention
                  data-id={id}
                  className={cn(MENTION_CLASS, mentionClassName)}
                  onClick={(event) => {
                    if (onMentionClick) {
                      event.preventDefault();
                      onMentionClick(id);
                    }
                  }}
                >
                  {label ? `@${label}` : children}
                </a>
              );
            }
            return (
              <a href={href} {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
