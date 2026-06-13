import * as cheerio from 'cheerio';

export async function analyzeWebsiteDna(url) {
    console.log(`[Audit] Starting DNA analysis for: ${url}`);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Brainstudio-Intelligence-Bot/1.0 (Audit)'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch URL. Status: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const title = $('title').text().trim() || "Sin título";
        const description = $('meta[name="description"]').attr('content') ||
                            $('meta[property="og:description"]').attr('content') ||
                            "Sin descripción";

        const h1s = [];
        $('h1').each((i, el) => {
            const text = $(el).text().trim();
            if (text) h1s.push(text);
        });

        const colorRegex = /#([0-9a-fA-F]{6})\b/g;
        const colorMatches = html.match(colorRegex) || [];

        const colorCounts = {};
        for (const color of colorMatches) {
            const normalized = color.toLowerCase();
            colorCounts[normalized] = (colorCounts[normalized] || 0) + 1;
        }

        const topColors = Object.entries(colorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([color, count]) => `${color} (${count})`);

        return JSON.stringify({
            url: url,
            status: "Success",
            technical: {
                title: title,
                meta_description: description,
                h1_tags: h1s
            },
            branding_dna: {
                top_colors_detected: topColors.length > 0 ? topColors : ["None detected"]
            }
        }, null, 2);

    } catch (error) {
        console.error(`[Audit] Error analyzing ${url}:`, error.message);
        return JSON.stringify({
            url: url,
            status: "Error",
            error: error.message
        });
    }
}
