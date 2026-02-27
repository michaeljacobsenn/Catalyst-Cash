const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("Starting lightweight check for undefined variables in React components...");

// Use grep to find all defined variables and compare against usages
// Note: Building a full AST parser from scratch is overkill and error-prone.
// Let's do a smart regex pass specifically looking for dropped props from the recent Context extractions.

const srcPath = path.join(__dirname, 'src');
const filesContent = execSync(`find src -type f -name "*.jsx" -o -name "*.js" | xargs cat`).toString();

// List of all extracted props from the recent Context refactor (based on App.jsx state that was removed)
const potentialLostVars = [
    'scrollRef', 'showQuickMenu', 'proEnabled', 'bottomNavRef', 'topBarRef',
    'isLocked', 'privacyMode', 'appPasscode', 'appleLinkedId',
    'apiKey', 'aiProvider', 'persona', 'personalRules', 'notifPermission',
    'cards', 'bankAccounts', 'renewals', 'cardCatalog', 'badges',
    'current', 'history', 'loading', 'error', 'streamText',
    'tab', 'showGuide', 'inputMounted'
];

let foundErrors = false;

// Scan each file to see if it *uses* a variable but *does not* import it or receive it as a prop
execSync(`find src -type f -name "*.jsx" -o -name "*.js"`).toString().split('\n').filter(Boolean).forEach(file => {
    const content = fs.readFileSync(file, 'utf8');

    potentialLostVars.forEach(v => {
        // If the variable is used in the file
        const regexUsed = new RegExp(`\\b${v}\\b`);
        if (regexUsed.test(content)) {
            // Check if it's defined (let, const, var, function, prop, import)
            const isDefined = new RegExp(`(const|let|var|function).*?\\b${v}\\b`).test(content) ||
                new RegExp(`import.*?\\b${v}\\b`).test(content) ||
                new RegExp(`\\{.*?\\b${v}\\b.*?\\}`).test(content); // Object destructuring / props

            if (!isDefined) {
                console.log(`WARNING: Potential undefined variable '${v}' found in ${file}`);
                foundErrors = true;
            }
        }
    });
});

if (!foundErrors) {
    console.log("✅ No obvious missing variable references detected among the commonly extracted context states.");
}
