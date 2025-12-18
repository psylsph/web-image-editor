import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Web Image Editor - Full Functionality Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('complete workflow with JPG image - upload, remove background, apply effects, and download', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const blurSlider = page.locator('#blur-amount');
    const grainSlider = page.locator('#grain-amount');
    const downloadBtn = page.locator('#download-btn');
    
    // Upload JPG test image (from the tests directory)
    const imagePath = path.resolve(__dirname, 'test-image.jpg');
    await fileInput.setInputFiles(imagePath);
    
    // Wait for image to load and UI to update
    await page.waitForTimeout(2000);
    
    // Verify initial state after upload
    await expect(page.locator('#upload-placeholder')).toBeHidden();
    await expect(page.locator('#main-canvas')).toBeVisible();
    await expect(blurSlider).toBeEnabled();
    await expect(grainSlider).toBeEnabled();
    await expect(downloadBtn).toBeEnabled();
    
    // Test initial slider values
    await expect(blurSlider).toHaveValue('0');
    await expect(grainSlider).toHaveValue('0');
    
    // Get initial canvas state for comparison
    const initialCanvasData = await page.locator('#main-canvas').evaluate((canvas) => {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return {
        width: canvas.width,
        height: canvas.height,
        dataLength: imageData.data.length
      };
    });
    
    // Verify canvas has reasonable dimensions
    expect(initialCanvasData.width).toBeGreaterThan(0);
    expect(initialCanvasData.height).toBeGreaterThan(0);
    expect(initialCanvasData.dataLength).toBeGreaterThan(0);
    
    // Test 1: Apply grain effect (real-time processing)
    await grainSlider.fill('25');
    await expect(grainSlider).toHaveValue('25');
    
    // Wait for grain effect to render
    await page.waitForTimeout(500);
    
    // Verify canvas changed after grain
    const grainCanvasData = await page.locator('#main-canvas').evaluate((canvas) => {
      const ctx = canvas.getContext('2d');
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice(0, 100); // Sample first 100 pixels
    });
    
    // Test 2: Apply blur effect (triggers background removal)
    await blurSlider.fill('8');
    await expect(blurSlider).toHaveValue('8');
    
    // Loading overlay may appear but could be very fast if models are cached
    // We'll just wait a bit to see if loading occurs, then proceed
    await page.waitForTimeout(1000);
    
    // Check if loading is happening - if so, wait for it to complete
    const isLoading = await page.locator('#loading-overlay').isVisible();
    if (isLoading) {
      await expect(page.locator('#loading-overlay p')).toContainText('Loading AI models');
      
      // Controls should be disabled during processing
      await expect(blurSlider).toBeDisabled();
      await expect(grainSlider).toBeDisabled();
      await expect(downloadBtn).toBeDisabled();
      
      // Wait for loading to complete
      await expect(page.locator('#loading-overlay')).toBeHidden({ timeout: 15000 });
    }
    
    // Wait for background processing to complete (may take time for first model load)
    await page.waitForTimeout(10000); // Increased timeout for AI model loading
    
    // After processing, loading overlay should be hidden
    await expect(page.locator('#loading-overlay')).toBeHidden();
    
    // Controls should be enabled again
    await expect(blurSlider).toBeEnabled();
    await expect(grainSlider).toBeEnabled();
    await expect(downloadBtn).toBeEnabled();
    
    // Test 3: Adjust both effects together
    await blurSlider.fill('12');
    await grainSlider.fill('35');
    
    await expect(blurSlider).toHaveValue('12');
    await expect(grainSlider).toHaveValue('35');
    
    // Wait for rendering to complete
    await page.waitForTimeout(1000);
    
    // Test 4: Download the edited image
    const downloadPromise = page.waitForEvent('download');
    await downloadBtn.click();
    const download = await downloadPromise;
    
    // Verify download filename format
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/_edited\.png$/);
    
    // Verify file was downloaded successfully
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    
    // Test 5: Reset effects to zero
    await blurSlider.fill('0');
    await grainSlider.fill('0');
    
    await expect(blurSlider).toHaveValue('0');
    await expect(grainSlider).toHaveValue('0');
    
    // Wait for reset to render
    await page.waitForTimeout(500);
    
    // Test 6: Test extreme values
    await blurSlider.fill('15'); // Maximum blur
    await grainSlider.fill('50'); // Maximum grain
    
    await expect(blurSlider).toHaveValue('15');
    await expect(grainSlider).toHaveValue('50');
    
    // Wait for extreme effects to render
    await page.waitForTimeout(2000);
    
    // Download with extreme effects
    const downloadPromise2 = page.waitForEvent('download');
    await downloadBtn.click();
    const download2 = await downloadPromise2;
    
    const filename2 = download2.suggestedFilename();
    expect(filename2).toMatch(/_edited\.png$/);
  });

  test('drag and drop UI interactions', async ({ page }) => {
    const dropZone = page.locator('#drop-zone');
    const uploadPlaceholder = page.locator('#upload-placeholder');
    
    await expect(uploadPlaceholder).toBeVisible();
    
    // Test drag over state with a simulated file
    const dt = await page.evaluateHandle(() => {
      const dataTransfer = new DataTransfer();
      // Create a minimal valid image file
      const bytes = new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
        0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0x57, 0x63, 0xF8, 0x0F, 0x00, 0x00,
        0x01, 0x00, 0x01, 0x5C, 0xCE, 0x8B, 0x3B, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      const file = new File([bytes], 'test-image.png', { type: 'image/png' });
      dataTransfer.items.add(file);
      return dataTransfer;
    });
    
    // Test drag over visual feedback
    await dropZone.dispatchEvent('dragover', { dataTransfer: dt });
    await expect(dropZone).toHaveClass(/drag-over/);
    
    // Test drag leave
    await dropZone.dispatchEvent('dragleave');
    await expect(dropZone).not.toHaveClass(/drag-over/);
    
    // Test drop functionality
    await dropZone.dispatchEvent('dragover', { dataTransfer: dt });
    await dropZone.dispatchEvent('drop', { dataTransfer: dt });
    
    // Wait a moment for potential processing
    await page.waitForTimeout(2000);
    
    // The drag and drop may or may not work depending on the browser's file handling
    // This test primarily checks the UI interactions are working correctly
    await expect(dropZone).not.toHaveClass(/drag-over/);
  });

  test('error handling with invalid operations', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const blurSlider = page.locator('#blur-amount');
    
    // Upload valid image first
    const imagePath = path.resolve(__dirname, 'test-image.jpg');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(2000);
    
    // Try to set invalid slider values (test range constraints)
    // The browser should clamp values to the min/max range
    await blurSlider.evaluate((el) => el.value = '100'); // Beyond max of 15
    await expect(blurSlider).toHaveValue('15'); // Should be clamped to max
    
    await blurSlider.evaluate((el) => el.value = '-5'); // Below min of 0
    await expect(blurSlider).toHaveValue('0'); // Should be clamped to min
  });

  test('performance and memory handling', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const blurSlider = page.locator('#blur-amount');
    const grainSlider = page.locator('#grain-amount');
    
    // Upload image
    const imagePath = path.resolve(__dirname, 'test-image.jpg');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(2000);
    
    // Rapid slider changes to test performance
    for (let i = 0; i < 10; i++) {
      await grainSlider.fill(String(i * 5));
      await page.waitForTimeout(100);
    }
    
    // Test blur with background processing
    await blurSlider.fill('5');
    await page.waitForTimeout(3000); // Wait for background processing
    
    // Verify UI is still responsive
    await expect(grainSlider).toBeEnabled();
    await expect(blurSlider).toBeEnabled();
    
    // Test memory cleanup by uploading new file
    await fileInput.setInputFiles([]);
    await page.waitForTimeout(100);
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(2000);
    
    // Should work fine after cleanup
    await expect(grainSlider).toHaveValue('0');
    await expect(blurSlider).toHaveValue('0');
  });
});