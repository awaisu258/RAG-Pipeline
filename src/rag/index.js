import path from "node:path";
import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chunkDocument } from "./chunk.js";
import { config } from "./config.js";
import { createEmbeddings } from "./createEmbeddings.js";
import { loadDocuments } from "./loadDocument.js";
import { ensureCollection } from "./qdrant.js";
import { getIndexedContentHash, storeEmbeddings } from "./storeEmbeddings.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "../..");

const hashContent = (text) =>
    createHash("sha256").update(text, "utf8").digest("hex");

/**
 * Stable identifier stored in Qdrant payloads: project-relative when possible,
 * so IDs do not change with the directory the CLI is launched from.
 */
const toDocumentPath = (absolutePath) => {
    const relative = path.relative(PROJECT_ROOT, absolutePath);
    if (!relative || relative.startsWith("..")) return absolutePath;
    return relative.split(path.sep).join("/");
};

const formatMs = (ms) =>
    ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

const formatBytes = (bytes) =>
    bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Load, chunk, embed and store a single document.
 *
 * Returns a result object instead of throwing for expected outcomes (empty,
 * unchanged, dry run); real failures throw and are handled per file by the CLI.
 *
 * @param {string} filePath
 * @param {{ dryRun?: boolean, force?: boolean }} [options]
 */
export const indexDocuments = async (
    filePath,
    { dryRun = false, force = false } = {},
) => {
    const startedAt = performance.now();
    const absolutePath = path.resolve(filePath);
    const documentPath = toDocumentPath(absolutePath);
    const elapsed = () => performance.now() - startedAt;

    const text = await loadDocuments(absolutePath);
    if (!text.trim()) {
        return {
            status: "skipped",
            documentPath,
            reason: "empty file",
            durationMs: elapsed(),
        };
    }

    const contentHash = hashContent(text);

    // Skip work when this exact content is already indexed.
    if (!dryRun && !force) {
        const indexedHash = await getIndexedContentHash(documentPath);
        if (indexedHash === contentHash) {
            return {
                status: "unchanged",
                documentPath,
                contentHash,
                durationMs: elapsed(),
            };
        }
    }

    const chunks = chunkDocument(text, config.chunking);
    if (chunks.length === 0) {
        return {
            status: "skipped",
            documentPath,
            reason: "no chunks produced",
            durationMs: elapsed(),
        };
    }

    if (dryRun) {
        return {
            status: "dry-run",
            documentPath,
            bytes: Buffer.byteLength(text, "utf8"),
            chunks: chunks.length,
            preview: chunks[0].replace(/\s+/g, " ").slice(0, 120),
            durationMs: elapsed(),
        };
    }

    const embeddings = await createEmbeddings(chunks);

    if (embeddings.length !== chunks.length) {
        throw new Error(
            `produced ${chunks.length} chunks but ${embeddings.length} embeddings`,
        );
    }

    const { points } = await storeEmbeddings({
        filePath: documentPath,
        contentHash,
        chunks,
        embeddings,
    });

    return {
        status: "indexed",
        documentPath,
        bytes: Buffer.byteLength(text, "utf8"),
        chunks: chunks.length,
        points,
        durationMs: elapsed(),
    };
};

const describe = (result) => {
    switch (result.status) {
        case "indexed":
            return `indexed    ${result.chunks} chunks -> ${result.points} points  ${formatMs(result.durationMs)}`;
        case "unchanged":
            return `unchanged  content hash matches, use --force to re-embed  ${formatMs(result.durationMs)}`;
        case "skipped":
            return `skipped    ${result.reason}`;
        case "dry-run":
            return `dry-run    ${result.chunks} chunks from ${formatBytes(result.bytes)}  ${formatMs(result.durationMs)}`;
        default:
            return result.status;
    }
};

const USAGE = `Usage: node src/rag/index.js [paths...] [options]

Chunk, embed and index .txt documents into Qdrant.

Arguments:
  paths                 Files or directories to index (default: ${config.indexing.defaultInput})

Options:
  --dry-run             Load and chunk only. No API calls, no writes.
  --force               Re-embed even when the file content is unchanged.
  --recreate            Drop and recreate the Qdrant collection first.
  -h, --help            Show this help.

Examples:
  npm run index
  npm run index -- src/docs/dario.txt
  npm run index -- src/docs --dry-run
  npm run index -- src/docs --force
`;

