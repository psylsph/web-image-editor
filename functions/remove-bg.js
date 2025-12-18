const axios = require('axios');
const FormData = require('form-data');
const Busboy = require('busboy');

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

                const response = await axios.post('https://api.rembg.com/rmbg', formData, {
                    headers: {
                        ...formData.getHeaders(),
                        'x-api-key': apiKey
                    },
                    responseType: 'arraybuffer'
                });

                // Return the image data
                resolve({
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'image/png'
                    },
                    body: Buffer.from(response.data).toString('base64'),
                    isBase64Encoded: true
                });

            } catch (error) {
                console.error('API Error:', error.response ? error.response.data.toString() : error.message);
                resolve({
                    statusCode: 502,
                    body: JSON.stringify({ error: 'Failed to process image with RemBG' })
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
