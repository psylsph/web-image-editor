import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Web Image Editor - Advanced Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('complete workflow - upload, edit, and download', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const blurSlider = page.locator('#blur-amount');
    const grainSlider = page.locator('#grain-amount');
    const downloadBtn = page.locator('#download-btn');
    
    // Upload image
    const imagePath = path.resolve(__dirname, '../test-assets/test-image.png');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(1000);
    
    // Test initial state
    await expect(blurSlider).toHaveValue('0');
    await expect(grainSlider).toHaveValue('0');
    
    // Apply blur (will trigger background processing)
    await blurSlider.fill('8');
    await expect(blurSlider).toHaveValue('8');
    await expect(page.locator('#loading-overlay')).toBeVisible();
    
    // Wait for background processing to complete or timeout
    await page.waitForTimeout(5000);
    
    // Apply grain
    await grainSlider.fill('15');
    await expect(grainSlider).toHaveValue('15');
    
    // Download should be enabled
    await expect(downloadBtn).toBeEnabled();
    
    // Test download (set up download listener)
    const downloadPromise = page.waitForEvent('download');
    await downloadBtn.click();
    const download = await downloadPromise;
    
    // Verify download filename
    expect(download.suggestedFilename()).toMatch(/_edited\.png$/);
  });

  test('image dimensions are constrained properly', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const canvas = page.locator('#main-canvas');
    
    const imagePath = path.resolve(__dirname, '../test-assets/test-image.png');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(1000);
    
    // Canvas should be visible and have reasonable dimensions
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox.width).toBeGreaterThan(0);
    expect(canvasBox.height).toBeGreaterThan(0);
    
    // Width should not exceed MAX_IMAGE_WIDTH (1920px)
    expect(canvasBox.width).toBeLessThanOrEqual(1920);
  });

  test('loading overlay behavior', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const blurSlider = page.locator('#blur-amount');
    const loadingOverlay = page.locator('#loading-overlay');
    const loadingText = page.locator('#loading-overlay p');
    
    // Upload image
    const imagePath = path.resolve(__dirname, '../test-assets/test-image.png');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(1000);
    
    // Initially hidden
    await expect(loadingOverlay).toBeHidden();
    
    // Apply blur to trigger loading
    await blurSlider.fill('3');
    await expect(loadingOverlay).toBeVisible();
    await expect(loadingText).toContainText('Loading AI models');
    
    // Controls should be disabled during loading
    await expect(blurSlider).toBeDisabled();
    await expect(page.locator('#grain-amount')).toBeDisabled();
    await expect(page.locator('#download-btn')).toBeDisabled();
  });

  test('slider ranges and validation', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const blurSlider = page.locator('#blur-amount');
    const grainSlider = page.locator('#grain-amount');
    
    // Upload image
    const imagePath = path.resolve(__dirname, '../test-assets/test-image.png');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(1000);
    
    // Test blur slider bounds (0-15)
    await expect(blurSlider).toHaveAttribute('min', '0');
    await expect(blurSlider).toHaveAttribute('max', '15');
    
    await blurSlider.fill('0');
    await expect(blurSlider).toHaveValue('0');
    
    await blurSlider.fill('15');
    await expect(blurSlider).toHaveValue('15');
    
    // Test grain slider bounds (0-50)
    await expect(grainSlider).toHaveAttribute('min', '0');
    await expect(grainSlider).toHaveAttribute('max', '50');
    
    await grainSlider.fill('0');
    await expect(grainSlider).toHaveValue('0');
    
    await grainSlider.fill('50');
    await expect(grainSlider).toHaveValue('50');
  });

  test('real-time rendering with grain only', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const grainSlider = page.locator('#grain-amount');
    const canvas = page.locator('#main-canvas');
    
    // Upload image
    const imagePath = path.resolve(__dirname, '../test-assets/test-image.png');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(1000);
    
    // Get initial canvas state
    const initialDataUrl = await canvas.evaluate((el) => {
      return el.toDataURL();
    });
    
    // Apply grain
    await grainSlider.fill('30');
    
    // Wait a moment for render to complete
    await page.waitForTimeout(100);
    
    // Canvas should be different (grain applied)
    const modifiedDataUrl = await canvas.evaluate((el) => {
      return el.toDataURL();
    });
    
    expect(modifiedDataUrl).not.toBe(initialDataUrl);
    
    // Reset grain
    await grainSlider.fill('0');
    await page.waitForTimeout(100);
    
    // Should be closer to original (though might not be identical due to pixel operations)
    const resetDataUrl = await canvas.evaluate((el) => {
      return el.toDataURL();
    });
    
    // At least it should be different from the modified version
    expect(resetDataUrl).not.toBe(modifiedDataUrl);
  });

  test('responsive design elements', async ({ page }) => {
    const header = page.locator('header h1');
    const dropZone = page.locator('#drop-zone');
    const controlsPanel = page.locator('.controls-panel');
    
    // Check main elements are visible and properly positioned
    await expect(header).toBeVisible();
    await expect(header).toContainText('Blur & Grain');
    
    await expect(dropZone).toBeVisible();
    await expect(controlsPanel).toBeVisible();
    
    // Check CSS classes exist
    await expect(page.locator('.app-container')).toBeVisible();
    await expect(page.locator('.editor-layout')).toBeVisible();
    await expect(page.locator('.canvas-container')).toBeVisible();
  });

  test('keyboard accessibility', async ({ page }) => {
    const fileInput = page.locator('#file-input');
    const blurSlider = page.locator('#blur-amount');
    const grainSlider = page.locator('#grain-amount');
    const downloadBtn = page.locator('#download-btn');
    
    // Upload image
    const imagePath = path.resolve(__dirname, '../test-assets/test-image.png');
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(1000);
    
    // Test that elements can be focused programmatically
    await blurSlider.focus();
    // Check that element is focused by checking if it's the active element
    const blurIsFocused = await blurSlider.evaluate(el => document.activeElement === el);
    expect(blurIsFocused).toBe(true);
    
    await grainSlider.focus();
    const grainIsFocused = await grainSlider.evaluate(el => document.activeElement === el);
    expect(grainIsFocused).toBe(true);
    
    await downloadBtn.focus();
    const downloadIsFocused = await downloadBtn.evaluate(el => document.activeElement === el);
    expect(downloadIsFocused).toBe(true);
    
    // Enter key should trigger download when button is focused
    const downloadPromise = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/_edited\.png$/);
  });
});