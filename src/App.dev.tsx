import { ThemeSwitcher } from "./components/theme-switcher"
import { MarkdownSamplesContent } from "./components/markdown/Markdown.samples"

const sections = [
  { id: "theme", title: "Theme" },
  { id: "markdown", title: "Markdown" },
] as const

function Section({ id, title }: { id: string; title: string }) {
  return (
    <div id={id} className="flex items-center gap-3 scroll-mt-8">
      <h2 className="text-xl font-bold whitespace-nowrap">{title}</h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function TableOfContents() {
  return (
    <nav className="hidden xl:block fixed top-8 right-8 w-48">
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
        On this page
      </h3>
      <ul className="flex flex-col gap-1.5">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {section.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-10 p-8">
        <div id="theme" className="scroll-mt-8">
          <h1 className="mb-1 text-2xl font-bold">Component Showcase</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Select a theme to apply it across all components below.
          </p>
          <ThemeSwitcher />
        </div>

        <div className="flex flex-col gap-8">
          <Section id="markdown" title="Markdown" />
          <MarkdownSamplesContent />
        </div>
      </div>

      <TableOfContents />
    </div>
  )
}
