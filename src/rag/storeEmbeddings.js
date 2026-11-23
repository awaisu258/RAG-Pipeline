import { QdrantClient } from "@qdrant/js-client-rest";
import "dotenv/config"

const client = new QdrantClient({
    url: process.env.QDRANT_HOST,
    apiKey: process.env.QDRANT_KEY,
});
const collectionExits = await client.collectionExists("data");
if (!collectionExits.exists)
    await client.createCollection("data", {
        vectors: { size: 1536, distance: "Cosine" },
    });

export const storeEmbeddings = async (filePath, chunks, embeddings) => {
    const points = chunks.map((chunk, index) => ({
        id: index + 1,
        vector: embeddings[index],
        payload: {
            text: chunk,
            filePath,
            paragraph: index + 1
        }
    }));
    await client.upsert("data", { points });
}