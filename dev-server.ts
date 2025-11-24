import bodyParser from "body-parser";
import express from "express";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { z } from "zod";
import { createServer as createHttpServer } from "node:http";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { Mutex } from "async-mutex";
import morgan from "morgan";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
);

const execPromise = promisify(exec);

const app = express();
const httpServer = createHttpServer(app);

app.use(morgan("tiny"));

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const pkgDeps = Object.keys(pkg.dependencies);

/**
 * Vite's main focus is on startup speed, so it doesn't check your package.json to see which dependencies you have at startup.
 * When it spots a file that imports a dependency, it optimizes that dependency on the fly and reloads the page. If I use something
 * that relies on another dependency, like lucide-react depending on react, it has to optimize lucide first and then reoptimize react
 * since lucide depends on react. It might have tree-shaken something lucide was using.
 *
 * This works fine in local development because it sends the websocket events quickly. But I noticed that if there's a decent gap
 * between the HMR update event and the HMR full-reload event (over ~500ms), it tries to use the new dependencies before the page reloads.
 * React throws an "invalid hook call" error in this case because there are now two different versions of react in play—the one it
 * initially rendered with and the newly optimized version.
 *
 * So we force Vite optimize all dependencies upfront at startup. This way, we avoid having to reoptimize dependencies on file
 * changes and reload the page. Since we have so few dependencies, the impact on startup speed is minimal.
 */
const deps = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/client",
  ...pkgDeps,
]);

const updateFilesSchema = z.object({
  files: z.array(
    z.object({
      type: z.enum(["update", "create", "delete", "move"]),
      filePath: z.string(),
      content: z.string(),
      newFilePath: z.string().optional(),
    })
  ),
});

const initFilesSchema = z.object({
  files: z.array(
    z.object({
      filePath: z.string(),
      content: z.string(),
    })
  ),
});

const mutex = new Mutex();
const BODY_LIMIT = 1024 * 1024 * 10; // 10MB

async function ensureDirectoryExists(filePath: string) {
  const dirname = path.dirname(filePath);
  try {
    await fs.access(dirname);
  } catch (error) {
    await fs.mkdir(dirname, { recursive: true });
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function moveFile(
  sourcePath: string,
  destinationPath: string,
  content: string
): Promise<void> {
  // Check if source file exists
  const sourceExists = await fileExists(sourcePath);
  if (!sourceExists) {
    throw new Error(`Source file does not exist: ${sourcePath}`);
  }

  // Ensure destination directory exists
  await ensureDirectoryExists(destinationPath);

  try {
    // Write the new file
    await fs.writeFile(destinationPath, content);
    // Delete the original
    await fs.unlink(sourcePath);
  } catch (copyError) {
    // If copy succeeded but delete failed, try to clean up
    try {
      await fs.unlink(destinationPath);
    } catch (cleanupError) {
      console.warn(
        "Failed to cleanup destination file after copy failure:",
        cleanupError
      );
    }
    throw new Error(`Failed to move file: ${copyError.message}`);
  }
}

async function getAllFiles(
  dir: string,
  baseDir: string = dir
): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  // Sort entries deterministically
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    // Skip node_modules and other common ignore patterns
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    if (entry.isDirectory()) {
      const subFiles = await getAllFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else {
      files.push(relativePath);
    }
  }

  return files.sort();
}

app.put(
  "/~zite/files",
  bodyParser.json({ limit: BODY_LIMIT }),
  async (req, res) => {
    const release = await mutex.acquire();
    try {
      const { files } = await updateFilesSchema.parseAsync(req.body);

      for (const { type, filePath, content, newFilePath } of files) {
        switch (type) {
          case "update":
          case "create":
            await ensureDirectoryExists(filePath);
            await fs.writeFile(filePath, content);
            break;
          case "delete":
            const exists = await fileExists(filePath);
            if (exists) {
              await fs.unlink(filePath);
            }
            break;
          case "move":
            if (!newFilePath || !content) {
              throw new Error(
                "newFilePath and content are required for move operation"
              );
            }
            await moveFile(filePath, newFilePath, content);
            break;
        }
      }

      res.status(200).send({ success: true, message: "files updated" });
    } catch (e) {
      console.log("update files failed", e);
      res.status(400).send({ success: false, message: "invalid request" });
    } finally {
      release();
    }
  }
);

const typecheckSchema = z.object({
  files: z
    .array(
      z.object({
        type: z.enum(["update", "create", "delete", "move"]),
        filePath: z.string(),
        content: z.string(),
        newFilePath: z.string().optional(),
      })
    )
    .optional(),
});

app.post(
  "/~zite/typecheck",
  bodyParser.json({ limit: BODY_LIMIT }),
  async (req, res) => {
    const release = await mutex.acquire();
    try {
      const { files } = await typecheckSchema.parseAsync(req.body);

      await fs.writeFile("./overrides.json", JSON.stringify(files));

      const { stdout } = await execPromise(
        "node --experimental-strip-types ./typechecker.ts",
        {
          env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1024" },
        }
      );

      const data = JSON.parse(stdout);

      res.status(200).send({
        success: true,
        diagnostics: data.diagnostics,
      });
    } catch (e) {
      console.log("typecheck failed", e);
      res.status(400).send({
        success: false,
        message: "invalid request",
      });
    } finally {
      release();
    }
  }
);

app.post("/~zite/build", async (req, res) => {
  let archive: archiver.Archiver | undefined;
  const release = await mutex.acquire();

  try {
    // Run vite build
    await execPromise("vite build", {
      env: { ...process.env, NODE_ENV: "production" },
    });

    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="dist.zip"',
      "Zite-App-Id": process.env.ZITE_APP_ID,
    });

    archive = archiver("zip", { zlib: { level: 9 } });

    // Handle client disconnection
    req.on("close", () => {
      if (archive && archive.destroy) {
        archive.destroy();
      }
      release();
    });

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) {
        res
          .status(500)
          .header("Zite-App-Id", process.env.ZITE_APP_ID)
          .send({ success: false, message: "archive creation failed" });
      }
      release();
    });

    archive.pipe(res);
    archive.directory("dist/", false);
    await archive.finalize();
  } catch (e) {
    const message = e.stderr || e.message || String(e);

    if (!res.headersSent) {
      res
        .header("Zite-App-Id", process.env.ZITE_APP_ID)
        .status(422)
        .send({ success: false, message });
    }

    if (archive && archive.destroy) {
      archive.destroy();
    }
  } finally {
    release();
  }
});

