import Mention from "@tiptap/extension-mention"
import { createMentionSuggestion } from "./mentionSuggestion"
import type { MentionListProps, MentionPopupClassNames } from "./MentionList"
import type { MentionSource } from "./mentionTypes"
import { MENTION_SCHEME } from "./mentionMarkdown"

/** CSS class applied to every rendered mention chip (editor + read-only). */
export const MENTION_CLASS = "zite-mention"

export interface CreateMentionExtensionOptions {
  /** User source for the `@` picker. */
  source: MentionSource
  /** Trigger character. @default "@" */
  char?: string
  /** Max picker results. @default 8 */
  limit?: number
  /** Extra class names appended to the chip span. */
  chipClassName?: string
  /** Class overrides for the picker popup. */
  popupClassNames?: MentionPopupClassNames
  /** Custom popup row renderer. */
  renderItem?: MentionListProps["renderItem"]
}

/**
 * A mention node that:
 *  - shows an `@` picker (spaces allowed in names),
 *  - serializes to a CommonMark link `[@Display Name](mention:<uuid>)` for the
 *    `tiptap-markdown` storage, and
 *  - rehydrates that link back into a chip on load.
 */
export function createMentionExtension({
  source,
  char = "@",
  limit = 8,
  chipClassName,
  popupClassNames,
  renderItem,
}: CreateMentionExtensionOptions) {
  return Mention.extend({
    addStorage() {
      return {
        ...this.parent?.(),
        markdown: {
          serialize(
            state: { write: (text: string) => void },
            node: { attrs: { id?: string | null; label?: string | null } }
          ) {
            const id = node.attrs.id ?? ""
            const label = node.attrs.label ?? id
            state.write(`[@${label}](${MENTION_SCHEME}${id})`)
          },
          parse: {
            // `tiptap-markdown` turns `[@x](mention:id)` into a plain anchor via
            // markdown-it. Rewrite those anchors into the canonical mention span
            // *before* ProseMirror parses, so the Link mark never claims them.
            updateDOM(element: HTMLElement) {
              const anchors = element.querySelectorAll<HTMLAnchorElement>(
                `a[href^="${MENTION_SCHEME}"]`
              )
              anchors.forEach((anchor) => {
                const href = anchor.getAttribute("href") ?? ""
                const id = href.slice(MENTION_SCHEME.length)
                const label = (anchor.textContent ?? "").replace(/^@/, "")
                const span = document.createElement("span")
                span.setAttribute("data-type", "mention")
                span.setAttribute("data-id", id)
                span.setAttribute("data-label", label)
                span.textContent = `${char}${label}`
                anchor.replaceWith(span)
              })
            },
          },
        },
      }
    },
  }).configure({
    HTMLAttributes: {
      class: chipClassName ? `${MENTION_CLASS} ${chipClassName}` : MENTION_CLASS,
    },
    suggestion: createMentionSuggestion({
      source,
      char,
      limit,
      classNames: popupClassNames,
      renderItem,
    }),
  })
}