const parseArgs = (argv) => {
    const options = {
        paths: [],
        dryRun: false,
        force: false,
        recreate: false,
        help: false,
    };

    for (const argument of argv) {
        switch (argument) {
            case "-h":
            case "--help":
                options.help = true;
                break;
            case "--dry-run":
                options.dryRun = true;
                break;
            case "--force":
                options.force = true;
                break;
            case "--recreate":
                options.recreate = true;
                break;
            default:
                if (argument.startsWith("-")) {
                    throw new Error(`Unknown option: ${argument}`);
                }
                options.paths.push(argument);
        }
    }

    return options;
};

const resolveInputs = async (targets) => {
    const files = new Set();

    for (const target of targets) {
        const absolute = path.resolve(target);

        let stats;
        try {
            stats = await stat(absolute);
        } catch {
            throw new Error(`Input not found: ${target}`);
        }

        if (stats.isDirectory()) {
            const entries = await readdir(absolute, { withFileTypes: true });
            const matching = entries
                .filter(
                    (entry) =>
                        entry.isFile() &&
                        config.indexing.extensions.includes(
                            path.extname(entry.name).toLowerCase(),
                        ),
                )
                .map((entry) => path.join(absolute, entry.name))
                .sort();

            if (matching.length === 0) {
                console.warn(`  ! no indexable files in ${target}`);
            }
            for (const file of matching) files.add(file);
        } else if (stats.isFile()) {
            files.add(absolute);
        } else {
            throw new Error(`Unsupported input: ${target}`);
        }
    }

    return [...files];
};

/**
 * CLI entry point. Returns the process exit code.
 *
 * @param {string[]} argv Arguments after the script name.
 * @returns {Promise<number>}
 */
export const main = async (argv) => {
    const startedAt = performance.now();
    const options = parseArgs(argv);

    if (options.help) {
        console.log(USAGE);
        return 0;
    }

    if (options.dryRun && options.recreate) {
        throw new Error("--recreate cannot be combined with --dry-run");
    }

    const targets = options.paths.length
        ? options.paths
        : [path.join(PROJECT_ROOT, config.indexing.defaultInput)];

    const files = await resolveInputs(targets);

    if (files.length === 0) {
        console.log("Nothing to index.");
        return 0;
    }

    console.log(
        `Indexing ${files.length} file(s) with ${config.embedding.model} -> "${config.qdrant.collection}"`,
    );
    if (options.dryRun) console.log("Dry run: no embeddings or writes.\n");

    // One collection check for the whole run. Skipped entirely on dry runs.
    if (!options.dryRun) {
        await ensureCollection({ recreate: options.recreate });
    }

    const results = [];

    for (const file of files) {
        try {
            const result = await indexDocuments(file, options);
            results.push(result);
            console.log(`  ${describe(result)}  ${result.documentPath}`);
            if (result.status === "dry-run") {
                console.log(`             preview: ${result.preview}...`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            results.push({ status: "failed", documentPath: file, message });
            console.error(`  failed     ${file}: ${message}`);
        }
    }

    const count = (status) =>
        results.filter((result) => result.status === status).length;

    const indexed = count("indexed");
    const unchanged = count("unchanged");
    const skipped = count("skipped");
    const dryRun = count("dry-run");
    const failed = count("failed");
    const totalPoints = results
        .filter((result) => result.status === "indexed")
        .reduce((sum, result) => sum + result.points, 0);

    const parts = options.dryRun
        ? [`${dryRun} ready`]
        : [
              `${indexed} indexed`,
              unchanged ? `${unchanged} unchanged` : null,
              skipped ? `${skipped} skipped` : null,
          ];
    if (failed) parts.push(`${failed} failed`);

    console.log(
        `\n${parts.filter(Boolean).join(", ")}` +
            (options.dryRun ? "" : `, ${totalPoints} points upserted`) +
            ` in ${formatMs(performance.now() - startedAt)}`,
    );

    return failed > 0 ? 1 : 0;
};

const isEntryPoint =
    process.argv[1] &&
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isEntryPoint) {
    main(process.argv.slice(2))
        .then((exitCode) => {
            process.exitCode = exitCode;
        })
        .catch((error) => {
            console.error(`\nFatal: ${error instanceof Error ? error.message : error}`);
            if (process.env.DEBUG) console.error(error);
            process.exitCode = 1;
        });
}
