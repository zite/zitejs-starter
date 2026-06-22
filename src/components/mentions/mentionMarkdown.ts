/** Custom URI scheme used to encode a mention inside a CommonMark link. */
export const MENTION_SCHEME = "mention:"

/** Matches a serialized mention link: `[@Display Name](mention:<id>)`. */
const MENTION_LINK_RE = /\[@([^\]]+)\]\(mention:([^)]+)\)/g

/** True if a link href points at a mention (e.g. `mention:<uuid>`). */
export function isMentionHref(href: string | undefined | null): href is string {
  return typeof href === "string" && href.startsWith(MENTION_SCHEME)
}

/** Extract the user id (UUID) from a `mention:<id>` href. */
export function getMentionId(href: string): string {
  return href.slice(MENTION_SCHEME.length)
}

/** A mention parsed out of a markdown string. */
export interface ParsedMention {
  /** Display label as stored (without the leading `@`). */
  label: string
  /** Backend user UUID. */
  id: string
}

/** Collect every mention referenced in a markdown string. */
export function extractMentions(markdown: string): ParsedMention[] {
  const out: ParsedMention[] = []
  for (const match of markdown.matchAll(MENTION_LINK_RE)) {
    out.push({ label: match[1], id: match[2] })
  }
  return out
}

/**
 * Flatten mention links into plain `@Display Name` text, for previews and
 * notification payloads. Optionally resolve the *current* label from the id.
 */
export function flattenMentions(
  markdown: string,
  resolveLabel?: (id: string) => string | undefined
): string {
  return markdown.replace(MENTION_LINK_RE, (_full, label: string, id: string) => {
    const resolved = resolveLabel?.(id)
    return `@${resolved ?? label}`
  })
}

/**
 * Trim edge whitespace (including the `&nbsp;` editors insert after a mention)
 * so a round-trip stays lossless. Call on submit, not on every keystroke.
 */
export function normalizeMentionMarkdown(markdown: string): string {
  return markdown
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}
