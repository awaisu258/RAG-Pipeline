const DEFAULT_MAX_CHARS = 2000;
const DEFAULT_OVERLAP = 200;

const normalize = (text) => text.replace(/\r\n?/g, "\n");

/**
 * Split one oversized paragraph into <= maxChars windows, preferring sentence
 * boundaries, then word boundaries, then a hard cut. Consecutive windows share
 * `overlap` characters so a fact split across a boundary is not lost.
 */
const splitOversizedParagraph = (paragraph, maxChars, overlap) => {
    if (paragraph.length <= maxChars) return [paragraph];

    const chunks = [];
    let start = 0;

    while (start < paragraph.length) {
        const hardEnd = Math.min(start + maxChars, paragraph.length);

        if (hardEnd === paragraph.length) {
            const tail = paragraph.slice(start).trim();
            if (tail) chunks.push(tail);
            break;
        }

        // Include one extra character so a break marker at the edge is visible.
        const window = paragraph.slice(start, hardEnd + 1);
        const minBreak = Math.floor(maxChars * 0.5);

        const sentenceBreak = Math.max(
            window.lastIndexOf(". "),
            window.lastIndexOf("! "),
            window.lastIndexOf("? "),
            window.lastIndexOf("\n"),
        );
        const spaceBreak = window.lastIndexOf(" ");

        let breakAt;
        if (sentenceBreak >= minBreak) breakAt = sentenceBreak + 1;
        else if (spaceBreak >= minBreak) breakAt = spaceBreak;
        else breakAt = maxChars;

        const chunk = paragraph.slice(start, start + breakAt).trim();
        if (chunk) chunks.push(chunk);

        const nextStart = start + breakAt;
        start = Math.max(start + 1, nextStart - overlap);

        // Do not start a chunk in the middle of a word.
        if (start < paragraph.length && !/\s/.test(paragraph[start - 1])) {
            const nextSpace = paragraph.indexOf(" ", start);
            if (nextSpace !== -1 && nextSpace < nextStart) start = nextSpace + 1;
        }
    }

    return chunks;
};

/**
 * Paragraph-aware chunker.
 *
 * Documents are split on blank lines (the original behaviour), then any
 * paragraph larger than `maxChars` is windowed so no chunk can exceed the
 * embedding model's input limit.
 *
 * @param {string} text
 * @param {{ maxChars?: number, overlap?: number }} [options]
 * @returns {string[]}
 */
export const chunkDocument = (
    text,
    { maxChars = DEFAULT_MAX_CHARS, overlap = DEFAULT_OVERLAP } = {},
) => {
    if (typeof text !== "string") return [];

    return normalize(text)
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph.length > 0)
        .flatMap((paragraph) => splitOversizedParagraph(paragraph, maxChars, overlap));
};
