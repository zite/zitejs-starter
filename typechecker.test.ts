import { expect, test } from "bun:test";
import { typecheck } from "./typechecker";
import fs from "fs";
import path from "path";

// helper for syntax highlighting
const tsx = (strings: TemplateStringsArray, ...values: any[]) => {
  let result = "";
  strings.forEach((string, i) => {
    result += string;
    if (i < values.length) {
      result += values[i];
    }
  });
  return result;
};

test("should pass typechecking with no file overrides", async () => {
  const { diagnostics } = await typecheck([]);
  expect(diagnostics).toBeUndefined();
}, 10000); // 10 second timeout for GitHub Actions

test("should pass typechecking with valid App.tsx component", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        export default function App() { 
          return <div>Hello World</div> 
        }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should fail typechecking with syntax error in App.tsx", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        export default function App() { 
          return <div>Hello World</div 
        }
      `,
    },
  ]);

  expect(diagnostics).toBeDefined();
  expect(diagnostics).toMatchInlineSnapshot(`
    "src/App.tsx:4:9 - error TS1005: '>' expected.

    4         }
              ~
    "
  `);
});

test("should handle component imports through App.tsx entry point", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import Home from "./pages/Home"; 
        
        export default function App() { 
          return <Home /> 
        }
      `,
    },
    {
      type: "create",
      filePath: "src/pages/Home.tsx",
      content: tsx`
        import Heading from "../components/Heading"; 
        
        export default function Home() { 
          return <Heading>Hello World</Heading> 
        }
      `,
    },
    {
      type: "create",
      filePath: "src/components/Heading.tsx",
      content: tsx`
        export default function Heading({children}:{children: React.ReactNode}) { 
          return <h1>{children}</h1> 
        }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should ignore linting issues in App.tsx and imported components", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import UnusedVarsComponent from "./components/UnusedVars";
        
        // Unused variable in App.tsx
        const unusedVar = "unused";
        
        export default function App(props) {
          return <UnusedVarsComponent />;
        }
      `,
    },
    {
      type: "create",
      filePath: "src/components/UnusedVars.tsx",
      content: tsx`
        export default function UnusedVarsComponent() {
          // Unused variable in component
          const anotherUnusedVar = "also unused";
          
          return <div>Component with unused variables</div>;
        }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should handle escaped quotes in JSX expressions through App.tsx", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        export default function App() {
          return <div>{'I should\\'nt error'}</div>;
        }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should detect errors in components imported through App.tsx", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import BrokenComponent from "./components/BrokenComponent";
        
        export default function App() {
          return <BrokenComponent />;
        }
      `,
    },
    {
      type: "create",
      filePath: "src/components/BrokenComponent.tsx",
      content: tsx`
        export default function BrokenComponent() {
          return <div>Missing closing tag</div;
        }
      `,
    },
  ]);

  expect(diagnostics).toBeDefined();
  expect(diagnostics).toMatchInlineSnapshot(`
    "src/components/BrokenComponent.tsx:3:47 - error TS1005: '>' expected.

    3           return <div>Missing closing tag</div;
                                                    ~
    "
  `);
});

