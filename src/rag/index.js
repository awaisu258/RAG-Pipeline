import { chunckDocument } from "./chunk.js";
import { createEmbeddings } from "./createEmbeddings.js";
import { loadDocuments } from "./loadDocument.js";
import { storeEmbeddings } from "./storeEmbeddings.js";
const filePath = "./src/docs/sam.txt";

const data = await loadDocuments(filePath);

const chunkedData = chunckDocument(data);

const embeddings = await createEmbeddings(chunkedData);

await storeEmbeddings(filePath, chunkedData, embeddings);