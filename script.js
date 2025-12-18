 import { removeBackground, preload } from "@imgly/background-removal";

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const mainCanvas = document.getElementById('main-canvas');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const loadingOverlay = document.getElementById('loading-overlay');
const blurInput = document.getElementById('blur-amount');
const grainInput = document.getElementById('grain-amount');
const downloadBtn = document.getElementById('download-btn');

// State
let originalImage = null; // Image Object
let maskImage = null;     // Image Object (The mask from API)
let ctx = mainCanvas.getContext('2d', { willReadFrequently: true });
let fileName = 'image.png';

// Constants
const MAX_IMAGE_WIDTH = 1920;

 let isProcessing = false;
 let currentFile = null;
 let isPreloaded = false;

// Initial Setup
function init() {
    setupEventListeners();
    preloadAssets();
}

async function preloadAssets() {
    const config = {
        publicPath: window.location.origin + "/",
        model: "isnet_fp16",
        progress: (key, current, total) => {
            console.log(`Downloading ${key}: ${current} of ${total}`);
        }
    };

    // Fire and forget - don't block UI
    preload(config).then(() => {
        isPreloaded = true;
        console.log("Asset preloading succeeded");
    }).catch((error) => {
        console.error("Asset preloading failed:", error);
    });
}

function setupEventListeners() {
    // File Upload
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });

    // Controls
    // Restore real-time input for blur since we are doing client-side rendering with a local mask
    blurInput.addEventListener('input', () => {
        // Trigger generic render
        render();

        // Trigger Background Removal if needed
        // If we haven't processed the background yet, do it now.
        if (parseInt(blurInput.value, 10) > 0 && !maskImage && !isProcessing && currentFile) {
            processBackground(currentFile);
        }
    });

    grainInput.addEventListener('input', render);

    // Download
    downloadBtn.addEventListener('click', downloadImage);
}

async function handleFile(file) {
    if (!file.type.startsWith('image/')) return alert('Please upload an image file');

    currentFile = file;
    fileName = file.name.split('.')[0] + '_edited.png';
    maskImage = null; // Reset mask
    isProcessing = false;

    const img = new Image();
    img.onload = () => {
        originalImage = img;

        // Resize canvas to match image (max width constraint)
        let w = img.width;
        let h = img.height;
        if (w > MAX_IMAGE_WIDTH) {
            h = (MAX_IMAGE_WIDTH / w) * h;
            w = MAX_IMAGE_WIDTH;
        }
        mainCanvas.width = w;
        mainCanvas.height = h;

        // Initial Draw
        ctx.drawImage(originalImage, 0, 0, w, h);

        // Update UI
        mainCanvas.style.display = 'block';
        uploadPlaceholder.style.display = 'none';

        // Enable Controls immediately (Grain works without mask)
        enableControls();

        // Reset Sliders
        blurInput.value = 0;
        grainInput.value = 0;
    };
    img.src = URL.createObjectURL(file);
}

async function processBackground(file) {
    if (isProcessing) return;
    isProcessing = true;
    setLoading(true);

    // Update loading text to indicate first-time download might be slow
    const loadingText = loadingOverlay.querySelector('p');
    const originalText = loadingText.textContent;
    loadingText.textContent = "Loading AI models & processing... (First time may take a moment)";

    try {
        // imgly removeBackground returns a Blob (PNG) of the cutout
        const config = {
            publicPath: window.location.origin + "/",
            model: "isnet_fp16"  // Explicitly specify the model to avoid undefined references
        };
        const blob = await removeBackground(file);

        maskImage = new Image();
        maskImage.onload = () => {
            isProcessing = false;
            setLoading(false);
            loadingText.textContent = originalText; // Reset text
            render();
        };
        maskImage.src = URL.createObjectURL(blob);

    } catch (error) {
        console.error(error);
        alert('Failed to process background. Please try again.');
        isProcessing = false;
        setLoading(false);
        loadingText.textContent = originalText;
    }
}

