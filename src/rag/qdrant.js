import "dotenv/config";
import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "./config.js";

const url = process.env.QDRANT_HOST ?? "http://localhost:6333";
const apiKey = process.env.QDRANT_KEY || undefined;

export const qdrant = new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : {}),
    checkCompatibility: false,
});

let collectionPromise;

/**
 * Filters on payload fields require a payload index on strict Qdrant
 * deployments. Creating an existing index is a no-op.
 */
const ensurePayloadIndexes = async (collection) => {
    for (const field of ["filePath", "contentHash"]) {
        await qdrant.createPayloadIndex(collection, {
            field_name: field,
            field_schema: "keyword",
            wait: true,
        });
    }
};

/**
 * Create the collection on first use. Deliberately not a module side effect:
 * importing this file (tests, dry runs) must not touch the server.
 *
 * Memoized, so concurrent callers share one existence check.
 */
export const ensureCollection = ({ recreate = false } = {}) => {
    if (recreate) collectionPromise = undefined;

    collectionPromise ??= (async () => {
        const name = config.qdrant.collection;
        const { exists } = await qdrant.collectionExists(name);

        if (exists && !recreate) {
            await ensurePayloadIndexes(name);
            return name;
        }

        if (exists) await qdrant.deleteCollection(name);

        await qdrant.createCollection(name, {
            vectors: { size: config.embedding.dimensions, distance: "Cosine" },
        });
        await ensurePayloadIndexes(name);

        return name;
    })();

    return collectionPromise;
};
