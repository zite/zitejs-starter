import { lazy, Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export type { MarkdownEditorProps } from "./MarkdownEditor"

const LazyMarkdownEditor = lazy(
  () =>
    Promise.all([
      import("./MarkdownEditor"),
      // TODO: Remove before merging
      new Promise((resolve) =>
        setTimeout(resolve, 1000)
      ),
    ]).then(([module]) => module)
)

const heightClasses = {
  sm: "h-32",
  md: "h-64",
  lg: "h-96",
  "dynamic-sm": "min-h-32",
  "dynamic-md": "min-h-64",
  "dynamic-lg": "min-h-96",
} as const

export function MarkdownEditor(
  props: React.ComponentProps<typeof LazyMarkdownEditor>
) {
  const height = props.height ?? "dynamic-md"

  return (
    <Suspense
      fallback={
        <Skeleton className={cn("w-full rounded-md py-4 box-content", heightClasses[height])} />
      }
    >
      <LazyMarkdownEditor {...props} />
    </Suspense>
  )
}
