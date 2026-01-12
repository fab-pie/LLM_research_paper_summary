// Global state
const state = {
    documents: [],
    chunks: [],
    vectorStore: [],
    embeddingModel: null,  // Will store the Transformers.js pipeline
    isModelLoading: false,
    isModelReady: false,
    // LLM state
    llmEngine: null,
    llmLoading: false,
    llmReady: false,
    chatHistory: [],
    selectedModel: null,
    // Temperature for LLM responses (0.0 = deterministic, 1.0 = creative)
    temperature: 0.2
};

// DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const statusDiv = document.getElementById('status');
const statusContent = document.getElementById('statusContent');
const documentsSection = document.getElementById('documentsSection');
const documentsList = document.getElementById('documentsList');
const chunksSection = document.getElementById('chunksSection');
const chunksList = document.getElementById('chunksList');
const searchSection = document.getElementById('searchSection');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const searchResults = document.getElementById('searchResults');

// PDF loading overlay elements
const pdfLoadingOverlay = document.getElementById('pdfLoadingOverlay');
const pdfLoadingText = document.getElementById('pdfLoadingText');
const pdfLoadingSub = document.getElementById('pdfLoadingSub');
const pdfLoadingBar = document.getElementById('pdfLoadingBar');
const pdfLoadingPercent = document.getElementById('pdfLoadingPercent');

// LLM DOM elements
// modelSelect removed - using fixed model now
const loadModelButton = document.getElementById('loadModelButton');
const loadingProgress = document.getElementById('loadingProgress');
const loadingText = document.getElementById('loadingText');
const loadingPercent = document.getElementById('loadingPercent');
const progressBar = document.getElementById('progressBar');
const modelInfo = document.getElementById('modelInfo');
const modelName = document.getElementById('modelName');
const chatSection = document.getElementById('chatSection');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const useRAG = document.getElementById('useRAG');
// Temperature controls (slider in DOM)
const tempSlider = document.getElementById('tempSlider');
const tempValue = document.getElementById('tempValue');

// Initialize temperature UI if present
if (tempSlider && tempValue) {
    tempValue.textContent = state.temperature.toFixed(2);
    tempSlider.value = state.temperature;
    tempSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        state.temperature = v;
        tempValue.textContent = v.toFixed(2);
    });
}

// Initialize drag and drop
function initDragAndDrop() {
    // Click to browse
    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
            fileInput.click();
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('border-blue-500', 'bg-gray-800');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('border-blue-500', 'bg-gray-800');
        }, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Handle file uploads
async function handleFiles(files) {
    const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
        showStatus('Please upload PDF files only.', 'error');
        return;
    }

    showStatus(`Processing ${pdfFiles.length} PDF file(s)...`, 'info');
    try {
        showPdfLoading(pdfFiles.length);

        for (let i = 0; i < pdfFiles.length; i++) {
            const file = pdfFiles[i];
            updatePdfLoadingFile(i + 1, pdfFiles.length, file.name);
            await processPDF(file);
        }

        showStatus(`Successfully processed ${pdfFiles.length} PDF file(s)!`, 'success');
    } finally {
        hidePdfLoading();
        updateDocumentsDisplay();
        updateChunksDisplay();
    }
}

