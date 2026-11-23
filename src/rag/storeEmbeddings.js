import { createHash } from "node:crypto";
import { config } from "./config.js";
import { ensureCollection, qdrant } from "./qdrant.js";

const COLLECTION = config.qdrant.collection;

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

/**
 * Qdrant only accepts unsigned integers or UUIDs as point IDs. Derive a stable
 * UUID from the document path + chunk position + chunk text so re-indexing the
 * same content upserts (instead of duplicating) and editing a chunk creates a
 * new point that replaces the old one.
 */
const pointId = (filePath, chunkIndex, text) => {
    const hex = sha256(`${filePath}\u0000${chunkIndex}\u0000${text}`);
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        `4${hex.slice(13, 16)}`,
        `a${hex.slice(17, 20)}`,
        hex.slice(20, 32),
    ].join("-");
};

/**
 * Content hash of the currently indexed version of a document, or null.
 *
 * @param {string} filePath Project-relative path stored in the payload.
 * @returns {Promise<string | null>}
 */
export const getIndexedContentHash = async (filePath) => {
    await ensureCollection();

    const result = await qdrant.scroll(COLLECTION, {
        filter: { must: [{ key: "filePath", match: { value: filePath } }] },
        limit: 1,
        with_payload: ["contentHash"],
        with_vector: false,
    });

    return result.points?.[0]?.payload?.contentHash ?? null;
};

/**
 * Replace a document's points in Qdrant.
 *
 * Order matters: new points are upserted first, then points from previous
 * versions of the same file are removed. A failed upsert therefore never
 * leaves the document un-indexed.
 *
 * @param {{
 *   filePath: string,
 *   contentHash: string,
 *   chunks: string[],
 *   embeddings: number[][],
 * }} input
 * @returns {Promise<{ points: number }>}
 */
export const storeEmbeddings = async ({
    filePath,
    contentHash,
    chunks,
    embeddings,
}) => {
    if (!Array.isArray(chunks) || !Array.isArray(embeddings)) {
        throw new TypeError("storeEmbeddings expects chunks and embeddings arrays");
    }
    if (chunks.length !== embeddings.length) {
        throw new Error(
            `${filePath}: ${chunks.length} chunks but ${embeddings.length} embeddings`,
        );
    }
    if (chunks.length === 0) return { points: 0 };
    if (!contentHash) throw new Error("storeEmbeddings requires a contentHash");

    await ensureCollection();

    const source = filePath.split("/").pop();
    const indexedAt = new Date().toISOString();
    const totalChunks = chunks.length;

    const points = chunks.map((text, chunkIndex) => ({
        id: pointId(filePath, chunkIndex, text),
        vector: embeddings[chunkIndex],
        payload: {
            text,
            filePath,
            source,
            // `paragraph` is kept for the existing context builder.
            paragraph: chunkIndex + 1,
            chunkIndex,
            totalChunks,
            contentHash,
            embeddingModel: config.embedding.model,
            indexedAt,
        },
    }));

    const batchSize = config.qdrant.upsertBatchSize;
    for (let index = 0; index < points.length; index += batchSize) {
        await qdrant.upsert(COLLECTION, {
            points: points.slice(index, index + batchSize),
            wait: true,
        });
    }

    await qdrant.delete(COLLECTION, {
        wait: true,
        filter: {
            must: [{ key: "filePath", match: { value: filePath } }],
            must_not: [{ key: "contentHash", match: { value: contentHash } }],
        },
    });

    return { points: points.length };
};
