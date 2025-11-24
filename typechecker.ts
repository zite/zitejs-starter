import ts from "typescript";
import stripColor from "strip-color";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { readFile } from "fs/promises";

// the temporary/incremental changes which we haven't committed to disk yet
const modifiedFiles = new Map<string, string>();
const deletedFiles = new Set<string>();
const fileVersions = new Map<string, string>();

function initializeProgram() {
  // Read and parse config once
  const config = ts.readConfigFile("./tsconfig.app.json", ts.sys.readFile);

  // Optimize compiler options for speed and enable incremental compilation
  const parsedConfig = ts.parseJsonConfigFileContent(
    {
      ...config.config,
      compilerOptions: {
        ...config.config.compilerOptions,
        skipLibCheck: true,
        noEmit: true,
        incremental: true,
        tsBuildInfoFile: path.join(process.cwd(), ".tsbuildinfo"),
        // we don't want to be too strict, this checker is mainly focused on whether the app
        // compiles. or if there are explicit type errors, like passing the wrong props to a
        // component.
        noUnusedLocals: false,
        noUnusedParameters: false,
        noImplicitAny: false,
      },
    },
    ts.sys,
    process.cwd(),
  );

  // Create a custom incremental compiler host with proper version tracking
  const host = ts.createIncrementalCompilerHost(parsedConfig.options);

  // Override getSourceFile to handle versions
  const originalGetSourceFile = host.getSourceFile;
  host.getSourceFile = (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) => {
    // Normalize the file path to handle different path formats
    const normalizedFileName = path.normalize(fileName);

    // If the file is marked as deleted, return undefined
    // This ensures the compiler doesn't see the file at all
    if (deletedFiles.has(normalizedFileName)) {
      return undefined;
    }

    // Declare sourceFile variable
    let sourceFile: ts.SourceFile | undefined;

    if (modifiedFiles.has(normalizedFileName)) {
      const content = modifiedFiles.get(normalizedFileName)!;
      sourceFile = ts.createSourceFile(
        normalizedFileName,
        content,
        languageVersion,
      );

      // Generate a version hash for this content
      const contentHash = crypto
        .createHash("md5")
        .update(content)
        .digest("hex");
      fileVersions.set(normalizedFileName, contentHash);

      // Set the version on the source file
      (sourceFile as any).version = contentHash;
    } else {
      sourceFile = originalGetSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );

      if (sourceFile) {
        // For files from disk, use the file's mtime as version
        try {
          const stats = fs.statSync(fileName);
          const mtime = stats.mtime.getTime().toString();

          if (!fileVersions.has(normalizedFileName)) {
            fileVersions.set(normalizedFileName, mtime);
          }

          // Set the version on the source file
          (sourceFile as any).version = fileVersions.get(normalizedFileName);
        } catch (err) {
          // If we can't get the file stats, use a default version
          const defaultVersion = "1";
          fileVersions.set(normalizedFileName, defaultVersion);
          (sourceFile as any).version = defaultVersion;
        }
      }
    }

    return sourceFile;
  };

  // Override fileExists to handle our modified and deleted files
  const originalFileExists = host.fileExists;
  host.fileExists = (fileName) => {
    const normalizedFileName = path.normalize(fileName);
    if (deletedFiles.has(normalizedFileName)) {
      return false;
    }
    if (modifiedFiles.has(normalizedFileName)) {
      return true;
    }
    return originalFileExists(fileName);
  };

  // Override readFile to use our modified files
  const originalReadFile = host.readFile;
  host.readFile = (fileName) => {
    const normalizedFileName = path.normalize(fileName);
    if (deletedFiles.has(normalizedFileName)) {
      return undefined; // Return undefined for deleted files
    }
    if (modifiedFiles.has(normalizedFileName)) {
      return modifiedFiles.get(normalizedFileName) || "";
    }
    return originalReadFile(fileName);
  };

  // Override host.directoryExists to check if any file in our virtual filesystem is within this directory
  const originalDirectoryExists = host.directoryExists;
  if (originalDirectoryExists) {
    host.directoryExists = (directoryName) => {
      const normalizedDirectoryName = path.normalize(directoryName);

      // Check if there are any non-deleted virtual files in this directory
      const hasVirtualFileInDirectory = Array.from(modifiedFiles.keys()).some(
        (fileName) => {
          const normalizedFileName = path.normalize(fileName);
          // Skip files that are marked as deleted
          if (deletedFiles.has(normalizedFileName)) {
            return false;
          }
          return (
            normalizedFileName.startsWith(normalizedDirectoryName + path.sep) ||
            normalizedFileName === normalizedDirectoryName
          );
        },
      );

      if (hasVirtualFileInDirectory) {
        return true;
      }

      return originalDirectoryExists(directoryName);
    };
  }

  // Create a custom language service host that provides proper versioning
  const languageServiceHost: ts.CompilerHost & {
    getScriptVersion(fileName: string): string;
  } = {
    ...host,
    getScriptVersion: (fileName: string): string => {
      const normalizedFileName = path.normalize(fileName);
      return fileVersions.get(normalizedFileName) || "1";
    },
  };

  // Create an incremental program with our versioned host
  const builder = ts.createIncrementalProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
    host: languageServiceHost,
  });

  return { host: languageServiceHost, builder };
}

