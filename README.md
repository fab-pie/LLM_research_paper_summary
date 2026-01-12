# LLM_research_paper_summary
![alt text](base _pages.png)
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

![alt text](loading.png)

- Text extraction: pages should be read and concatenated (visible in logs or chunks display).
- Chunking: text must be split into chunks (check the "Text Chunks" debug view).

![alt text](chunks.png)

- Embeddings: embeddings must be generated for chunks (or the app must clearly fall back if embedding model fails).
- Vector search: using the search box returns relevant chunks/excerpts.
- Chat (RAG): with `Use RAG` enabled, asking a question should produce a natural, conversational answer using information from the documents.

Expected behavior: the app displays clear status messages (extraction, embedding generation, ready), shows processed documents, and the assistant provides conversational answers without formal structure or source citations.

## GPU / WebLLM notes & fallback

- The app uses **Llama 3.2 1B** as the fixed LLM model (600MB, optimized for speed).
- WebGPU yields the best performance but may fail on devices with limited GPU memory ("Device was lost").
- If the model fails to initialize on GPU, the app may fall back to WASM/CPU. If you see GPU/device errors, try:
	- Closing other GPU-intensive applications (browser tabs, GPU apps).
	- Reloading the page and trying again.

The Llama 3.2 1B model is small enough to run on most modern devices with WebGPU support.

## Troubleshooting

- CORS / SharedArrayBuffer errors: use `http://localhost:8000` and Chrome/Edge; certain optimizations may require specific headers (COOP/COEP) and a secure context.
- "Device was lost" or GPU shader failures: close other GPU-intensive apps and reload the page.
- Model fetch/network failures: check console for failed URL fetches and retry; unstable networks can interrupt model downloads (Llama 3.2 1B is ~600MB).

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
4. Click "Load Model" to load Llama 3.2 1B, open chat, ask a question with `Use RAG` enabled; verify the assistant provides natural, conversational answers based on the documents.

