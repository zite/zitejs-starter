import { ReactRenderer } from "@tiptap/react"
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion"
import {
  MentionList,
  type MentionListProps,
  type MentionListRef,
  type MentionPopupClassNames,
} from "./MentionList"
import {
  getMentionLabel,
  type MentionSource,
  type MentionUser,
} from "./mentionTypes"

function filterUsers(
  users: MentionUser[],
  query: string,
  limit: number
): MentionUser[] {
  const q = query.trim().toLowerCase()
  const matches = !q
    ? users
    : users.filter(
        (u) =>
          getMentionLabel(u).toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q)
      )
  return matches.slice(0, limit)
}

export interface CreateMentionSuggestionOptions {
  /** Where to pull users from for the `@` picker. */
  source: MentionSource
  /** Trigger character. @default "@" */
  char?: string
  /** Max number of results shown. @default 8 */
  limit?: number
  /** Class overrides for the popup. */
  classNames?: MentionPopupClassNames
  /** Custom row renderer for the popup. */
  renderItem?: MentionListProps["renderItem"]
}

/**
 * Builds a TipTap suggestion config for `@`-mentions. The returned object is
 * passed to `Mention.configure({ suggestion })`. Names may contain spaces, so
 * `allowSpaces` is enabled.
 */
export function createMentionSuggestion({
  source,
  char = "@",
  limit = 8,
  classNames,
  renderItem,
}: CreateMentionSuggestionOptions): Omit<
  SuggestionOptions<MentionUser>,
  "editor"
> {
  return {
    char,
    allowSpaces: true,
    items: async ({ query }) => {
      if (source.onSearch) {
        const results = await source.onSearch(query)
        return results.slice(0, limit)
      }
      return filterUsers(source.users ?? [], query, limit)
    },
    render: () => {
      let renderer: ReactRenderer<MentionListRef, MentionListProps> | null = null
      let popup: HTMLDivElement | null = null

      const buildProps = (props: SuggestionProps<MentionUser>): MentionListProps => ({
        items: props.items,
        command: (attrs) => props.command(attrs as unknown as MentionUser),
        classNames,
        renderItem,
      })

      const position = (
        clientRect?: SuggestionProps<MentionUser>["clientRect"]
      ) => {
        if (!popup || !clientRect) return
        const rect = clientRect()
        if (!rect) return
        popup.style.position = "fixed"
        popup.style.left = `${rect.left}px`
        popup.style.top = `${rect.bottom + 6}px`
        popup.style.zIndex = "50"
      }

      return {
        onStart: (props) => {
          renderer = new ReactRenderer(MentionList, {
            props: buildProps(props),
            editor: props.editor,
          })
          popup = document.createElement("div")
          popup.appendChild(renderer.element)
          document.body.appendChild(popup)
          position(props.clientRect)
        },
        onUpdate: (props) => {
          renderer?.updateProps(buildProps(props))
          position(props.clientRect)
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") {
            popup?.remove()
            return true
          }
          return renderer?.ref?.onKeyDown(props) ?? false
        },
        onExit: () => {
          popup?.remove()
          popup = null
          renderer?.destroy()
          renderer = null
        },
      }
    },
  }
}
