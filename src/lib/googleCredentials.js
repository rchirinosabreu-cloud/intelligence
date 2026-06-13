let credentials;
try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        if (credentials && credentials.private_key) {
            // Sanitize private key: replace literal \n with actual newlines
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
        console.log("Credentials parsed and sanitized successfully for project:", credentials?.project_id);
    } else {
        console.error("CRITICAL: GOOGLE_APPLICATION_CREDENTIALS_JSON is missing");
    }
} catch (e) {
    console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON", e);
}

export default credentials;
