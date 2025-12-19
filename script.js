// BodyPix loaded via CDN in index.html

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
let bodyPixNet = null; // BodyPix model instance

// Initial Setup
function init() {
    setupEventListeners();
    // Preload BodyPix model in background
    loadBodyPix();
}

async function loadBodyPix() {
    if (bodyPixNet) return bodyPixNet;

    try {
        console.log('Loading BodyPix model...');
        bodyPixNet = await bodyPix.load();
        console.log('BodyPix model loaded successfully');
        return bodyPixNet;
    } catch (error) {
        console.error('Failed to load BodyPix:', error);
        throw error;
    }
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
        if (parseInt(blurInput.value, 10) > 0 && !maskImage && !isProcessing && originalImage) {
            processBackground();
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

async function processBackground() {
    if (isProcessing) return;
    isProcessing = true;
    setLoading(true);

    const loadingText = loadingOverlay.querySelector('p');
    const originalText = loadingText.textContent;
    loadingText.textContent = "Removing background...";

    try {
        // Load BodyPix model
        const net = await loadBodyPix();

        // Segment person from the image
        const segmentation = await net.segmentPerson(originalImage, {
            flipHorizontal: false,
            internalResolution: 'medium',
            segmentationThreshold: 0.7
        });

        // Check if any person was detected
        const personDetected = segmentation.data.some(val => val > 0);

        // Create mask canvas
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = mainCanvas.width;
        maskCanvas.height = mainCanvas.height;
        const maskCtx = maskCanvas.getContext('2d');

        // Draw the person mask (INVERTED - we want background, not person)
        // backgroundBlurAmount > 0 blurs background, 0 blurs person
        const mask = bodyPix.toMask(segmentation, { r: 0, g: 0, b: 0, a: 255 }, { r: 0, g: 0, b: 0, a: 0 });
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = originalImage.width;
        tempCanvas.height = originalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(mask, 0, 0);

        // Composite: draw original image, then apply mask to show only person (cut out person)
        maskCtx.drawImage(originalImage, 0, 0, mainCanvas.width, mainCanvas.height);
        maskCtx.globalCompositeOperation = 'destination-in';
        maskCtx.drawImage(tempCanvas, 0, 0, mainCanvas.width, mainCanvas.height);
        maskCtx.globalCompositeOperation = 'source-over';

        // Convert mask canvas to image for reuse in render()
        maskImage = new Image();
        maskImage.onload = () => {
            isProcessing = false;
            setLoading(false);
            loadingText.textContent = originalText;

            if (!personDetected) {
                alert('No person detected in the image. The background blur may not work as expected. Try an image with a person in it.');
            }

            render();
        };
        maskImage.src = maskCanvas.toDataURL();

    } catch (error) {
        console.error('Background removal failed:', error);
        alert('Failed to process background. Please try again.');
        isProcessing = false;
        setLoading(false);
        loadingText.textContent = originalText;
    }
}



function render() {
    if (!originalImage || !ctx) return;

    const w = mainCanvas.width;
    const h = mainCanvas.height;

    // Clear Main Canvas
    ctx.clearRect(0, 0, w, h);

    const blurAmount = parseInt(blurInput.value, 10);

    if (maskImage && blurAmount > 0) {
        // Step 1: Draw blurred original (entire image)
        ctx.save();
        ctx.filter = `blur(${blurAmount}px)`;
        ctx.drawImage(originalImage, 0, 0, w, h);
        ctx.restore();

        // Step 2: Draw sharp person on top (maskImage is ONLY the person)
        ctx.drawImage(maskImage, 0, 0, w, h);
    } else {
        // No blur or no mask - draw original
        ctx.drawImage(originalImage, 0, 0, w, h);
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
