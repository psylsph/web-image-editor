import { removeBackground } from "@imgly/background-removal";

// Test file serving and configuration
async function testFileServing() {
    console.log('Testing file serving...');
    
    const baseUrl = window.location.origin;
    const testPaths = [
        '/vendor/imgly-data/resources.json',
        '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
        '/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
        '/vendor/imgly.js'
    ];
    
    for (const path of testPaths) {
        try {
            const response = await fetch(`${baseUrl}${path}`);
            console.log(`${path}: ${response.status} ${response.statusText}`);
        } catch (error) {
            console.error(`${path}: Error - ${error.message}`);
        }
    }
}

// Test different publicPath configurations
async function testPublicPathConfigurations() {
    console.log('\nTesting publicPath configurations...');
    
    const testConfigs = [
        { publicPath: window.location.origin + "/", name: "root" },
        { publicPath: window.location.origin + "/vendor/imgly-data/", name: "vendor" },
        { publicPath: "./", name: "relative root" },
        { publicPath: "./vendor/imgly-data/", name: "relative vendor" },
        { publicPath: "/", name: "absolute root" }
    ];
    
    for (const config of testConfigs) {
        console.log(`Testing config (${config.name}): ${config.publicPath}`);
        try {
            // Test with a small canvas to create a valid image
            const canvas = document.createElement('canvas');
            canvas.width = 50;
            canvas.height = 50;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'blue';
            ctx.fillRect(0, 0, 50, 50);
            
            const blob = await new Promise(resolve => canvas.toBlob(resolve));
            
            const result = await removeBackground(blob, {
                publicPath: config.publicPath,
                model: "isnet_fp16",
                debug: true
            });
            console.log(`✅ Config ${config.name} SUCCESS`);
            return; // Stop on first success
        } catch (error) {
            console.log(`❌ Config ${config.name} failed: ${error.message}`);
            
            // Provide more detailed error analysis
            if (error.message.includes('resources.json')) {
                console.log(`   → resources.json not found at ${config.publicPath}`);
            } else if (error.message.includes('onnxruntime-web')) {
                console.log(`   → ONNX runtime files not accessible from ${config.publicPath}`);
            }
        }
    }
}

// Test automatic resource verification
async function testResourceVerification() {
    console.log('\nTesting automatic resource verification...');
    
    // Test all paths that imgly might request
    const criticalPaths = [
        '/resources.json',
        '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
        '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
        '/vendor/imgly-data/resources.json'
    ];
    
    const results = {};
    for (const path of criticalPaths) {
        try {
            const response = await fetch(path, { method: 'HEAD' });
            results[path] = {
                status: response.status,
                ok: response.ok,
                exists: response.ok
            };
        } catch (error) {
            results[path] = {
                status: 'ERROR',
                ok: false,
                exists: false,
                error: error.message
            };
        }
    }
    
    console.log('Resource verification results:');
    for (const [path, result] of Object.entries(results)) {
        const status = result.exists ? '✅' : '❌';
        console.log(`${status} ${path} (${result.status})`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
    }
    
    return results;
}

// Test with actual image
async function testWithSampleImage() {
    console.log('\nTesting with sample image...');
    
    try {
        // Create a small test image
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 100, 100);
        
        canvas.toBlob(async (blob) => {
            try {
                const config = {
                    publicPath: window.location.origin + "/",
                    model: "isnet_fp16",
                    debug: true
                };
                console.log('Starting background removal with config:', config);
                const result = await removeBackground(blob, config);
                console.log('Background removal successful');
            } catch (error) {
                console.error('Background removal failed:', error.message);
                console.error('Full error:', error);
            }
        });
    } catch (error) {
        console.error('Test setup failed:', error);
    }
}

// Check vendor directory contents
async function checkVendorContents() {
    console.log('\nChecking vendor directory...');
    
    try {
        const response = await fetch('/vendor/imgly-data/resources.json');
        if (response.ok) {
            const resources = await response.json();
            console.log('Resources found:', Object.keys(resources).slice(0, 5));
        } else {
            console.log('Resources.json not found in vendor');
        }
    } catch (error) {
        console.error('Error checking vendor contents:', error);
    }
    
    // Check root resources.json (where imgly expects it)
    try {
        const response = await fetch('/resources.json');
        if (response.ok) {
            const resources = await response.json();
            console.log('Root resources.json found with', Object.keys(resources).length, 'entries');
            
            // Check if all referenced files exist
            let missingFiles = [];
            for (const [filePath, fileData] of Object.entries(resources)) {
                const testUrl = filePath.startsWith('/') ? filePath : '/' + filePath;
                try {
                    const fileResponse = await fetch(testUrl, { method: 'HEAD' });
                    if (!fileResponse.ok) {
                        missingFiles.push(testUrl);
                    }
                } catch (e) {
                    missingFiles.push(testUrl);
                }
            }
            
            if (missingFiles.length > 0) {
                console.error('Missing resource files:', missingFiles.slice(0, 5));
            } else {
                console.log('All resource files are accessible');
            }
        } else {
            console.error('Root resources.json not found - this is required by imgly');
        }
    } catch (error) {
        console.error('Error checking root resources:', error);
    }
}

// Run all tests
async function runDiagnostics() {
    console.log('=== IMG Background Removal Diagnostics ===');
    
    const resourceResults = await testResourceVerification();
    await testFileServing();
    await testPublicPathConfigurations();
    await checkVendorContents();
    
    // Only run the full test if basic resources are available
    const hasBasicResources = resourceResults['/resources.json']?.exists && 
                             resourceResults['/onnxruntime-web/ort-wasm-simd-threaded.mjs']?.exists;
    
    if (hasBasicResources) {
        await testWithSampleImage();
    } else {
        console.log('⚠️ Skipping full background removal test - basic resources missing');
    }
    
    console.log('\n=== Diagnostics Complete ===');
}

