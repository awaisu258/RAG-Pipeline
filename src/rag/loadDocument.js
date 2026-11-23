import { readFile } from "node:fs/promises";

/**
 * Read a text document as UTF-8.
 *
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export const loadDocuments = async (filePath) => {
    if (!filePath) throw new Error("loadDocuments: filePath is required");
    return await readFile(filePath, "utf8");
};
