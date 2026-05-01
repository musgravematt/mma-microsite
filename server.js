const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const port = Number(process.env.PORT || 8080);
const publicRoot = __dirname;
const zapierWebhookUrl = process.env.ZAPIER_WEBHOOK_URL || 'https://hooks.zapier.com/hooks/catch/17707301/uvgp73g/';

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
};

const server = http.createServer(async (request, response) => {
    try {
        if (request.method === 'POST' && request.url === '/api/leads') {
            await handleLeadCreate(request, response);
            return;
        }

        if (request.method === 'GET' || request.method === 'HEAD') {
            await serveStaticFile(request, response);
            return;
        }

        sendJson(response, 405, { error: 'Method not allowed.' });
    } catch (error) {
        console.error(error);
        sendJson(response, 500, { error: 'Something went wrong. Please try again.' });
    }
});

server.listen(port, () => {
    console.log(`MMA microsite running at http://localhost:${port}`);
    console.log(`Lead captures will be sent to ${zapierWebhookUrl}`);
});

async function handleLeadCreate(request, response) {
    const body = await readJsonBody(request);
    const firstName = cleanName(body.firstName);
    const email = cleanEmail(body.email);

    if (!firstName) {
        sendJson(response, 422, { error: 'Please enter your first name.' });
        return;
    }

    if (!email || !isValidEmail(email)) {
        sendJson(response, 422, { error: 'Please enter a valid email address.' });
        return;
    }

    await sendLeadToZapier({ firstName, email });
    sendJson(response, 201, { ok: true });
}

async function sendLeadToZapier(lead) {
    const zapierResponse = await fetch(zapierWebhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            firstName: lead.firstName,
            email: lead.email,
        }),
    });

    if (!zapierResponse.ok) {
        const responseText = await zapierResponse.text();
        console.error('Zapier webhook failed:', zapierResponse.status, responseText);
        throw new Error('Zapier webhook failed.');
    }
}

function cleanName(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function cleanEmail(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().toLowerCase().slice(0, 254);
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function readJsonBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';

        request.on('data', (chunk) => {
            body += chunk;

            if (body.length > 20_000) {
                request.destroy();
                reject(new Error('Request body is too large.'));
            }
        });

        request.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error('Invalid JSON body.'));
            }
        });

        request.on('error', reject);
    });
}

async function serveStaticFile(request, response) {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const safePath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.normalize(path.join(publicRoot, safePath));

    if (!filePath.startsWith(publicRoot)) {
        response.writeHead(404);
        response.end('Not found');
        return;
    }

    let stats;
    try {
        stats = await fs.promises.stat(filePath);
    } catch {
        response.writeHead(404);
        response.end('Not found');
        return;
    }

    if (!stats.isFile()) {
        response.writeHead(404);
        response.end('Not found');
        return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
        'Content-Type': mimeTypes[extension] || 'application/octet-stream',
        'Content-Length': stats.size,
    });

    if (request.method === 'HEAD') {
        response.end();
        return;
    }

    fs.createReadStream(filePath).pipe(response);
}

function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(body));
}
