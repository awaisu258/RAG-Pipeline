import { buildContext } from "./buildContext.js";
import { createEmbeddings } from "./createEmbeddings.js";
import { executeLLM } from "./llm.js";
import { retrieveChunks } from "./retrieveChunks.js";

const query = "who is sam altman";

const queryEmbeedings = await createEmbeddings([query]);

const chunks = await retrieveChunks(queryEmbeedings[0]);


const context = buildContext(chunks);
await executeLLM(query, context);
