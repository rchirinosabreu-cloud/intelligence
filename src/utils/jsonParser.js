export const parseJsonFromAiResponse = (responseString) => {
    // 1. Find string between ```json and ```
    // 2. If not found, try to find string between ``` and ```
    // 3. If not found, just use the string as is.
    // 4. Return JSON.parse(str)

    let jsonStr = responseString;

    // Look for ```json ... ```
    const jsonMatch = responseString.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
        jsonStr = jsonMatch[1];
    } else {
        // Look for ``` ... ```
        const genericMatch = responseString.match(/```\s*([\s\S]*?)\s*```/);
        if (genericMatch && genericMatch[1]) {
            jsonStr = genericMatch[1];
        }
    }

    return JSON.parse(jsonStr.trim());
};