function resizeImageForUpload(img, maxDimension) {
    // Kept for utility, though imgly handles large images well. 
    // We might not need to resize strictly for imgly, but it speeds up processing.
    // However, imgly takes the blob/file directly. 
    // Let's rely on imgly's internal resizing/handling for now.
    // Use this if we need to optimize later.
    return new Promise((resolve) => {
        let w = img.width;
        let h = img.height;

        if (w > maxDimension || h > maxDimension) {
            if (w > h) {
                h = Math.round((h * maxDimension) / w);
                w = maxDimension;
            } else {
                w = Math.round((w * maxDimension) / h);
                h = maxDimension;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        // Convert to blob (JPEG 80% quality is usually good enough for mask generation)
        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/jpeg', 0.8);
    });
}

// Offscreen canvases for performance/compositing
const offscreenCanvas = document.createElement('canvas');
const offCtx = offscreenCanvas.getContext('2d');

function render() {
    if (!originalImage || !ctx) return;

    const w = mainCanvas.width;
    const h = mainCanvas.height;

    // Clear Main Canvas
    ctx.clearRect(0, 0, w, h);

    const blurAmount = parseInt(blurInput.value, 10);

    // 1. Draw Background (Blurred Original)
    if (maskImage && blurAmount > 0) {
        // Advanced Blur: Pad and Clamp edges to avoid transparency
        const pad = Math.min(blurAmount * 3, 100);

        // Resize offscreen canvas to be padded
        if (offscreenCanvas.width !== w + (pad * 2) || offscreenCanvas.height !== h + (pad * 2)) {
            offscreenCanvas.width = w + (pad * 2);
            offscreenCanvas.height = h + (pad * 2);
        }

        // Draw Image in Center
        offCtx.drawImage(originalImage, pad, pad, w, h);

        // Clamp Edges (Simple stretch for now or mirror. Let's stick to the previous implementation logic)
        // ... (Simpler approach: Draw image, set filter, draw again? No, edge bleeding issues).

        // Simpler approach for now:
        // Draw the image. Blur it. Then draw the Cutout on top.
        // Problem with standard canvas blur is edges fade to transparent. 
        // Fix: Draw the generic image, blur it.

        ctx.save();
        ctx.filter = `blur(${blurAmount}px)`;
        // To avoid white edges, we can draw the image scaled up slightly or just accept it for now.
        // Better: Draw the image 9 tiles to fill edges?
        // Let's stick to simple blur for immediate feedback, user wants it working first.

        // Draw slightly larger to cover edges?
        const s = blurAmount * 2;
        ctx.drawImage(originalImage, -s, -s, w + (2 * s), h + (2 * s));
        ctx.restore();

    } else {
        ctx.drawImage(originalImage, 0, 0, w, h);
    }

    // 2. Draw Foreground (The Cutout)
    if (maskImage) {
        ctx.drawImage(maskImage, 0, 0, w, h);
    }

    // 3. Draw Grain
    const grainAmount = grainInput.value;
    if (grainAmount > 0) {
        generateGrain(ctx, w, h, grainAmount);
    }
}

function generateGrain(targetCtx, w, h, intensity) {
    // Optimization: Create a smaller grain pattern and tile it? 
    // For now, simple per-pixel noise for quality.

    const imgData = targetCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const strength = intensity * 2.55; // mapping 0-100 to 0-255 range approx

    // Very basic monochrome noise
    for (let i = 0; i < data.length; i += 4) {
        // Random value between -strength/2 and +strength/2
        const noise = (Math.random() - 0.5) * strength;

        // Add noise to RGB
        data[i] = data[i] + noise;
        data[i + 1] = data[i + 1] + noise;
        data[i + 2] = data[i + 2] + noise;
        // Alpha (data[i+3]) remains unchanged
    }

    targetCtx.putImageData(imgData, 0, 0);
}

function downloadImage() {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = mainCanvas.toDataURL('image/png');
    link.click();
}

function setLoading(isLoading) {
    loadingOverlay.hidden = !isLoading;
    blurInput.disabled = isLoading;
    // grainInput.disabled = isLoading; // Grain can actually work while BG is processing, but simpler to lock all for now.
    // Actually, user might want to adjust grain while waiting? Let's keep it locked to avoid race conditions in render.
    grainInput.disabled = isLoading;
    downloadBtn.disabled = isLoading;
}

function enableControls() {
    blurInput.disabled = false;
    grainInput.disabled = false;
    downloadBtn.disabled = false;
}

init();
