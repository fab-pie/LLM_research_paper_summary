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
    selectedModel: null
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

// LLM DOM elements
const modelSelect = document.getElementById('modelSelect');
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

    for (const file of pdfFiles) {
        await processPDF(file);
    }

    showStatus(`Successfully processed ${pdfFiles.length} PDF file(s)!`, 'success');
    updateDocumentsDisplay();
    updateChunksDisplay();
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
        }

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
            await loadEmbeddingModel();
        }

        // Generate embeddings for each chunk and store in vectorStore
        showStatus(`Generating embeddings for ${chunks.length} chunks...`, 'info');
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            try {
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
                
                // Update progress every 5 chunks
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
        success: 'text-green-400',
        error: 'text-red-400'
    };
    
    statusContent.innerHTML = `<span class="${colors[type]}">${message}</span>`;
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

// Load the embedding model
async function loadEmbeddingModel() {
    if (state.isModelLoading || state.isModelReady) {
        return state.embeddingModel;
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
                    <p class="text-gray-200 text-sm leading-relaxed">${result.text}</p>
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
                    <p class="text-green-400 font-semibold">${state.vectorStore.filter(v => v.source === doc.filename).length} vectors</p>
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
    const selectedModelId = modelSelect.value;
    
    if (!selectedModelId) {
        alert('Please select a model first');
        return;
    }
    
    // Reset state if reloading
    if (state.llmEngine) {
        try {
            // Clean up old engine
            state.llmEngine = null;
            state.llmReady = false;
        } catch (e) {
            console.warn('Error cleaning up old engine:', e);
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
        modelName.textContent = modelSelect.options[modelSelect.selectedIndex].text;
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
        ? 'bg-blue-600 text-white' 
        : role === 'system'
        ? 'bg-gray-700 text-gray-300'
        : 'bg-gray-700 text-white';
    
    let sourcesHtml = '';
    if (sources.length > 0) {
        sourcesHtml = `
            <div class="mt-2 pt-2 border-t border-gray-600 text-xs">
                <p class="font-semibold mb-1">Sources used:</p>
                ${sources.map(s => `<p class="text-gray-400">• ${s.source} (chunk #${s.index}, ${(s.similarity * 100).toFixed(1)}% match)</p>`).join('')}
            </div>
        `;
    }
    
    messageDiv.innerHTML = `
        <div class="${bubbleClass} rounded-lg px-4 py-3 max-w-[80%]">
            <div class="text-sm whitespace-pre-wrap">${content}</div>
            ${sourcesHtml}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
    
    try {
        let contextChunks = [];
        let systemPrompt = `You are an expert academic researcher and literature reviewer. You help users understand and synthesize research papers.`;
        
        // Use RAG if enabled and documents are available
        if (useRAG.checked && state.vectorStore.length > 0) {
            sendButton.textContent = 'Searching docs...';
            
            try {
                // Search for relevant chunks
                contextChunks = await searchVectorStore(message, 5);
                
                if (contextChunks.length > 0) {
                    const contextText = contextChunks
                        .map((c, i) => `[Document ${i + 1}: ${c.source}]\n${c.text}`)
                        .join('\n\n---\n\n');
                    
                    systemPrompt += `\n\nYou have access to the following relevant excerpts from uploaded research papers:\n\n${contextText}\n\nUse these excerpts to answer the user's question. Reference specific documents when relevant.`;
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
        
        // Verify engine one more time before calling
        if (!state.llmEngine || !state.llmEngine.chat) {
            throw new Error('LLM engine is not properly initialized. Please reload the model.');
        }
        
        // Generate response
        const response = await state.llmEngine.chat.completions.create({
            messages: messages,
            temperature: 0.7,
            max_tokens: 512
        });
        
        if (!response || !response.choices || !response.choices[0]) {
            throw new Error('Invalid response from LLM');
        }
        
        const assistantMessage = response.choices[0].message.content;
        
        // Add assistant response to UI with sources
        addMessage('assistant', assistantMessage, contextChunks);
        
        // Add to chat history
        state.chatHistory.push({ role: 'assistant', content: assistantMessage });
        
        console.log('Response generated successfully');
        
    } catch (error) {
        console.error('Error generating response:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
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
