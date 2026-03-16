import fs from 'fs';
import path from 'path';

function findMissingHookImports(dir) {
    const files = [];
    function traverse(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            if (entry.isDirectory()) {
                traverse(path.join(currentDir, entry.name));
            } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
                files.push(path.join(currentDir, entry.name));
            }
        }
    }
    traverse(dir);

    const errors = [];
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');

        // Quick heuristic: find all words starting with "use" followed by Capital letter
        const hookRegex = /\b(use[A-Z]\w*)\s*\(/g;
        const hooksUsed = new Set();
        let hookMatch;
        while ((hookMatch = hookRegex.exec(content)) !== null) {
            hooksUsed.add(hookMatch[1]);
        }

        for (const hook of hooksUsed) {
            // Check if it's defined in the file (imported or declared)
            const imported = new RegExp(`import\\s+.*\\b${hook}\\b.*\\s+from`).test(content);
            const declaredFunc = new RegExp(`function\\s+${hook}\\b`).test(content);
            const declaredVar = new RegExp(`(?:const|let|var)\\s+${hook}\\b|${hook}\\s*:`).test(content);
            // Let's ensure if it is used like `useHook()`, it is defined somewhere above.
            // Easiest is to check if the string "hook" exists anywhere else other than its usages.
            // But imported, declaredFunc and declaredVar checks are usually sufficient.

            if (!imported && !declaredFunc && !declaredVar) {
                // Also verify it's not a parameter or destructured variable, which is tougher with regex.
                // Let's just output it to review
                errors.push(`${file.replace(process.cwd() + '/', '')}: ${hook}`);
            }
        }
    }

    if (errors.length > 0) {
        console.log("Potential missing imports for hooks:");
        console.log(errors.join('\n'));
    } else {
        console.log("No missing hook imports detected by regex heuristic.");
    }
}

findMissingHookImports('./src');