test("should handle deep component tree through App.tsx", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import Layout from "./components/Layout";
        
        export default function App() {
          return <Layout>App Content</Layout>;
        }
      `,
    },
    {
      type: "create",
      filePath: "src/components/Layout.tsx",
      content: tsx`
        import Header from "./Header";
        import Footer from "./Footer";
        
        interface LayoutProps {
          children: React.ReactNode;
        }
        
        export default function Layout({ children }: LayoutProps) {
          return (
            <div>
              <Header />
              <main>{children}</main>
              <Footer />
            </div>
          );
        }
      `,
    },
    {
      type: "create",
      filePath: "src/components/Header.tsx",
      content: tsx`
        import Navigation from "./Navigation";
        
        export default function Header() {
          return (
            <header>
              <h1>Site Title</h1>
              <Navigation />
            </header>
          );
        }
      `,
    },
    {
      type: "create",
      filePath: "src/components/Navigation.tsx",
      content: tsx`
        export default function Navigation() {
          return (
            <nav>
              <ul>
                <li>Home</li>
                <li>About</li>
                <li>Contact</li>
              </ul>
            </nav>
          );
        }
      `,
    },
    {
      type: "create",
      filePath: "src/components/Footer.tsx",
      content: tsx`
        export default function Footer() {
          return <footer>© 2023 My Website</footer>;
        }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should detect type errors in props passed from App.tsx", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import TypedComponent from "./components/TypedComponent";
        
        export default function App() {
          // Passing a number where a string is expected
          return <TypedComponent value={42} />;
        }
      `,
    },
    {
      type: "create",
      filePath: "src/components/TypedComponent.tsx",
      content: tsx`
        interface Props {
          value: string;
        }
        
        export default function TypedComponent({ value }: Props) {
          return <div>{value}</div>;
        }
      `,
    },
  ]);

  expect(diagnostics).toBeDefined();
  expect(diagnostics).toMatchInlineSnapshot(`
    "src/App.tsx:6:34 - error TS2322: Type 'number' is not assignable to type 'string'.

    6           return <TypedComponent value={42} />;
                                       ~~~~~

      src/components/TypedComponent.tsx:3:11
        3           value: string;
                    ~~~~~
        The expected type comes from property 'value' which is declared here on type 'IntrinsicAttributes & Props'
    "
  `);
});

test("should handle CSS module imports through App.tsx", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import StyledComponent from "./components/StyledComponent";
        
        export default function App() {
          return <StyledComponent />;
        }
      `,
    },
    {
      type: "create",
      filePath: "src/components/StyledComponent.module.css.d.ts",
      content: tsx`
        export const container: string;
        export const title: string;
      `,
    },
    {
      type: "create",
      filePath: "src/components/StyledComponent.tsx",
      content: tsx`
        import styles from "./StyledComponent.module.css";
        
        export default function StyledComponent() {
          return (
            <div className={styles.container}>
              <h1 className={styles.title}>Styled Component</h1>
            </div>
          );
        }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should handle dynamic imports", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/components/LazyComponent.tsx",
      content: tsx`
        export default function LazyComponent() {
          return <div>I am lazily loaded</div>;
        }
      `,
    },
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import { lazy, Suspense } from 'react';
        
        const LazyComponent = lazy(() => import('./components/LazyComponent'));
        
        export default function App() {
          return (
            <Suspense fallback={<div>Loading...</div>}>
              <LazyComponent />
            </Suspense>
          );
        }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should handle tsconfig paths", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/components/Component.tsx",
      content: tsx`
        export default function Component() {
          return <div>I am a component</div>;
        }
      `,
    },
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import { Suspense } from 'react';
        import Component from '@/components/Component';
        
        
        export default function App() {
          return (
            <Suspense fallback={<div>Loading...</div>}>
              <Component />
            </Suspense>
          );
        }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should not include errors in __zite__", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/__zite__/sdk.ts",
      content: tsx`
        const x: string = 1;
      `,
    },
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import "@zite/sdk"
        
        export default function App() {
          return (
            <div />
          );
        }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should include sdk errors not originating in __zite__", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/__zite__/sdk.ts",
      content: tsx`
        export const x = (x: string) => x;
      `,
    },
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
        import {x} from "@zite/sdk"
        
        export default function App() {
          return (
            <div>
              {x(1)}
            </div>
          );
        }
      `,
    },
  ]);

  expect(diagnostics).toBeDefined();
  expect(diagnostics).toMatchInlineSnapshot(`
    "src/App.tsx:7:18 - error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.

    7               {x(1)}
                       ~
    "
  `);
});

test("should be lenient with arrays", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "create",
      filePath: "src/App.tsx",
      content: tsx`
      export default function App() {
        const x = [];
        x.push(1)
        return <div />;
      }
      `,
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should handle large number of virtual files", async () => {
  const files = Array.from({ length: 50 }, (_, i) => ({
    type: "create" as const,
    filePath: `src/generated/Component${i}.tsx`,
    content: tsx`
      export default function Component${i}() {
        return <div>Generated Component ${i}</div>;
      }
    `,
  }));

  // Create an index file that imports all generated components
  files.push({
    type: "create" as const,
    filePath: "src/generated/index.tsx",
    content: tsx`
      ${files
        .map((_, i) => `import Component${i} from "./Component${i}";`)
        .join("\n")}
      
      export default function AllComponents() {
        return (
          <div>
            ${files.map((_, i) => `<Component${i} />`).join("\n")}
          </div>
        );
      }
    `,
  });

  // Create App.tsx that imports the index
  files.push({
    type: "create" as const,
    filePath: "src/App.tsx",
    content: tsx`
      import AllComponents from "./generated/index";
      
      export default function App() {
        return <AllComponents />;
      }
    `,
  });

  const { diagnostics } = await typecheck(files);
  expect(diagnostics).toBeUndefined();
});

