/** A workspace user that can be @-mentioned. */
export interface MentionUser {
  /** Backend UUID (`users.uuid`). Used as the stable mention id. */
  uuid: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  /** Optional avatar image URL shown in the picker. */
  profilePictureUrl?: string | null
}

/**
 * The display label for a user, matching the backend convention:
 * `` `${firstName} ${lastName}`.trim() || email ``.
 */
export function getMentionLabel(user: MentionUser): string {
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
  return name || user.email || "Unknown"
}

/** Two-letter initials used for the avatar fallback. */
export function getMentionInitials(user: MentionUser): string {
  const first = user.firstName?.trim()?.[0] ?? ""
  const last = user.lastName?.trim()?.[0] ?? ""
  const initials = `${first}${last}`.trim()
  if (initials) return initials.toUpperCase()
  return (user.email?.trim()?.[0] ?? "?").toUpperCase()
}

/**
 * Source of users for the `@` picker. Either pass a static array (`users`)
 * and let the component filter locally, or pass `onSearch` to resolve matches
 * yourself (e.g. a debounced backend query). `onSearch` takes precedence.
 */
export interface MentionSource {
  /** Static list of users; filtered locally by the typed query. */
  users?: MentionUser[]
  /** Async resolver for the typed query. Overrides local filtering of `users`. */
  onSearch?: (query: string) => MentionUser[] | Promise<MentionUser[]>
  /**
   * Resolve a display label from a user id (UUID). Used when rendering stored
   * content so chips show the *current* name. Falls back to the stored label.
   */
  resolveLabel?: (id: string) => string | undefined
}
