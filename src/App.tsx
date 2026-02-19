import { ThemeSwitcher } from "./components/theme-switcher"
import { MarkdownSamplesContent } from "./components/markdown/Markdown.samples"
import { MarkdownEditorSamplesContent } from "./components/markdown-editor/MarkdownEditor.samples"

function Section({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xl font-bold whitespace-nowrap">{title}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
        <div>
          <h1 className="mb-1 text-2xl font-bold">Component Showcase</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Select a theme to apply it across all components below.
          </p>
          <ThemeSwitcher />
        </div>

        <div className="flex flex-col gap-8">
          <Section title="Markdown" />
          <MarkdownSamplesContent />
        </div>
      </div>
    </div>
  )
}
