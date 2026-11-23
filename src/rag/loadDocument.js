import { readFile } from "node:fs/promises";

export const loadDocuments = async (filePath) => {
    if (!filePath) return;
    return await readFile(filePath, "utf8");
}
