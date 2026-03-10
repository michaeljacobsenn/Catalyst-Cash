const fs = require('fs');

try {
    const content = fs.readFileSync('CatalystCash_CloudSync.json', 'utf8');
    console.log("File loaded. Length:", content.length);
    const data = JSON.parse(content);
    console.log("Parse successful. Keys:", Object.keys(data));
    console.log("v:", data.v);
    console.log("isEncrypted:", !!data.ct);
} catch (e) {
    console.error("Error reading or parsing:", e);
}