// Auto-fix common issues
async function autoFixConfiguration() {
    console.log('\n=== Auto-fixing Configuration ===');
    
    const fixes = [];
    
    // Check if resources.json exists at root
    try {
        const response = await fetch('/resources.json');
        if (!response.ok) {
            console.log('🔧 Fixing missing resources.json at root...');
            try {
                // Try to copy from vendor location
                const vendorResponse = await fetch('/vendor/imgly-data/resources.json');
                if (vendorResponse.ok) {
                    // This would need server-side copy functionality
                    console.log('⚠️ Manual fix needed: Copy vendor/imgly-data/resources.json to root');
                    fixes.push('Copy resources.json to root directory');
                }
            } catch (e) {
                console.log('❌ Cannot auto-fix resources.json issue');
            }
        }
    } catch (error) {
        console.log('❌ Cannot check resources.json:', error.message);
    }
    
    // Check ONNX runtime files
    const onnxFiles = [
        '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
        '/onnxruntime-web/ort-wasm-simd-threaded.wasm'
    ];
    
    for (const file of onnxFiles) {
        try {
            const response = await fetch(file, { method: 'HEAD' });
            if (!response.ok) {
                console.log(`🔧 ONNX file missing: ${file}`);
                fixes.push(`Copy ${file} from node_modules/onnxruntime-web/dist/`);
            }
        } catch (error) {
            console.log(`❌ Cannot check ${file}:`, error.message);
        }
    }
    
    if (fixes.length > 0) {
        console.log('\n📋 Required fixes:');
        fixes.forEach(fix => console.log(`   - ${fix}`));
        console.log('\n💡 Run these commands to fix:');
        console.log('   cp vendor/imgly-data/resources.json ./');
        console.log('   cp -r node_modules/onnxruntime-web/dist/* ./onnxruntime-web/');
    } else {
        console.log('✅ No auto-fixes needed');
    }
    
    return fixes;
}

// Test model file availability
async function testModelFileAvailability() {
    console.log('\n=== Model File Availability Test ===');
    
    // Check what model files are referenced in resources.json
    try {
        const response = await fetch('/resources.json');
        const resources = await response.json();
        
        const modelPaths = Object.keys(resources).filter(path => path.includes('/models/'));
        console.log(`Found ${modelPaths.length} model paths in resources.json`);
        
        let missingModels = [];
        let availableModels = [];
        
        for (const modelPath of modelPaths) {
            try {
                const modelResponse = await fetch(modelPath, { method: 'HEAD' });
                if (modelResponse.ok) {
                    availableModels.push(modelPath);
                } else {
                    missingModels.push(modelPath);
                }
            } catch (error) {
                missingModels.push(modelPath);
            }
        }
        
        console.log(`✅ Available models: ${availableModels.length}`);
        console.log(`❌ Missing models: ${missingModels.length}`);
        
        if (missingModels.length > 0) {
            console.log('Missing model paths:');
            missingModels.slice(0, 5).forEach(path => console.log(`   - ${path}`));
        }
        
        return { available: availableModels, missing: missingModels };
        
    } catch (error) {
        console.error('Failed to check model availability:', error);
        return { available: [], missing: [] };
    }
}

// Test with progressive complexity
async function testProgressiveComplexity() {
    console.log('\n=== Progressive Complexity Test ===');
    
    try {
        // Test 1: Basic initialization
        console.log('Test 1: Basic initialization...');
        await removeBackground(new Blob(['test'], { type: 'text/plain' }), {
            publicPath: window.location.origin + "/",
            model: "isnet_fp16"
        });
        console.log('❌ Should have failed with invalid image');
    } catch (error) {
        if (error.message.includes('Resource') || error.message.includes('fetch') || error.message.includes('models')) {
            console.log('❌ Configuration still has resource/model issues');
            console.log(`   Error: ${error.message}`);
            return false;
        } else {
            console.log('✅ Basic initialization works (fails as expected with bad input)');
        }
    }
    
    // Test 2: Tiny valid image
    console.log('Test 2: Tiny valid image...');
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, 10, 10);
        
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        const result = await removeBackground(blob, {
            publicPath: window.location.origin + "/",
            model: "isnet_fp16"
        });
        
        console.log('✅ Background removal works with tiny image');
        return true;
        
    } catch (error) {
        console.log('❌ Background removal failed:', error.message);
        if (error.message.includes('models') || error.message.includes('fetch')) {
            console.log('   This appears to be a model file serving issue');
        }
        return false;
    }
}

// Export for manual testing or auto-run
window.imglyTests = {
    runDiagnostics,
    testFileServing,
    testPublicPathConfigurations,
    testWithSampleImage,
    checkVendorContents,
    testResourceVerification,
    autoFixConfiguration,
    testProgressiveComplexity,
    testModelFileAvailability
};

// Auto-run if in development mode
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Development mode detected - running IMG diagnostics...');
    setTimeout(async () => {
        await runDiagnostics();
        await autoFixConfiguration();
        
        const success = await testProgressiveComplexity();
        if (success) {
            console.log('\n🎉 All tests passed! Background removal should work.');
        } else {
            console.log('\n⚠️ Issues remain. Check the fixes above.');
        }
    }, 1000);
}