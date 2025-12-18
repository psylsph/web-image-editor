const axios = require('axios');
const FormData = require('form-data');
const Busboy = require('busboy');
const Jimp = require('jimp');

exports.handler = async function (event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const fields = {};
    const files = [];

    return new Promise((resolve, reject) => {
        // Fix for header casing issues (Busboy requires 'content-type')
        const headers = {};
        for (const key in event.headers) {
            headers[key.toLowerCase()] = event.headers[key];
        }

        const busboy = Busboy({ headers });

        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            const chunks = [];
            file.on('data', (data) => chunks.push(data));
            file.on('end', () => {
                files.push({
                    fieldname,
                    filename,
                    mimetype,
                    content: Buffer.concat(chunks)
                });
            });
        });

        busboy.on('field', (fieldname, val) => {
            fields[fieldname] = val;
        });

        busboy.on('finish', async () => {
            try {
                if (files.length === 0) {
                    resolve({ statusCode: 400, body: 'No file uploaded' });
                    return;
                }

                const imageFile = files[0];
                const formData = new FormData();
                formData.append('image', imageFile.content, imageFile.filename.filename);

                // Add optional parameters if present in fields
                // RemBG API supports 'mask' parameter.
                if (fields.mask === 'true') {
                    formData.append('mask', 'true');
                }

                // Call RemBG API
                const apiKey = process.env.REMBG_API_KEY;
                if (!apiKey) {
                    resolve({ statusCode: 500, body: 'Missing API Key configuration' });
                    return;
                }

                console.log('Sending to RemBG...');
                const response = await axios.post('https://api.rembg.com/rmbg', formData, {
                    headers: {
                        ...formData.getHeaders(),
                        'x-api-key': apiKey
                    },
                    responseType: 'arraybuffer'
                });

                console.log('Received response from RemBG');
                const cutoutBuffer = Buffer.from(response.data);

                // If blur is 0, just return the cutout? 
                // Wait, if blur is 0, we still want the original background? 
                // The user app behavior was: Background = Original, Foreground = Cutout.
                // If the user uploads an image, they expect to see the original image with NO blur initially.
                // But this function is usually called when "blur > 0". 
                // Actually, the previous frontend code called this ONLY when blur > 0 (or strictly speaking, it checked triggers).
                // But now we want the server to handle the rendering.

                const blurAmount = parseInt(fields.blur || '0', 10);

                // Load images into Jimp
                const [originalImage, cutoutImage] = await Promise.all([
                    Jimp.read(imageFile.content),
                    Jimp.read(cutoutBuffer)
                ]);

                // Resize original if needed to match cutout? RemBG usually preserves dimensions.
                // But let's assume they match.

                // Apply Blur to Original
                if (blurAmount > 0) {
                    // Jimp blur is distinct from CSS pixel blur. We might need to scale the value.
                    // CSS blur 10px is quite strong. Jimp blur is radius.
                    // Let's assume 1:1 for now or partial scaling.
                    originalImage.blur(blurAmount);
                }

                // Composite Cutout (Foreground) onto Blurred Original (Background)
                originalImage.composite(cutoutImage, 0, 0);

                // Get result as PNG
                const resultBuffer = await originalImage.getBufferAsync(Jimp.MIME_PNG);

                // Return the image data
                resolve({
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'image/png'
                    },
                    body: resultBuffer.toString('base64'),
                    isBase64Encoded: true
                });

            } catch (error) {
                console.error('Processing Error:', error.response ? error.response.data.toString() : error.message);
                resolve({
                    statusCode: 502,
                    body: JSON.stringify({ error: 'Failed to process image' })
                });
            }
        });

        busboy.on('error', (error) => {
            console.error('Busboy Error:', error);
            resolve({ statusCode: 500, body: 'Upload parsing failed' });
        });

        // Write the body to busboy
        if (event.isBase64Encoded) {
            busboy.write(Buffer.from(event.body, 'base64'));
        } else {
            busboy.write(event.body);
        }
        busboy.end();
    });
};
