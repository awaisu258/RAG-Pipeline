import OpenAI from "openai";
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";


const client = new GoogleGenAI({
    apiKey: process.env.GEMENI_API_KEY
});
export const createEmbeddings = async (chunks) => {
    const embed = await client.models.embedContent({
        contents: chunks.map((doc) => ({ parts: [{ text: doc }] })),
        model: "gemini-embedding-2",
        config: { outputDimensionality: 1536 },
    });
    return embed.embeddings.map(item => item.values);
}
