# LLM_research_paper_summary

Quick instructions to run the Local LLM Literature Reviewer locally for development and validation.

## Prerequisites

- A modern browser (Chrome/Edge recommended) — WebGPU support improves performance but is optional.
- Python 3 (or any static file server) to serve the app locally.

> Important: The app uses ES modules and fetches external model files. Serve the folder via HTTP (do not open `index.html` with `file://`).

## Run locally (quick)

1. Open a terminal in the project root (where `index.html` is located).

2. Start a simple HTTP server:

```bash
# Python
python -m http.server 8000

# or with npm (if installed)
npx http-server -c-1 .
```

3. Open your browser at:

```
http://localhost:8000
```

## What will be tested / Validation criteria

The following manual checks are used to validate the app:

- Start the local server and open the UI.
- Upload one or more PDF files (drag & drop or browse). The UI should show processing status.
- Text extraction: pages should be read and concatenated (visible in logs or chunks display).
- Chunking: text must be split into chunks (check the "Text Chunks" debug view).
- Embeddings: embeddings must be generated for chunks (or the app must clearly fall back if embedding model fails).
- Vector search: using the search box returns relevant chunks/excerpts.
- Chat (RAG): with `Use RAG` enabled, asking a question should produce an answer that references source documents when relevant.

Expected behavior: the app displays clear status messages (extraction, embedding generation, ready), shows processed documents, and assistant answers indicate sources.

## GPU / WebLLM notes & fallback

- WebGPU yields the best performance but may fail on devices with limited GPU memory ("Device was lost").
- If the model fails to initialize on GPU, the app should provide a fallback path (WASM/CPU). If you see GPU/device errors, try:
	- Selecting a much smaller model from the UI.
	- Closing other GPU-intensive applications (browser tabs, GPU apps).
	- Reloading the page and selecting the CPU/WASM backend (if available).

Recommended approach for robust testing:

1. Try a small model first (1B or smaller) to confirm functionality.
2. If you see shader/GPU errors, use the CPU/WASM fallback to proceed (slower but reliable).

## Troubleshooting

- CORS / SharedArrayBuffer errors: use `http://localhost:8000` and Chrome/Edge; certain optimizations may require specific headers (COOP/COEP) and a secure context.
- "Device was lost" or GPU shader failures: lower model size or force CPU/WASM fallback.
- Model fetch/network failures: check console for failed URL fetches and retry; unstable networks can interrupt model downloads.

## Useful commands

```bash
# Start server
python -m http.server 8000

# OR
npx http-server -c-1 .

# Open http://localhost:8000 in your browser
```

## Recommended manual test flow

1. Start the server.
2. Upload a PDF and watch the processing overlay and status messages.
3. After processing, run a vector search; confirm visible excerpts.
4. Load a model, open chat, ask a question with `Use RAG` enabled; verify the assistant cites sources.

