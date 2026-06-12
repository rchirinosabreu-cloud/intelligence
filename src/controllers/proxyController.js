import { createProxyMiddleware } from 'http-proxy-middleware';

const geminiApiKey = process.env.GEMINI_API_KEY?.trim();

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

        if (!response.ok) return res.status(response.status).send(await response.text());

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
             res.send(await response.text());
        }
    } catch (error) {
        res.status(504).json({ error: "Failed to connect to OpenAI API", details: error.message });
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

        const data = await response.text();
        if (!response.ok) return res.status(response.status).send(data);
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(504).json({ error: "Failed to connect to Fireflies API", details: error.message });
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
      }
    }
});
