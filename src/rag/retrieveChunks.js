import { config } from "./config.js";
import { qdrant } from "./qdrant.js";

/**
 * Nearest-neighbour search over the indexed chunks.
 *
 * @param {number[]} embedding Query vector.
 * @param {{ limit?: number, scoreThreshold?: number }} [options]
 */
export const retrieveChunks = async (
    embedding,
    { limit = 5, scoreThreshold = 0.4 } = {},
) => {
    return await qdrant.query(config.qdrant.collection, {
        query: embedding,
        limit,
        with_payload: true,
        score_threshold: scoreThreshold,
    });
};
