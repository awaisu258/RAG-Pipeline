export const chunckDocument = (text) => {
    const chunkData = text?.trim()?.split("\n\n").map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);
    return chunkData;
}