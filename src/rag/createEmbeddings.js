import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GEMENI_API_KEY;

let client;

const getClient = () => {
    if (client) return client;
    if (!apiKey) {
        throw new Error(
            "Missing Gemini API key. Set GEMINI_API_KEY (or GEMENI_API_KEY) in .env",
        );
    }
    client = new GoogleGenAI({ apiKey });
    return client;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error) => {
    const status =
        error?.status ?? error?.code ?? error?.response?.status ?? error?.error?.code;
    const message = error?.message ?? "";

    if (status === 429 || status === "RESOURCE_EXHAUSTED") return true;
    if (typeof status === "number" && status >= 500) return true;
    if (/\b429\b|RESOURCE_EXHAUSTED|rate limit|quota/i.test(message)) return true;

    return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|socket hang up/i.test(message);
};

/** Use the server's "retry in Ns" hint when it provides one. */
const retryDelayMs = (error) => {
    const message = error?.message ?? "";
    const hint =
        /retry in ([\d.]+)\s*s/i.exec(message) ??
        /"retryDelay"\s*:\s*"([\d.]+)s"/i.exec(message);
    if (!hint) return 0;
    return Math.min(Number(hint[1]) * 1000, 30_000);
};

const withRetry = async (operation) => {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (
                attempt >= config.embedding.maxRetries ||
                !isRetryable(error)
            ) {
                throw error;
            }

            const backoff = Math.min(
                config.embedding.retryBaseDelayMs * 2 ** attempt,
                8_000,
            );
            const delay = Math.max(backoff, retryDelayMs(error));
            await sleep(delay + Math.floor(Math.random() * 250));
        }
    }
};

const embedBatch = async (texts) => {
    const response = await withRetry(() =>
        getClient().models.embedContent({
            contents: texts.map((text) => ({ parts: [{ text }] })),
            model: config.embedding.model,
            config: { outputDimensionality: config.embedding.dimensions },
        }),
    );

    const vectors = response.embeddings?.map((embedding) => embedding.values);

    if (
        !vectors ||
        vectors.length !== texts.length ||
        vectors.some((vector) => !Array.isArray(vector))
    ) {
        throw new Error(
            `Embedding response mismatch: expected ${texts.length} vectors, received ${vectors?.length ?? 0}`,
        );
    }

    return vectors;
};

/**
 * Embed texts in batches, preserving input order.
 *
 * @param {string[]} texts
 * @param {{ batchSize?: number, concurrency?: number }} [options]
 * @returns {Promise<number[][]>} One vector per input text.
 */
export const createEmbeddings = async (texts, options = {}) => {
    if (!Array.isArray(texts)) {
        throw new TypeError("createEmbeddings expects an array of strings");
    }
    if (texts.length === 0) return [];

    const invalidIndex = texts.findIndex(
        (text) => typeof text !== "string" || text.trim().length === 0,
    );
    if (invalidIndex !== -1) {
        throw new Error(
            `createEmbeddings received blank text at index ${invalidIndex}`,
        );
    }

    const batchSize = Math.max(1, options.batchSize ?? config.embedding.batchSize);
    const concurrency = Math.max(
        1,
        options.concurrency ?? config.embedding.concurrency,
    );

    const batches = [];
    for (let index = 0; index < texts.length; index += batchSize) {
        batches.push(texts.slice(index, index + batchSize));
    }

    const results = new Array(batches.length);
    let cursor = 0;

    const workers = Array.from(
        { length: Math.min(concurrency, batches.length) },
        async () => {
            while (cursor < batches.length) {
                const batchIndex = cursor;
                cursor += 1;
                results[batchIndex] = await embedBatch(batches[batchIndex]);
            }
        },
    );

    await Promise.all(workers);

    return results.flat();
};
