import { useMemo, useState } from "react"
import { MentionsTextarea } from "./MentionsTextarea"
import { MarkdownEditor } from "@/components/markdown-editor"
import { Markdown } from "@/components/markdown"
import {
  flattenMentions,
  getMentionLabel,
  type MentionUser,
} from "./index"

const sampleUsers: MentionUser[] = [
  {
    uuid: "a1da8ee9-ef30-4c60-a666-4c6c6d247352",
    firstName: "Aaron",
    lastName: "Tester",
    email: "ryley.randall@gmail.com",
    profilePictureUrl:
      "https://images.filloutstaging.com/localdev/orgid-1/flowpublicid-settings/widgetid-profile-picture/bzhCSG9LPooxzhU5vfRKa5/profile-picture.jpg?a=fDXBe9ZLAGgXvgoLyGxAGv",
  },
  {
    uuid: "550e8400-e29b-41d4-a716-446655440000",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane.doe@example.com",
  },
  {
    uuid: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    firstName: "Marcus",
    lastName: "Aurelius Antoninus",
    email: "marcus@example.com",
  },
  {
    uuid: "16fd2706-8baf-433b-82eb-8c7fada847da",
    firstName: "",
    lastName: "",
    email: "no-name@example.com",
  },
]

function useResolveMention() {
  return useMemo(() => {
    const byId = new Map(sampleUsers.map((u) => [u.uuid, getMentionLabel(u)]))
    return (id: string) => byId.get(id)
  }, [])
}

function OutputPanels({ markdown }: { markdown: string }) {
  const resolveMention = useResolveMention()
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Stored markdown
        </p>
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
          {markdown || "(empty)"}
        </pre>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Plain-text preview
        </p>
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
          {flattenMentions(markdown, resolveMention) || "(empty)"}
        </pre>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Rendered
        </p>
        <div className="rounded-md border border-border p-3">
          <Markdown
            className="prose-sm"
            resolveMention={resolveMention}
            onMentionClick={(id) =>
              alert(`Clicked mention: ${resolveMention(id) ?? id}`)
            }
          >
            {markdown}
          </Markdown>
        </div>
      </div>
    </div>
  )
}

function CommentBoxSample() {
  const [markdown, setMarkdown] = useState(
    "Hey [@Jane Doe](mention:550e8400-e29b-41d4-a716-446655440000), can you review **this**?"
  )
  const [submitted, setSubmitted] = useState<string | null>(null)

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">Comment box (textarea)</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Looks like a plain textarea. Type <code>@</code> to mention. Press
        ⌘/Ctrl+Enter to submit.
      </p>
      <MentionsTextarea
        source={{ users: sampleUsers }}
        content={markdown}
        onChange={setMarkdown}
        onSubmit={setSubmitted}
        placeholder="Leave a comment… use @ to mention a teammate"
      />
      {submitted !== null && (
        <p className="mt-2 text-xs text-muted-foreground">
          Submitted: <code>{submitted}</code>
        </p>
      )}
      <OutputPanels markdown={markdown} />
    </div>
  )
}

function RichEditorSample() {
  const [markdown, setMarkdown] = useState(
    "## Notes\n\nAssigned to [@Aaron Tester](mention:a1da8ee9-ef30-4c60-a666-4c6c6d247352).\n"
  )

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">
        Rich text editor with mentions
      </h3>
      <p className="mb-3 text-sm text-muted-foreground">
        The full <code>MarkdownEditor</code> with the <code>mentions</code> prop
        enabled — same `@` picker inside a toolbar editor.
      </p>
      <MarkdownEditor
        content={markdown}
        onChange={setMarkdown}
        height="dynamic-sm"
        mentions={{ source: { users: sampleUsers } }}
      />
      <OutputPanels markdown={markdown} />
    </div>
  )
}

function ThemedSample() {
  const [markdown, setMarkdown] = useState(
    "Pinging [@Marcus Aurelius Antoninus](mention:7c9e6679-7425-40de-944b-e07fc1f90ae7) on this."
  )

  return (
    <div>
      <h3 className="mb-1 text-base font-semibold">Custom-styled mentions</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        Re-skinned via <code>chipClassName</code>, <code>popupClassNames</code>,
        and CSS variables — pill chips, a brand-colored picker.
      </p>
      <div className="[&_.zite-mention]:[--mention-bg:hsl(var(--accent))] [&_.zite-mention]:[--mention-color:hsl(var(--accent-foreground))]">
        <MentionsTextarea
          source={{ users: sampleUsers }}
          content={markdown}
          onChange={setMarkdown}
          chipClassName="!rounded-full !px-2"
          popupClassNames={{
            popup: "border-primary/40 shadow-lg",
            item: "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
          }}
          placeholder="Try the restyled picker…"
        />
      </div>
    </div>
  )
}

export function MentionsSamplesContent() {
  return (
    <div className="flex flex-col gap-8">
      <CommentBoxSample />
      <RichEditorSample />
      <ThemedSample />
    </div>
  )
}

export function MentionsSamples() {
  const [dark, setDark] = useState(false)
  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Mentions</h1>
            <button
              onClick={() => setDark((d) => !d)}
              className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
            >
              Toggle theme
            </button>
          </div>
          <MentionsSamplesContent />
        </div>
      </div>
    </div>
  )
}
