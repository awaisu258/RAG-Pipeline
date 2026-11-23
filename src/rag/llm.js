import { GoogleGenAI } from "@google/genai";
import "dotenv/config"

const client = new GoogleGenAI({
    apiKey: process.env.GEMENI_API_KEY
})

export const executeLLM = async (query, chunks) => {
    const prompt = 'user query:' + query.trim() + ", and here is the chunks for internal docs: " + chunks.trim();

    const chat = client.chats.create({
        model: 'gemini-3.5-flash-lite',
    });
    const response = await chat.sendMessage({ message: prompt, config: { systemInstruction: "You need to answer to the user query based on the chunks provided. use only these chunks documents to answer to the query. do not retreive or add placeholders for any information which is not present, do not overhead the answer response with everything which the user do not asked, just answer within few sentences, do not answer out of context, and also provide the user with grounded sources where the answer lies in the docs and which paragraph" } });
    console.log(response.candidates[0].content.parts[0].text);


}  