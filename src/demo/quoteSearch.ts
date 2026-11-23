import { QdrantClient } from "@qdrant/js-client-rest";
import "dotenv/config"

const client = new QdrantClient({
    url: process.env.QDRANT_HOST,
    apiKey: process.env.QDRANT_KEY,
});

// generate query embedding
const queryText = "quotes";

// search for similar items
const results = await client.query("quotes", {
    query: {
        text: queryText,
        model: "sentence-transformers/all-MiniLM-L6-v2",
    },
    with_payload: true,
    limit: 5,
});

// print results
for (const result of results.points) {
    console.log(`Quote: ${result.payload?.item_name || 'N/A'}`);
    console.log(`Author: ${result.payload?.author || 'N/A'}`);
    console.log(`Score: ${result.score * 100}%`);
    console.log('---');
}