## Basic RAG Project

A small document Q&A pipeline: text files -> paragraph-aware chunks -> Gemini
embeddings -> Qdrant -> retrieval -> Gemini.

### Setup

1. `npm install`
2. Create `.env` with:
   - `GEMINI_API_KEY` (falls back to `GEMENI_API_KEY`)
   - `QDRANT_HOST`
   - `QDRANT_KEY`
3. Put `.txt` files in `src/docs`.

### Index

```bash
npm run index                        # index src/docs
npm run index -- path/to/doc.txt     # index a single file
npm run index -- path/to/dir         # index every .txt in a directory
npm run index -- --dry-run           # chunking stats only, no API calls
npm run index -- --force             # re-embed unchanged files
npm run index -- --recreate          # drop and recreate the collection
```

Re-running is safe: unchanged files are skipped by content hash, and an edited
file replaces its previous points instead of duplicating them.

### Query

```bash
npm run query
```

### How it works

1. Load each document as UTF-8.
2. Split on blank lines; paragraphs over 2000 chars are windowed with overlap.
3. Embed in batches with retry/backoff (`gemini-embedding-2`, 1536 dims).
4. Upsert into Qdrant with deterministic point IDs and file metadata.
5. Embed the query, retrieve the top 5 chunks above a similarity threshold.
6. Ask Gemini to answer using only those chunks, with file/paragraph citations.