test("should handle deleting a file with type errors (on-disk errors)", async () => {
  // Create physical files in the project
  const srcDir = path.join(process.cwd(), "src");
  const componentsDir = path.join(srcDir, "components");

  // Create physical files with errors
  const appPath = path.join(srcDir, "App.tsx");
  const errorComponentPath = path.join(componentsDir, "ErrorComponent.tsx");

  // Save original App.tsx content if it exists
  let originalAppContent = "";
  if (fs.existsSync(appPath)) {
    originalAppContent = fs.readFileSync(appPath, "utf8");
  }

  try {
    // Write the test files to the filesystem
    fs.writeFileSync(
      errorComponentPath,
      `
        const x: string = 1; // Type error: Type 'number' is not assignable to type 'string'

        export default function ErrorComponent() {
          return <div>{x}</div>;
        }
      `,
    );

    fs.writeFileSync(
      appPath,
      `
        import ErrorComponent from "./components/ErrorComponent.tsx";

        export default function App() {
          return <ErrorComponent />;
        }
      `,
    );

    // Now verify typechecking shows errors for the real file on disk
    const beforeDelete = await typecheck([]);
    expect(beforeDelete.diagnostics).toBeDefined();

    // Now delete the ErrorComponent using the typecheck API
    // This should continue showing errors with commented code
    // But succeed with the uncommented deletedFiles.add() code
    const deleteResult = await typecheck([
      {
        type: "delete" as const,
        filePath: errorComponentPath,
        content: "",
      },
      {
        type: "update" as const,
        filePath: "src/App.tsx",
        content: `
          export default function App() {
            return <div>No more errors</div>;
          }
        `,
      },
    ]);

    // This will fail with commented code - it should still show errors
    // from deleted files, but pass when the deletedFiles.add() is uncommented
    expect(deleteResult.diagnostics).toBeUndefined();
  } finally {
    // Clean up test files
    if (fs.existsSync(errorComponentPath)) {
      fs.unlinkSync(errorComponentPath);
    }

    // Restore original App.tsx
    if (originalAppContent) {
      fs.writeFileSync(appPath, originalAppContent);
    }
  }
});

test("should handle move operation", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "move",
      filePath: "src/components/Button.tsx",
      content: tsx`
        export default function Button({children}: {children: React.ReactNode}) { 
          return <button>{children}</button> 
        }
      `,
      newFilePath: "src/components/ui/Button.tsx",
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should handle move operation to nested directory", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "move",
      filePath: "src/utils/helper.ts",
      content: `
        export function helper() {
          return "I'm a helper function";
        }
      `,
      newFilePath: "src/lib/utils/helpers/helper.ts",
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should handle move operation with TypeScript component", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "move",
      filePath: "src/components/MovableComponent.tsx",
      content: tsx`
        export default function MovableComponent() { 
          return <div>I can be moved!</div> 
        }
      `,
      newFilePath: "src/components/ui/MovableComponent.tsx",
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should handle move operation to non-existing directory", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "move",
      filePath: "src/existing-file.ts",
      content: `
        export function existingFunction() {
          return "This file exists";
        }
      `,
      newFilePath: "src/new/nested/deeply/directory/file.ts",
    },
  ]);

  expect(diagnostics).toBeUndefined();
});

test("should handle move operation when source path doesn't exist", async () => {
  const { diagnostics } = await typecheck([
    {
      type: "move",
      filePath: "src/non-existing-file.ts",
      content: `
        export function newFunction() {
          return "This is a new file";
        }
      `,
      newFilePath: "src/components/NewFile.tsx",
    },
  ]);

  expect(diagnostics).toBeUndefined();
});
