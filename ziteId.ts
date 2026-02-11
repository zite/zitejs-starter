import { parse } from "@babel/parser";
import MagicString from "magic-string";
import path from "path";
import { Plugin } from "vite";
import { walk } from "estree-walker";

const validExtensions = new Set([".jsx", ".tsx"]);

/**
 * Extracts the component name from a JSX element name AST node.
 * Handles JSXIdentifier (Card, div) and JSXMemberExpression (motion.div, Icons.Home)
 */
function getComponentName(elementName: any): string | null {
  if (elementName.type === "JSXIdentifier") {
    return elementName.name;
  }
  if (elementName.type === "JSXMemberExpression") {
    // Recursively build: motion.div, Icons.Home, Dropdown.Menu.Item
    const object = getComponentName(elementName.object);
    const property = elementName.property.name;
    return object ? `${object}.${property}` : property;
  }
  return null;
}

/**
 * Checks if a component name is a native HTML element.
 * Native elements start with lowercase (div, span, button).
 * Components start with uppercase (Card, Button) or are member expressions (motion.div).
 */
function isNativeElement(name: string): boolean {
  return /^[a-z]/.test(name) && !name.includes(".");
}

export function ziteId(): Plugin {
  const cwd = process.cwd();
  return {
    name: "vite-plugin-zite-id",
    enforce: "pre",
    async transform(code, id) {
      if (
        !validExtensions.has(path.extname(id)) ||
        id.includes("node_modules")
      ) {
        return null;
      }

      const relativePath = path.relative(cwd, id);

      try {
        const ast = parse(code, {
          sourceType: "module",
          plugins: ["jsx", "typescript"],
        }) as any;

        const magicString = new MagicString(code);

        walk(ast, {
          enter(_node) {
            const node = _node as any;

            if (node.type === "JSXElement") {
              const openingElement = node.openingElement;
              const children = node.children;

              const elementName = openingElement.name;
              const isFragment =
                // Check for <React.Fragment>
                (elementName.type === "JSXMemberExpression" &&
                  elementName.object.name === "React" &&
                  elementName.property.name === "Fragment") ||
                // Check for shorthand fragment <>
                (elementName.type === "JSXIdentifier" &&
                  elementName.name === "Fragment");

              // Don't add attributes to fragments
              if (isFragment) {
                return;
              }

              const line = openingElement.loc?.start?.line ?? 0;
              const col = openingElement.loc?.start?.column ?? 0;
              const dataComponentId = `${relativePath}|${line}|${col}`;

              let attributes = ` data-zite-id="${dataComponentId}"`;

              // Add component name for non-native elements
              const componentName = getComponentName(openingElement.name);
              if (componentName && !isNativeElement(componentName)) {
                attributes += ` data-zite-component="${componentName}"`;
              }

              // Check if the component has simple children
              if (
                children.length === 1 &&
                (children[0].type === "JSXText" ||
                  children[0].type === "StringLiteral" ||
                  (children[0].type === "JSXExpressionContainer" &&
                    children[0].expression.type === "StringLiteral"))
              ) {
                attributes += ` data-zite-editable="true"`;
              }

              magicString.appendLeft(openingElement.name.end ?? 0, attributes);
            }
          },
        });
        return {
          code: magicString.toString(),
          map: magicString.generateMap({ hires: true }),
        };
      } catch (error) {
        console.error(`Error processing file ${relativePath}:`, error);
        return null;
      }
    },
  };
}