export async function typecheck(
  files: {
    filePath: string;
    content: string;
    type: "update" | "create" | "delete" | "move";
    newFilePath?: string;
  }[],
) {
  try {
    // Process file changes
    for (const { filePath, content, type, newFilePath } of files) {
      // Ensure we're using absolute paths consistently
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      // Normalize the path to handle different path formats
      const normalizedPath = path.normalize(absolutePath);

      if (type === "delete") {
        modifiedFiles.delete(normalizedPath);

        // Mark file as deleted so fileExists returns false for it
        deletedFiles.add(normalizedPath);

        // Keep the version in fileVersions for incremental compilation tracking
      } else {
        // Determine the target path and content for create/update/move operations
        let targetPath: string;
        let targetContent: string;

        if (type === "move" && newFilePath) {
          // For move operations, use the new file path
          const newAbsolutePath = path.isAbsolute(newFilePath)
            ? newFilePath
            : path.resolve(process.cwd(), newFilePath);
          targetPath = path.normalize(newAbsolutePath);
          targetContent = content;

          // Remove old file from tracking
          modifiedFiles.delete(normalizedPath);
          deletedFiles.add(normalizedPath);
        } else {
          // For create/update operations, use the original path
          targetPath = normalizedPath;
          targetContent = content;
        }

        // Add file to tracking
        modifiedFiles.set(targetPath, targetContent);

        // If file was previously deleted, remove from deleted set
        deletedFiles.delete(targetPath);

        // Generate a new version hash for this content
        const contentHash = crypto
          .createHash("md5")
          .update(targetContent)
          .digest("hex");
        fileVersions.set(targetPath, contentHash);
      }
    }

    const { host, builder } = initializeProgram();

    // Get diagnostics from the incremental builder
    const syntacticDiagnostics = builder.getSyntacticDiagnostics();
    const semanticDiagnostics = builder.getSemanticDiagnostics();
    const allDiagnostics = [...syntacticDiagnostics, ...semanticDiagnostics];

    // filter out noise and format
    const filteredDiagnostics = allDiagnostics
      .filter((d) => d.category === ts.DiagnosticCategory.Error)
      .filter(
        (d) =>
          !d.file ||
          (!d.file.fileName.includes("node_modules") &&
            !d.file.fileName.includes("__zite__")),
      )
      .filter(
        (d) =>
          // typescript complains we can't import css files
          !d.messageText || !d.messageText.toString().includes("index.css"),
      );

    // Emit to save the build info for future incremental builds
    builder.emit();

    const result = {
      diagnostics:
        filteredDiagnostics.length > 0
          ? stripColor(
              ts.formatDiagnosticsWithColorAndContext(
                filteredDiagnostics,
                host,
              ),
            ).replaceAll(/.*src\/__zite__\/([^\/\\]+)(?:\.ts)?/g, "@zite/$1")
          : undefined,
    };

    return result;
  } catch (error) {
    throw error;
  }
}

if (process.argv[1] === import.meta.filename) {
  const overrides = await readFile("./overrides.json", "utf-8");
  const result = await typecheck(JSON.parse(overrides));
  console.log(JSON.stringify(result));
}