app.get("/~zite/ping", (_req, res) => {
  res.send("pong");
});

// Track whether the Vite server has been initialized
let isInitialized = false;

app.post(
  "/~zite/init",
  bodyParser.json({ limit: BODY_LIMIT }),
  async (req, res) => {
    const release = await mutex.acquire();
    try {
      const { files } = await initFilesSchema.parseAsync(req.body);

      if (isInitialized) {
        res.status(400).send({
          success: false,
          message: "Sandbox already initialized - should not happen",
        });
        return;
      }

      isInitialized = true;

      // Always update the files regardless of server state
      for (const { filePath, content } of files) {
        await ensureDirectoryExists(filePath);
        await fs.writeFile(filePath, content);
      }

      await createServer({
        root: __dirname,
        server: {
          middlewareMode: true,
          hmr: { server: httpServer, overlay: false },
          allowedHosts: [".ziteapp.com", ".zitedev.com"],
        },
        legacy: { skipWebSocketTokenCheck: true },
        optimizeDeps: {
          include: [...deps],
        },
      }).then((server) => app.use(server.middlewares));

      res.status(200).send({
        success: true,
        message: "sandbox initialized with files and vite server created",
      });
    } catch (e) {
      console.log("init failed", e);
      res.status(400).send({ success: false, message: "invalid request" });
    } finally {
      release();
    }
  }
);

app.get("/~zite/initialized", async (_req, res) => {
  res.status(500).send({
    success: false,
    message: "deprecated endpoint",
  });
});

app.get("/~zite/file-system/file-names", async (_req, res) => {
  try {
    const files = await getAllFiles(__dirname);
    res.status(200).send({
      success: true,
      files: files,
    });
  } catch (e) {
    console.log("file-names failed", e);
    res.status(500).send({
      success: false,
      message: "failed to read file system",
    });
  }
});

app.get("/~zite/file-system/file-content", async (_req, res) => {
  try {
    const filePaths = await getAllFiles(__dirname);
    const filesWithContent: {
      path: string;
      content: string | null;
      error?: string;
    }[] = [];

    for (const filePath of filePaths) {
      try {
        const fullPath = path.join(__dirname, filePath);
        const content = await fs.readFile(fullPath, "utf8");

        filesWithContent.push({
          path: filePath,
          content: content,
        });
      } catch (e) {
        // Skip files that can't be read as text (binary files, etc.)
        filesWithContent.push({
          path: filePath,
          content: null,
          error: "Could not read as text",
        });
      }
    }

    res.status(200).send({
      success: true,
      files: filesWithContent,
    });
  } catch (e) {
    console.log("file-content failed", e);
    res.status(500).send({
      success: false,
      message: "failed to read file system",
    });
  }
});

export const HAS_LOADED_FILES_FILE_PATH = "__zite__hasLoadedFiles.txt";

app.get("/~zite/has-files-loaded", async (_req, res) => {
  try {
    const backendInitializedFile = path.join(
      __dirname,
      HAS_LOADED_FILES_FILE_PATH
    );

    // Check if backend initialized file exists
    const exists = await fileExists(backendInitializedFile);
    if (!exists) {
      res.status(200).send({
        success: true,
        hasFilesLoaded: false,
        reason: "Backend initialized file does not exist",
      });
      return;
    }

    const content = await fs.readFile(backendInitializedFile, "utf8");

    // Define the default empty App.tsx content
    const defaultContent = "true";

    // Check if the content is different from the default
    const hasFilesLoaded = content.trim() === defaultContent.trim();

    res.status(200).send({
      success: true,
      hasFilesLoaded: hasFilesLoaded,
      reason: hasFilesLoaded
        ? "Has files loaded file has custom content"
        : "Has files loaded file contains default content",
    });
  } catch (e) {
    console.log("has-app-loaded failed", e);
    res.status(500).send({
      success: false,
      message: "failed to check has files loaded status",
    });
  }
});

httpServer.listen(8080, "0.0.0.0", () => {
  console.log("http://0.0.0.0:8080");
});