// Extract text from PDF using pdf.js
async function processPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        const numPages = pdf.numPages;

        // Extract text from all pages
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';

            // Update loading overlay for extraction progress (0-40%)
            const extractPercent = Math.round((pageNum / numPages) * 40);
            updatePdfLoadingProgress(extractPercent, `Extracting page ${pageNum}/${numPages}`);
        }

        // Mark extraction complete on overlay
        updatePdfLoadingProgress(40, 'Extraction complete');

        // Small delay to let the UI update visibly before loading model
        await new Promise(resolve => setTimeout(resolve, 150));

        // Store document
        const document = {
            filename: file.name,
            text: fullText,
            numPages: numPages,
            uploadDate: new Date().toISOString()
        };

        state.documents.push(document);

        // Chunk the text
        const chunks = chunkText(fullText, file.name);
        state.chunks.push(...chunks);

        // Load embedding model if not already loaded
        if (!state.isModelReady) {
            // Indicate model-loading step clearly so user doesn't think progress is stuck
            updatePdfLoadingProgress(45, 'Loading embedding model...');
            await loadEmbeddingModel();
            // Slight progress bump after model is ready
            updatePdfLoadingProgress(48, 'Embedding model ready');
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Generate embeddings for each chunk and store in vectorStore
        showStatus(`Generating embeddings for ${chunks.length} chunks...`, 'info');
        
        // Notify start of embedding generation
        updatePdfLoadingProgress(null, 'Generating embeddings...');

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            try {
                // Update overlay to indicate which chunk is about to be processed
                updatePdfLoadingProgress(null, `Generating embedding ${i + 1}/${chunks.length}`);
                // allow DOM to repaint so the message is visible before heavy work
                await new Promise(resolve => requestAnimationFrame(resolve));

                // Generate embedding for this chunk
                const embedding = await generateEmbedding(chunk.text);
                
                // Store in vector store
                state.vectorStore.push({
                    text: chunk.text,
                    embedding: embedding,
                    source: chunk.source,
                    index: chunk.index,
                    startPos: chunk.startPos,
                    endPos: chunk.endPos
                });
                
                // Update status every 5 chunks
                if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
                    showStatus(`Generated embeddings: ${i + 1}/${chunks.length}`, 'info');
                }
                
            } catch (error) {
                console.error(`Error generating embedding for chunk ${i}:`, error);
            }
        }

        console.log(`Processed: ${file.name} (${numPages} pages, ${chunks.length} chunks, ${state.vectorStore.length} vectors)`);
        
    } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        showStatus(`Error processing ${file.name}: ${error.message}`, 'error');
    }
}

// Chunk text with sliding window
function chunkText(text, source, chunkSize = 500, overlap = 100) {
    const chunks = [];
    const step = chunkSize - overlap;
    
    // Clean up text
    text = text.replace(/\s+/g, ' ').trim();
    
    for (let i = 0; i < text.length; i += step) {
        const chunk = text.slice(i, i + chunkSize);
        
        if (chunk.length > 0) {
            chunks.push({
                text: chunk,
                source: source,
                index: chunks.length,
                startPos: i,
                endPos: i + chunk.length
            });
        }
        
        // Stop if we've reached the end
        if (i + chunkSize >= text.length) {
            break;
        }
    }
    
    return chunks;
}

// UI update functions
function showStatus(message, type = 'info') {
    statusDiv.classList.remove('hidden');
    
    const colors = {
        info: 'text-blue-400',
        success: 'text-black font-bold',
        error: 'text-red-400'
    };
    
    statusContent.innerHTML = `<span class="${colors[type]}">${message}</span>`;
}

// PDF loading overlay helpers
function showPdfLoading(totalFiles) {
    if (!pdfLoadingOverlay) return;
    pdfLoadingOverlay.classList.remove('hidden');
    pdfLoadingText.textContent = `Processing ${totalFiles} PDF file(s)...`;
    pdfLoadingSub.textContent = 'Starting...';
    // Use indeterminate spinner: hide progress bar and percent
    const barContainer = pdfLoadingBar ? pdfLoadingBar.parentElement : null;
    if (barContainer) barContainer.style.display = 'none';
    if (pdfLoadingPercent) pdfLoadingPercent.style.display = 'none';
}

function updatePdfLoadingFile(fileIndex, totalFiles, filename) {
    if (!pdfLoadingOverlay) return;
    pdfLoadingText.textContent = `Processing file ${fileIndex}/${totalFiles}: ${filename}`;
    pdfLoadingSub.textContent = 'Preparing...';
    // keep spinner; hide progress visuals
    const barContainer = pdfLoadingBar ? pdfLoadingBar.parentElement : null;
    if (barContainer) barContainer.style.display = 'none';
    if (pdfLoadingPercent) pdfLoadingPercent.style.display = 'none';
}

