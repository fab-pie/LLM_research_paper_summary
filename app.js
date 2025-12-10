// Global state
const state = {
    documents: [],
    chunks: [],
    vectorStore: []
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

        console.log(`Processed: ${file.name} (${numPages} pages, ${chunks.length} chunks)`);
        
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

function updateDocumentsDisplay() {
    if (state.documents.length === 0) {
        documentsSection.classList.add('hidden');
        return;
    }

    documentsSection.classList.remove('hidden');
    documentsList.innerHTML = state.documents.map((doc, index) => `
        <div class="bg-gray-800 p-4 rounded-lg">
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="font-semibold text-lg">${doc.filename}</h3>
                    <p class="text-gray-400 text-sm">${doc.numPages} pages</p>
                </div>
                <div class="text-right">
                    <p class="text-blue-400 font-semibold">${state.chunks.filter(c => c.source === doc.filename).length} chunks</p>
                    <p class="text-gray-500 text-xs">${new Date(doc.uploadDate).toLocaleString()}</p>
                </div>
            </div>
        </div>
    `).join('');
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

// Initialize the application
initDragAndDrop();
console.log('PDF Processor initialized');
