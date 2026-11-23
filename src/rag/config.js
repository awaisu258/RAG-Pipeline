const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSIONS = 1536;
const SCHEMA_VERSION = 1;

const toSlug = (value) =>
    value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/**
 * Single source of truth for the pipeline.
 *
 * The Qdrant collection name encodes the embedding model and dimensions, so
 * switching models can never silently mix vectors from different spaces.
 * Bump `schemaVersion` whenever the payload/chunking format changes.
 */
export const config = {
    embedding: {
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        // Inputs per embedContent request. Keeps us under the API batch limit.
        batchSize: 32,
        // Batches in flight at once. Raise carefully; 429s are retried.
        concurrency: 2,
        maxRetries: 5,
        retryBaseDelayMs: 500,
    },
    chunking: {
        // Conservative ceiling, well below the embedding model's token limit.
        maxChars: 2000,
        overlap: 200,
    },
    qdrant: {
        schemaVersion: SCHEMA_VERSION,
        collection: `docs_v${SCHEMA_VERSION}_${toSlug(EMBEDDING_MODEL)}_${EMBEDDING_DIMENSIONS}`,
        upsertBatchSize: 128,
    },
    indexing: {
        defaultInput: "src/docs",
        extensions: [".txt"],
    },
};