function updatePdfLoadingProgress(percent, subtext = '') {
    if (!pdfLoadingOverlay) return;
    // For indeterminate loading use only subtext (spinner shown). Ignore numeric percent to avoid misleading display.
    if (subtext) pdfLoadingSub.textContent = subtext;
}

function hidePdfLoading() {
    if (!pdfLoadingOverlay) return;
    pdfLoadingOverlay.classList.add('hidden');
    // restore progress visuals state
    const barContainer = pdfLoadingBar ? pdfLoadingBar.parentElement : null;
    if (barContainer) barContainer.style.display = '';
    if (pdfLoadingPercent) pdfLoadingPercent.style.display = '';
    if (pdfLoadingBar) pdfLoadingBar.style.width = '0%';
}

function updateChunksDisplay() {
    if (state.chunks.length === 0) {
        chunksSection.classList.add('hidden');
        return;
    }

    chunksSection.classList.remove('hidden');
    chunksList.innerHTML = `
        <p class="text-gray-400 mb-4">Total chunks: ${state.chunks.length}</p>
        <div class="space-y-2">
            ${state.chunks.slice(0, 10).map((chunk, index) => `
                <div class="bg-gray-700 p-3 rounded">
                    <div class="flex justify-between mb-2">
                        <span class="text-xs text-gray-400">Chunk ${chunk.index} - ${chunk.source}</span>
                        <span class="text-xs text-gray-500">${chunk.text.length} chars</span>
                    </div>
                    <p class="text-sm text-gray-300">${chunk.text.substring(0, 150)}${chunk.text.length > 150 ? '...' : ''}</p>
                </div>
            `).join('')}
            ${state.chunks.length > 10 ? `<p class="text-gray-500 text-center">... and ${state.chunks.length - 10} more chunks</p>` : ''}
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMBEDDINGS & VECTOR STORE (Section 1.2)
// ═══════════════════════════════════════════════════════════════════════════════

// Load the embedding model (optionally force reload)
async function loadEmbeddingModel(force = false) {
    if (state.isModelLoading) return state.embeddingModel;

    if (state.isModelReady && !force) {
        return state.embeddingModel;
    }

    // If forcing, clear previous model reference
    if (force) {
        state.embeddingModel = null;
        state.isModelReady = false;
    }

    state.isModelLoading = true;
    showStatus('Loading embedding model (Xenova/all-MiniLM-L6-v2)...', 'info');

    try {
        // Initialize the feature extraction pipeline
        state.embeddingModel = await window.transformersPipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2'
        );

        state.isModelReady = true;
        state.isModelLoading = false;

        showStatus('Embedding model loaded successfully!', 'success');
        console.log('Embedding model ready');

        return state.embeddingModel;

    } catch (error) {
        state.isModelLoading = false;
        console.error('Error loading embedding model:', error);
        showStatus(`Error loading model: ${error.message}`, 'error');
        throw error;
    }
}

// Generate embedding for a single text
async function generateEmbedding(text) {
    if (!state.embeddingModel) {
        await loadEmbeddingModel();
    }
    
    try {
        // Generate embedding
        const output = await state.embeddingModel(text, {
            pooling: 'mean',
            normalize: true
        });
        
        // Convert to regular array
        return Array.from(output.data);
        
    } catch (error) {
        console.error('Error generating embedding:', error);

        // If tokenizer/native object was deleted or similar, try reloading the embedding model once
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('tokenizer') || msg.includes('deleted object') || msg.includes('cannot pass deleted')) {
            console.warn('Embedding model appears corrupted. Reloading model and retrying once...');
            try {
                await loadEmbeddingModel(true);
                const retryOut = await state.embeddingModel(text, { pooling: 'mean', normalize: true });
                return Array.from(retryOut.data);
            } catch (retryErr) {
                console.error('Retry failed:', retryErr);
                throw retryErr;
            }
        }

        throw error;
    }
}

// Cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
    /*
    Formula: similarity = (A · B) / (||A|| × ||B||)
    
    Where:
    - A · B is the dot product (sum of A[i] * B[i])
    - ||A|| is the magnitude of vector A (square root of sum of A[i]²)
    - ||B|| is the magnitude of vector B
    */
    
    if (vecA.length !== vecB.length) {
        throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magnitudeA += vecA[i] * vecA[i];
        magnitudeB += vecB[i] * vecB[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }
    
    return dotProduct / (magnitudeA * magnitudeB);
}

// Search for most relevant chunks
async function searchVectorStore(query, topK = 5) {
    if (state.vectorStore.length === 0) {
        console.warn('Vector store is empty');
        return [];
    }
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    // Calculate similarity for each chunk
    const results = state.vectorStore.map(item => ({
        ...item,
        similarity: cosineSimilarity(queryEmbedding, item.embedding)
    }));
    
    // Sort by similarity (highest first) and return top K
    return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
}

// Handle search button click
function initSearch() {
    searchButton.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        
        if (!query) {
            searchResults.innerHTML = '<p class="text-red-400">Please enter a search query</p>';
            return;
        }
        
        if (state.vectorStore.length === 0) {
            searchResults.innerHTML = '<p class="text-red-400">No documents loaded. Please upload PDFs first.</p>';
            return;
        }
        
        searchButton.disabled = true;
        searchButton.textContent = 'Searching...';
        
        try {
            const results = await searchVectorStore(query, 5);
            displaySearchResults(results, query);
        } catch (error) {
            searchResults.innerHTML = `<p class="text-red-400">Error: ${error.message}</p>`;
        } finally {
            searchButton.disabled = false;
            searchButton.textContent = 'Search';
        }
    });
    
    // Allow Enter key to search
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchButton.click();
        }
    });
}

// Display search results
function displaySearchResults(results, query) {
    if (results.length === 0) {
        searchResults.innerHTML = '<p class="text-gray-400">No results found</p>';
        return;
    }
    
    searchResults.innerHTML = `
        <h3 class="text-lg font-semibold mb-4 text-green-400">Found ${results.length} relevant chunks:</h3>
        <div class="space-y-4">
            ${results.map((result, index) => `
                <div class="bg-gray-700 p-4 rounded-lg">
                    <div class="flex justify-between items-start mb-2">
                        <div>
                            <span class="text-blue-400 font-semibold">Rank ${index + 1}</span>
                            <span class="text-gray-400 text-sm ml-2">• ${result.source}</span>
                        </div>
                        <span class="text-green-400 font-mono text-sm">
                            ${(result.similarity * 100).toFixed(1)}% match
                        </span>
                    </div>
                    <p class="text-black text-sm leading-relaxed">${result.text}</p>
                    <div class="mt-2 text-xs text-gray-500">
                        Chunk #${result.index} (pos: ${result.startPos}-${result.endPos})
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Update documents display to show search section
function updateDocumentsDisplay() {
    if (state.documents.length === 0) {
        documentsSection.classList.add('hidden');
        searchSection.classList.add('hidden');
        return;
    }

    documentsSection.classList.remove('hidden');
    
    // Show search section when vectors are ready
    if (state.vectorStore.length > 0) {
        searchSection.classList.remove('hidden');
    }
    
    documentsList.innerHTML = state.documents.map((doc, index) => `
        <div class="bg-gray-800 p-4 rounded-lg">
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="font-semibold text-lg">${doc.filename}</h3>
                    <p class="text-gray-400 text-sm">${doc.numPages} pages</p>
                </div>
                <div class="text-right">
                    <p class="text-blue-400 font-semibold">${state.chunks.filter(c => c.source === doc.filename).length} chunks</p>
                    <p class="text-black font-bold">${state.vectorStore.filter(v => v.source === doc.filename).length} vectors</p>
                    <p class="text-gray-500 text-xs">${new Date(doc.uploadDate).toLocaleString()}</p>
                </div>
            </div>
        </div>
    `).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBLLM INTEGRATION (Section 2.1)
// ═══════════════════════════════════════════════════════════════════════════════

// Load LLM model
async function loadLLMModel() {
    // Fixed model - Llama 3.2 1B
    const selectedModelId = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
    
    // Reset state if reloading
    if (state.llmEngine) {
        try {
            console.log('Cleaning up existing engine...');
            // Properly unload the engine if method exists
            if (typeof state.llmEngine.unload === 'function') {
                await state.llmEngine.unload();
            }
            state.llmEngine = null;
            state.llmReady = false;
            // Give time for WebAssembly cleanup
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            console.warn('Error cleaning up old engine:', e);
            state.llmEngine = null;
            state.llmReady = false;
        }
    }
    
    state.selectedModel = selectedModelId;
    state.llmLoading = true;
    state.llmReady = false;
    
    loadModelButton.disabled = true;
    loadModelButton.textContent = 'Loading...';
    loadingProgress.classList.remove('hidden');
    modelInfo.classList.add('hidden');
    progressBar.style.width = '0%';
    loadingPercent.textContent = '0%';
    
    try {
        console.log('Starting to load model:', selectedModelId);
        
        // Create the engine with progress callback
        state.llmEngine = await window.CreateMLCEngine(
            selectedModelId,
            {
                initProgressCallback: (progress) => {
                    // Update progress bar
                    const percent = Math.round(progress.progress * 100);
                    progressBar.style.width = `${percent}%`;
                    loadingPercent.textContent = `${percent}%`;
                    loadingText.textContent = progress.text || 'Loading...';
                    console.log(`Loading progress: ${percent}% - ${progress.text}`);
                }
            }
        );
        
        console.log('Engine created, verifying...');
        
        // Verify engine is ready by testing it
        if (!state.llmEngine) {
            throw new Error('Engine creation failed - engine is null');
        }
        
        state.llmReady = true;
        state.llmLoading = false;
        
        // Show success message
        loadingProgress.classList.add('hidden');
        modelInfo.classList.remove('hidden');
        modelName.textContent = 'Llama 3.2 1B';
        loadModelButton.textContent = 'Model Loaded';
        
        // Show chat interface
        chatSection.classList.remove('hidden');
        
        // Add system message to chat
        addMessage('system', 'Model loaded! You can now ask questions about your uploaded documents.');
        
        console.log('LLM Engine loaded successfully:', selectedModelId);
        
    } catch (error) {
        console.error('Error loading LLM:', error);
        console.error('Error stack:', error.stack);
        
        alert(`Failed to load model: ${error.message}\n\nPlease try:\n1. Using a different browser (Chrome/Edge 113+)\n2. Checking your internet connection\n3. Refreshing the page and trying again`);
        
        state.llmEngine = null;
        state.llmReady = false;
        state.llmLoading = false;
        loadModelButton.disabled = false;
        loadModelButton.textContent = 'Load Model';
        loadingProgress.classList.add('hidden');
    }
}

// Add message to chat
function addMessage(role, content, sources = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    
    const bubbleClass = role === 'user' 
        ? 'bg-gray-200 text-black' 
        : role === 'system'
        ? 'bg-gray-700 text-gray-300'
        : 'bg-gray-700 text-white';
    
    messageDiv.innerHTML = `
        <div class="${bubbleClass} rounded-lg px-4 py-3 max-w-[80%]">
            <div class="text-sm whitespace-pre-wrap">${content}</div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add a typing indicator element for assistant responses. Returns the DOM element so it can be removed later.
function addTypingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex justify-start';

    messageDiv.innerHTML = `
        <div class="bg-gray-700 text-white rounded-lg px-4 py-3 max-w-[80%]">
            <div class="typing-dots">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
            </div>
        </div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageDiv;
}

function removeTypingIndicator(el) {
    try {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (e) {
        // ignore
    }
}

// Send message
async function sendMessage() {
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    // Strict verification that model is loaded
    if (!state.llmReady || !state.llmEngine) {
        alert('Please load a model first. Click "Load Model" button above.');
        return;
    }
    
    // Add user message to UI
    addMessage('user', message);
    chatInput.value = '';
    
    // Add to chat history
    state.chatHistory.push({ role: 'user', content: message });
    
    // Disable input while processing
    sendButton.disabled = true;
    chatInput.disabled = true;
    sendButton.textContent = 'Thinking...';
    // Show typing indicator for assistant
    let typingEl = null;
    try {
        typingEl = addTypingIndicator();
    } catch (e) {
        console.warn('Could not show typing indicator', e);
    }
    
    try {
        let contextChunks = [];
        let systemPrompt = `You are a knowledgeable research colleague helping another researcher. Be conversational and direct - skip formal structures like "Summary", "Key Points", "Conclusions". Just explain things naturally as you would to a colleague over coffee.

Focus on what's actually useful: the core concepts, important findings, and how things work. Don't list source chunks or match percentages - the researcher doesn't care about retrieval mechanics, they care about the content.

When explaining technical concepts, be thorough but natural. Use examples when helpful. If something is important, emphasize it naturally in your explanation rather than creating bullet points.`;
        
        // Use RAG if enabled and documents are available
        if (useRAG.checked && state.vectorStore.length > 0) {
            sendButton.textContent = 'Searching docs...';
            
            try {
                // Search for relevant chunks
                contextChunks = await searchVectorStore(message, 5);
                
                if (contextChunks.length > 0) {
                    const contextText = contextChunks
                        .map((c, i) => `Excerpt ${i + 1} from ${c.source}:\n${c.text}`)
                        .join('\n\n---\n\n');
                    
                    systemPrompt += `\n\nHere are relevant excerpts from the research papers:\n\n${contextText}\n\nAnswer based on these excerpts, but don't mention chunk numbers or match percentages. Just naturally weave the information into your explanation.`;
                }
            } catch (searchError) {
                console.error('Error during RAG search:', searchError);
                // Continue without RAG if search fails
            }
        }
        
        sendButton.textContent = 'Generating...';
        
        // Create messages for the LLM
        const messages = [
            { role: 'system', content: systemPrompt },
            ...state.chatHistory.slice(-10) // Keep last 10 messages for context
        ];
        
        console.log('Sending request to LLM...');
        console.log('Using temperature:', state.temperature);
        
        // Verify engine is ready before calling
        if (!state.llmEngine || !state.llmEngine.chat) {
            throw new Error('LLM engine is not properly initialized. Please reload the model.');
        }
        
        // Do NOT call reload() here - it can corrupt the tokenizer state
        // The engine is already loaded and ready from loadLLMModel()

        // Generate response
        const requestParams = {
            messages: messages,
            temperature: state.temperature,    // Use dynamic temperature from UI
            max_tokens: 512
        };
        
        console.log('LLM Request params:', { temperature: requestParams.temperature, max_tokens: requestParams.max_tokens, messageCount: messages.length });
        
        const response = await state.llmEngine.chat.completions.create(requestParams);
        
        if (!response || !response.choices || !response.choices[0]) {
            throw new Error('Invalid response from LLM');
        }
        
        const assistantMessage = response.choices[0].message.content;

        // Remove typing indicator and replace with assistant response
        removeTypingIndicator(typingEl);
        addMessage('assistant', assistantMessage, contextChunks);
        
        // Show temperature used (for debugging/transparency)
        console.log('Response generated with temperature:', state.temperature);
        
        // Add to chat history
        state.chatHistory.push({ role: 'assistant', content: assistantMessage });
        
        console.log('Response generated successfully');
        
    } catch (error) {
        console.error('Error generating response:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        // Remove typing indicator if present and show error
        removeTypingIndicator(typingEl);
        addMessage('system', `Error: ${error.message}`);
    } finally {
        sendButton.disabled = false;
        chatInput.disabled = false;
        sendButton.textContent = 'Send';
        chatInput.focus();
    }
}

// Initialize LLM controls
function initLLM() {
    loadModelButton.addEventListener('click', loadLLMModel);
    
    sendButton.addEventListener('click', sendMessage);
    
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// Initialize the application
initDragAndDrop();
initSearch();
initLLM();
console.log('PDF Processor initialized');
