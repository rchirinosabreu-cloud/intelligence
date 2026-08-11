import { createProxyMiddleware } from 'http-proxy-middleware';

const geminiApiKey = process.env.GEMINI_API_KEY?.trim();

const sendUpstreamError = (res, provider, response) => {
    const requestId = response.headers.get('x-request-id') || response.headers.get('fly-request-id');
    console.error(`[${provider} Proxy] Upstream request failed`, {
        status: response.status,
        requestId: requestId || undefined
    });
    const status = response.status === 429 ? 429 : 502;
    return res.status(status).json({
        error: 'UPSTREAM_SERVICE_ERROR',
        message: 'El proveedor externo no respondió correctamente'
    });
};

export const openaiProxy = async (req, res) => {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "Missing OpenAI API Key" });

        const requestBody = { ...req.body, stream: true };
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'BrainStudioIntelligence/2.0'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) return sendUpstreamError(res, 'OpenAI', response);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (response.body) {
             const reader = response.body.getReader();
             const pump = async () => {
                 try {
                     while (true) {
                         const { done, value } = await reader.read();
                         if (done) break;
                         res.write(value);
                     }
                     res.end();
                 } catch (err) {
                     res.end();
                 }
             };
             pump();
             req.on('close', () => reader.cancel());
        } else {
             return res.status(502).json({ error: 'UPSTREAM_SERVICE_ERROR' });
        }
    } catch (error) {
        console.error('[OpenAI Proxy] Connection failed:', error.message);
        res.status(504).json({ error: 'UPSTREAM_SERVICE_ERROR' });
    }
};

export const firefliesProxy = async (req, res) => {
    try {
        const apiKey = process.env.FIREFLIES_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "Missing Fireflies API Key" });

        const response = await fetch('https://api.fireflies.ai/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'BrainStudioIntelligence/2.0'
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) return sendUpstreamError(res, 'Fireflies', response);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('[Fireflies Proxy] Connection failed:', error.message);
        res.status(504).json({ error: 'UPSTREAM_SERVICE_ERROR' });
    }
};

export const geminiProxy = createProxyMiddleware({
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    secure: true,
    pathRewrite: (path) => path.replace(/^\/api\/gemini/, ''),
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('User-Agent', 'BrainStudioIntelligence/2.0');
        proxyReq.removeHeader('Authorization');
        if (geminiApiKey) proxyReq.setHeader('x-goog-api-key', geminiApiKey);
        if (req.body) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      error: (error, _req, res) => {
        console.error('[Gemini Proxy] Connection failed:', error.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ error: 'UPSTREAM_SERVICE_ERROR' }));
      }
    }
});
