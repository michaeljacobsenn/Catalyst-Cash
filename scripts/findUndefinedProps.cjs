const fs = require('fs');
const execSync = require('child_process').execSync;

let hasErrors = false;

// We're specifically looking for places in App.jsx where a prop is passed, but the variable doesn't exist
const appContent = fs.readFileSync('src/App.jsx', 'utf8');

// The known removed states from App.jsx:
const removedStates = [
    'proEnabled', 'showQuickMenu', 'cards', 'bankAccounts', 'renewals',
    'cardCatalog', 'badges', 'current', 'history', 'loading', 'error',
    'streamText', 'tab', 'apiKey', 'aiProvider', 'persona', 'personalRules',
    'notifPermission', 'isLocked', 'privacyMode', 'appPasscode', 'appleLinkedId'
];

removedStates.forEach(v => {
   // Check if the variable is still being injected as a prop into a Component like `<Component foo={bar} />`
   // Specifically looking for `<Component someProp={v}` or `<Component {...v}`
   const propRegex = new RegExp(`=\\{${v}\\}|\\{...${v}\\}`);
   if(propRegex.test(appContent)) {
       // if it's passed as a prop, ensure it's actually defined somewhere via const/let/destructuring
       const isDefined = new RegExp(`(?:const|let|var).*?\\b${v}\\b`).test(appContent) || 
                         new RegExp(`\\{.*?\\b${v}\\b.*?\\}\\s*=\\s*use[A-Z]`).test(appContent) ||
                         new RegExp(`\\[.*?\\b${v}\\b.*?\\]\\s*=\\s*useState`).test(appContent);
                         
       if (!isDefined) {
           console.log(`❌ DANGER: App.jsx passes prop '{${v}}' but it is NEVER defined!`);
           hasErrors = true;
       }
   }
});

if (!hasErrors) { console.log('✅ Passed deep prop-injection analysis for App.jsx.'); }
