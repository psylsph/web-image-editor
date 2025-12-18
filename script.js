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

// Initial Setup
function init() {
    setupEventListeners();
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
    blurInput.addEventListener('input', () => {
        // Trigger generic render
        render();

        // Trigger Background Removal if needed
        if (parseInt(blurInput.value, 10) > 0 && !maskImage && !isProcessing && currentFile) {
            removeBackground(currentFile);
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

async function removeBackground(file) {
    if (isProcessing) return;
    isProcessing = true;
    setLoading(true);
    try {
        const formData = new FormData();
        formData.append('image', file);
        // We request the FULL image with background removed (cutout), not just the mask.
        // This makes compositing much easier: Layer 1 = Blurred Original, Layer 2 = Transparent Cutout.
        formData.append('mask', 'false');

        const response = await fetch('/.netlify/functions/remove-bg', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('API Error');

        const blob = await response.blob();
        maskImage = new Image(); // Keeping variable name 'maskImage' but it now holds the cutout
        maskImage.onload = () => {
            isProcessing = false;
            setLoading(false);
            // Controls are already enabled, just re-render to apply the waiting blur
            render();
        };
        maskImage.src = URL.createObjectURL(blob);

    } catch (error) {
        console.error(error);
        alert('Failed to process background. Check API key or connection.');
        isProcessing = false;
        setLoading(false);
    }
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
        // We cannot use simple ctx.filter = blur because of edge transparency.
        // We cannot use Zoom because user dislikes scaling.
        // Solution: Draw to a larger padded canvas, clamping edges, blur THAT, then draw inner region.

        const pad = Math.min(blurAmount * 3, 100); // 3x sigma usually enough, cap at 100px for perf

        // Resize offscreen canvas to be padded
        offscreenCanvas.width = w + (pad * 2);
        offscreenCanvas.height = h + (pad * 2);
        const ow = offscreenCanvas.width;
        const oh = offscreenCanvas.height;

        // Draw Image in Center
        offCtx.drawImage(originalImage, pad, pad, w, h);

        // Clamp Edges (Stretch 1px edge to fill padding)
        // Top
        offCtx.drawImage(originalImage, 0, 0, w, 1, pad, 0, w, pad);
        // Bottom
        offCtx.drawImage(originalImage, 0, h - 1, w, 1, pad, h + pad, w, pad);
        // Left
        offCtx.drawImage(originalImage, 0, 0, 1, h, 0, pad, pad, h);
        // Right
        offCtx.drawImage(originalImage, w - 1, 0, 1, h, w + pad, pad, pad, h);
        // Corners
        offCtx.drawImage(originalImage, 0, 0, 1, 1, 0, 0, pad, pad); // TL
        offCtx.drawImage(originalImage, w - 1, 0, 1, 1, w + pad, 0, pad, pad); // TR
        offCtx.drawImage(originalImage, 0, h - 1, 1, 1, 0, h + pad, pad, pad); // BL
        offCtx.drawImage(originalImage, w - 1, h - 1, 1, 1, w + pad, h + pad, pad, pad); // BR

        // Apply Blur to Padded Canvas
        // Note: We need to apply the filter and re-draw the canvas onto itself? 
        // Or just set the filter and draw it onto Main Canvas?
        // If we draw offscreen->main with filter, the filter samples outside the source rect?
        // No, canvas compositing with filter applies filter to the source image before drawing.
        // If we draw the full padded image, the blur at center will sample the padded opaque edges.

        ctx.filter = `blur(${blurAmount}px)`;
        // Draw the center portion of the padded canvas back to main canvas
        // Source: (pad, pad, w, h) -> Dest: (0, 0, w, h)
        // WAIT: ctx.filter applies to the drawing operation. If we draw a cropped region, does it blur outside the crop?
        // No, it blurs the pixels provided in the drawImage call.
        // So we must draw the WHOLE padded texture, but clipped to viewport?
        // Or simpler: We just draw the padded canvas with an offset.

        ctx.drawImage(offscreenCanvas, -pad, -pad);
        ctx.filter = 'none'; // Reset

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
