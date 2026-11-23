import { QdrantClient } from "@qdrant/js-client-rest";
import "dotenv/config"

const client = new QdrantClient({
    url: process.env.QDRANT_HOST,
    apiKey: process.env.QDRANT_KEY,
});

await client.createCollection("quotes", {
    vectors: { size: 384, distance: "Cosine" },
});

let quotes = [[
    "Twenty years from now you will be more disappointed by the things that you didn't do than by the ones you did do. So throw off the bowlines. Sail away from the safe harbor. Catch the trade winds in your sails. Explore. Dream. Discover.",
    "H. Jackson Brown"
], ["I believe that everything happens for a reason. People change so that you can learn to let go, things go wrong so that you appreciate them when they're right, you believe lies so you eventually learn to trust no one but yourself, and sometimes good things fall apart so better things can fall together.", "Marilyn Monroe"],
["It is better to be hated for what you are than to be loved for what you are not.", "Andre Gide"], ["Insanity is doing the same thing, over and over again, but expecting different results.", "Narcotics"], ["Here's to the crazy ones. The misfits. The rebels. The troublemakers. The round pegs in the square holes. The ones who see things differently. They're not fond of rules. And they have no respect for the status quo. You can quote them, disagree with them, glorify or vilify them. About the only thing you can't do is ignore them. Because they change things. They push the human race forward. And while some may see them as the crazy ones, we see genius. Because the people who are crazy enough to think they can change the world, are the ones who do.", "Steve Jobs"],
["Be yourself; everyone else is already taken", "Oscar Wilde"], ["I'm selfish, impatient and a little insecure. I make mistakes, I am out of control and at times hard to handle. But if you can't handle me at my worst, then you sure as hell don't deserve me at my best", "Marilyn Monroe"], ["So many books, so little time.", "Frank Zappa"], ["Two things are infinite: the universe and human stupidity; and I'm not sure about the universe.", "Albert Einstein"]];
// generate embeddings and prepare points
const points: any[] = [];
let idx = 0;

for (const quote of quotes) {
    points.push({
        id: idx,
        vector: {
            text: `${quote[0]}}`,
            model: "sentence-transformers/all-MiniLM-L6-v2",
        },
        payload: {
            item_name: quote[0],
            author: quote[1]
        },
    });
    idx++;
}

// upsert points to collection
await client.upsert("quotes", { points });