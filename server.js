const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const port = Number(process.env.PORT || 8080);
const publicRoot = __dirname;

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
});

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
