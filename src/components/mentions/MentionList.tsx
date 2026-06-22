import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { SuggestionKeyDownProps } from "@tiptap/suggestion"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
  getMentionInitials,
  getMentionLabel,
  type MentionUser,
} from "./mentionTypes"

/** Class hooks so the picker can be re-skinned per consumer. */
export interface MentionPopupClassNames {
  /** The floating container. */
  popup?: string
  /** Each selectable row. */
  item?: string
  /** Avatar element. */
  avatar?: string
  /** The label text. */
  label?: string
  /** The secondary (email) text. */
  description?: string
  /** Shown when there are no matches. */
  empty?: string
}

export interface MentionListProps {
  items: MentionUser[]
  command: (attrs: { id: string; label: string }) => void
  classNames?: MentionPopupClassNames
  /** Optional custom row renderer for full control over the option UI. */
  renderItem?: (user: MentionUser, active: boolean) => React.ReactNode
}

export interface MentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  function MentionList({ items, command, classNames, renderItem }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

    useEffect(() => setSelectedIndex(0), [items])

    useLayoutEffect(() => {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" })
    }, [selectedIndex])

    const select = (index: number) => {
      const user = items[index]
      if (!user) return
      command({ id: user.uuid, label: getMentionLabel(user) })
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length)
          return true
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === "Enter") {
          select(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div
          className={cn(
            "min-w-[14rem] max-w-xs overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
            classNames?.popup
          )}
        >
          <div
            className={cn(
              "px-2 py-3 text-center text-sm text-muted-foreground",
              classNames?.empty
            )}
          >
            No matches
          </div>
        </div>
      )
    }

    return (
      <div
        className={cn(
          "min-w-[14rem] max-w-xs overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
          classNames?.popup
        )}
      >
        {items.map((user, index) => {
          const active = index === selectedIndex
          const label = getMentionLabel(user)
          return (
            <button
              key={user.uuid}
              type="button"
              ref={(el) => {
                itemRefs.current[index] = el
              }}
              data-active={active}
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault()
                select(index)
              }}
              className={cn(
                "flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
                "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground",
                classNames?.item
              )}
            >
              {renderItem ? (
                renderItem(user, active)
              ) : (
                <>
                  <Avatar
                    className={cn("size-6 text-xs", classNames?.avatar)}
                  >
                    {user.profilePictureUrl && (
                      <AvatarImage src={user.profilePictureUrl} alt={label} />
                    )}
                    <AvatarFallback className="text-[0.625rem]">
                      {getMentionInitials(user)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span
                      className={cn("truncate font-medium", classNames?.label)}
                    >
                      {label}
                    </span>
                    {user.email && user.email !== label && (
                      <span
                        className={cn(
                          "truncate text-xs text-muted-foreground",
                          classNames?.description
                        )}
                      >
                        {user.email}
                      </span>
                    )}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
    )
  }
)
