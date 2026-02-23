#!/usr/bin/env node
/**
 * Post-sync script: ensures local native plugins are registered
 * in capacitor.config.json's packageClassList.
 *
 * Run after every `npx cap sync ios`:
 *   node scripts/inject-local-plugins.js
 *
 * Or automatically via the npm "build:ios" script.
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'ios', 'App', 'App', 'capacitor.config.json');
const LOCAL_PLUGINS = ['FaceIdPlugin', 'PdfViewerPlugin']; // ObjC runtime names of local plugins

try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const classList = config.packageClassList || [];
    let changed = false;

    for (const plugin of LOCAL_PLUGINS) {
        if (!classList.includes(plugin)) {
            classList.push(plugin);
            changed = true;
            console.log(`✅ Added "${plugin}" to packageClassList`);
        }
    }

    if (changed) {
        config.packageClassList = classList;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
        console.log('📝 Updated capacitor.config.json');
    } else {
        console.log('✅ All local plugins already registered');
    }
} catch (e) {
    console.error('❌ Failed to inject local plugins:', e.message);
    process.exit(1);
}
