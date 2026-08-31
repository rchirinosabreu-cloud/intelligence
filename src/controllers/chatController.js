import { getAIInstance, MODEL_NAME, systemPrompt, tools, createThinkingFilter, sendMessageStreamWithRetry } from '../services/aiService.js';
import { getClientGuidelines } from '../services/clientService.js';
import { searchCloudStorage } from '../services/discoveryService.js';
import { analyzeWebsiteDna } from '../services/auditService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const handleChat = async (req, res) => {
    try {
        const { messages } = req.body;
        const aiClient = getAIInstance();

        if (!aiClient) {
            console.error("CRITICAL: OpenAI no está disponible.");
            if (!res.headersSent) {
                res.status(503);
                res.write("Error: El servicio de IA no está disponible.");
            }
            return res.end();
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Transfer-Encoding', 'chunked');

        if (!messages || !Array.isArray(messages)) {
            res.status(400).write("Error: Invalid messages format");
            return res.end();
        }

        const lastMessageContent = messages[messages.length - 1]?.content;
        if (typeof lastMessageContent !== 'string' || !lastMessageContent.trim()) {
            res.status(400).write("Error: Missing or invalid last message content.");
            return res.end();
        }

        // --- SKILLS ROUTING (Context Injection) ---
        let injectedSkillText = "";
        const lowerMessage = lastMessageContent.toLowerCase();

        if (/parrilla|redes sociales|post|carrusel|instagram|tiktok|reel/i.test(lowerMessage)) {
            try {
                const socialSkillPath1 = path.join(__dirname, '..', 'skills', 'Skill_Social_Copy.md');
                const socialSkillPath2 = path.join(__dirname, '..', 'skills', 'Skill_Social_Content.md');
                let combinedSocialSkill = "";
                if (fs.existsSync(socialSkillPath1)) combinedSocialSkill += fs.readFileSync(socialSkillPath1, 'utf8') + "\n\n";
                if (fs.existsSync(socialSkillPath2)) combinedSocialSkill += "--- NORMAS DE SOCIAL CONTENT (COREY HAINES) ---\n" + fs.readFileSync(socialSkillPath2, 'utf8');
                if (combinedSocialSkill) injectedSkillText += "\n\n### HABILIDAD INYECTADA: SOCIAL MEDIA EXPERT ###\n" + combinedSocialSkill;
            } catch (err) { console.error("[Skills Router] Error reading Social Skills:", err); }
        } else if (/landing page|página web|página de precios|email sequence|página de ventas/i.test(lowerMessage)) {
             try {
                const croSkillPath = path.join(__dirname, '..', 'skills', 'Skill_Web_CRO.md');
                if (fs.existsSync(croSkillPath)) injectedSkillText += "\n\n### HABILIDAD INYECTADA: WEB CRO COPYWRITING ###\n" + fs.readFileSync(croSkillPath, 'utf8');
            } catch (err) { console.error("[Skills Router] Error reading CRO Skill:", err); }
        } else if (/anuncios|pauta|meta ads|facebook ads|campañas|copy para pauta/i.test(lowerMessage)) {
            try {
               const adSkillPath = path.join(__dirname, '..', 'skills', 'Skill_Ad_Creative.md');
               if (fs.existsSync(adSkillPath)) injectedSkillText += "\n\n### HABILIDAD INYECTADA: AD CREATIVE EXPERT ###\n" + fs.readFileSync(adSkillPath, 'utf8');
           } catch (err) { console.error("[Skills Router] Error reading Ad Creative Skill:", err); }
        }

        if (/persuasivo|sesgos|psicología de ventas/i.test(lowerMessage)) {
            try {
                const psychSkillPath = path.join(__dirname, '..', 'skills', 'Skill_Marketing_Psychology.md');
                if (fs.existsSync(psychSkillPath)) injectedSkillText += "\n\n### MODIFICADOR INYECTADO: MARKETING PSYCHOLOGY ###\n" + fs.readFileSync(psychSkillPath, 'utf8');
            } catch (err) { console.error("[Skills Router] Error reading Marketing Psychology Skill:", err); }
        }

        const finalSystemPrompt = systemPrompt + injectedSkillText;

        const history = messages
            .filter(msg => msg.role !== 'system')
            .slice(0, -1)
            .map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

        const streamResult = await sendMessageStreamWithRetry(aiClient, {
            model: MODEL_NAME,
            systemInstruction: finalSystemPrompt,
            contents: [...history, { role: 'user', parts: [{ text: lastMessageContent }] }],
            config: { tools: tools }
        });

        const processFilter = createThinkingFilter();
        for await (const chunk of streamResult.stream) {
            const text = chunk.text;
            if (text) {
                const safeText = processFilter(text);
                if (safeText) res.write(safeText);
            }
        }

        const fullResponse = await streamResult.response;
        const functionCalls = fullResponse.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            if (call) {
                let functionResponseContent = "";
                if (call.name === 'get_client_guidelines') {
                    functionResponseContent = await getClientGuidelines(call.args?.identifier);
                } else if (call.name === 'search_cloud_storage') {
                    const toolOutput = await searchCloudStorage(call.args?.query);
                    functionResponseContent = toolOutput.text;
                } else if (call.name === 'analyze_website_dna') {
                    functionResponseContent = await analyzeWebsiteDna(call.args?.url);
                }

                if (functionResponseContent) {
                    const streamResult2 = await sendMessageStreamWithRetry(aiClient, {
                        model: MODEL_NAME,
                        systemInstruction: finalSystemPrompt,
                        contents: [
                            ...history,
                            { role: 'user', parts: [{ text: lastMessageContent }] },
                            fullResponse.candidates[0].content,
                            {
                                role: 'user',
                                parts: [{
                                    functionResponse: {
                                        name: call.name,
                                        response: { content: functionResponseContent }
                                    }
                                }]
                            }
                        ],
                        config: { tools: tools }
                    });

                    const processFilter2 = createThinkingFilter();
                    for await (const chunk of streamResult2.stream) {
                        const text = chunk.text;
                        if (text) {
                            const safeText = processFilter2(text);
                            if (safeText) res.write(safeText);
                        }
                    }
                }
            }
        }
        res.end();
    } catch (error) {
        console.error("Error in handleChat:", error);
        if (!res.headersSent) {
            res.status(500).write(`Error: ${error.message}`);
        }
        res.end();
    }
};
