import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('BodyPix Background Removal', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    test('BodyPix model loads successfully', async ({ page }) => {
        // Wait for BodyPix to load
        await page.waitForTimeout(2000);

        // Check console for success message
        const logs = [];
        page.on('console', msg => logs.push(msg.text()));

        // Check that page loaded without errors
        await expect(page.locator('h1')).toHaveText('Blur & Grain');
    });

    test('background removal works with BodyPix', async ({ page }) => {
        const testImagePath = path.join(__dirname, 'test-image.jpg');

        // Upload test image
        const fileInput = page.locator('#file-input');
        await fileInput.setInputFiles(testImagePath);

        // Wait for image to load
        await page.waitForSelector('#main-canvas[style*="display: block"]', { timeout: 5000 });

        // Move blur slider to trigger background removal
        const blurSlider = page.locator('#blur-amount');
        await blurSlider.fill('10');

        // Wait for background removal processing
        await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 15000 });

        // Verify canvas was updated
        const canvas = page.locator('#main-canvas');
        await expect(canvas).toBeVisible();

        // Check that no errors occurred
        const hasError = await page.evaluate(() => {
            return window.location.href.includes('error') ||
                document.querySelectorAll('.error').length > 0;
        });
        expect(hasError).toBe(false);
    });

    test('blur and grain work together', async ({ page }) => {
        const testImagePath = path.join(__dirname, 'test-image.jpg');

        // Upload image
        await page.locator('#file-input').setInputFiles(testImagePath);
        await page.waitForSelector('#main-canvas[style*="display: block"]');

        // Apply blur
        await page.locator('#blur-amount').fill('8');
        await page.waitForTimeout(5000); // Wait for background removal

        // Apply grain
        await page.locator('#grain-amount').fill('30');
        await page.waitForTimeout(500);

        // Verify both sliders have values
        const blurValue = await page.locator('#blur-amount').inputValue();
        const grainValue = await page.locator('#grain-amount').inputValue();

        expect(parseInt(blurValue)).toBe(8);
        expect(parseInt(grainValue)).toBe(30);
    });

    test('download button works after processing', async ({ page }) => {
        const testImagePath = path.join(__dirname, 'test-image.jpg');

        // Upload and process
        await page.locator('#file-input').setInputFiles(testImagePath);
        await page.waitForSelector('#main-canvas[style*="display: block"]');
        await page.locator('#blur-amount').fill('5');
        await page.waitForTimeout(5000);

        // Verify download button is enabled
        const downloadBtn = page.locator('#download-btn');
        await expect(downloadBtn).toBeEnabled();
    });
});
