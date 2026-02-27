const fs = require('fs');

const file = 'src/App.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add context imports
const imports = `import { SecurityProvider, useSecurity } from "./modules/contexts/SecurityContext.jsx";
import { SettingsProvider, useSettings } from "./modules/contexts/SettingsContext.jsx";
import { PortfolioProvider, usePortfolio } from "./modules/contexts/PortfolioContext.jsx";
import { NavigationProvider, useNavigation } from "./modules/contexts/NavigationContext.jsx";
import { AuditProvider, useAudit } from "./modules/contexts/AuditContext.jsx";`;

content = content.replace(
    'import SetupWizard from "./modules/tabs/SetupWizard.jsx";',
    'import SetupWizard from "./modules/tabs/SetupWizard.jsx";\n' + imports
);

// 2. Wrap AppRoot
const wrappedRoot = `export default function AppRoot() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <SecurityProvider>
          <PortfolioProvider>
            <NavigationProvider>
              <AuditProvider>
                <CatalystCash />
              </AuditProvider>
            </NavigationProvider>
          </PortfolioProvider>
        </SecurityProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}`;
content = content.replace(
    /export default function AppRoot\(\) {[\s\S]*?}/,
    wrappedRoot
);

// 3. Replace state block inside CatalystCash
const contextHooks = `function CatalystCash() {
  const toast = useToast();
  const online = useOnline();

  const { requireAuth, setRequireAuth, appPasscode, setAppPasscode, useFaceId, setUseFaceId, isLocked, setIsLocked, privacyMode, setPrivacyMode, lockTimeout, setLockTimeout, appleLinkedId, setAppleLinkedId, isSecurityReady } = useSecurity();
  const { apiKey, setApiKey, aiProvider, setAiProvider, aiModel, setAiModel, persona, setPersona, personalRules, setPersonalRules, autoBackupInterval, setAutoBackupInterval, notifPermission, aiConsent, setAiConsent, showAiConsent, setShowAiConsent, financialConfig, setFinancialConfig, isSettingsReady } = useSettings();
  const { cards, setCards, bankAccounts, setBankAccounts, renewals, setRenewals, cardCatalog, badges, cardAnnualFees, isPortfolioReady } = usePortfolio();
  const { current, setCurrent, history, setHistory, moveChecks, setMoveChecks, loading, error, setError, useStreaming, setUseStreaming, streamText, elapsed, viewing, setViewing, trendContext, instructionHash, setInstructionHash, handleSubmit, handleCancelAudit, clearAll, deleteHistoryItem, isAuditReady } = useAudit();
  const { tab, setTab, navTo, resultsBackTarget, setResultsBackTarget, setupReturnTab, setSetupReturnTab, onboardingComplete, setOnboardingComplete, showGuide, setShowGuide, inputMounted, lastCenterTab, inputBackTarget } = useNavigation();

  const ready = isSecurityReady && isSettingsReady && isPortfolioReady && isAuditReady;
`;

// Find where CatalystCash starts
const catalystCashStart = content.indexOf('function CatalystCash() {');
const marketPricesStart = content.indexOf('const [marketPrices, setMarketPrices] = useState({});');

if (catalystCashStart !== -1 && marketPricesStart !== -1) {
    content = content.slice(0, catalystCashStart) +
        contextHooks +
        content.slice(marketPricesStart);
}


// Delete handleCancelAudit
const hcaStart = content.indexOf('const handleCancelAudit = () => {');
if (hcaStart !== -1) {
    const hcaEnd = content.indexOf('};', hcaStart) + 2;
    content = content.slice(0, hcaStart) + content.slice(hcaEnd);
}

// Delete applyContributionAutoUpdate and handleSubmit
const applyStart = content.indexOf('const applyContributionAutoUpdate = (parsed, rawText) => {');
if (applyStart !== -1) {
    const hsMatch = content.indexOf('const handleSubmit = async (msg, formData, testMode = false, manualResultText = null) => {', applyStart);
    if (hsMatch !== -1) {
        const fnEndMatch = content.indexOf('finally { setLoading(false); setStreamText(""); clearInterval(timerRef.current); abortRef.current = null; }\n  };', hsMatch);
        if (fnEndMatch !== -1) {
            content = content.slice(0, applyStart) + content.slice(fnEndMatch + 112);
        }
    }
}

// Delete deleteHistoryItem
const dhiStart = content.indexOf('const deleteHistoryItem = async (auditToDelete) => {');
if (dhiStart !== -1) {
    const dhiEnd = content.indexOf('toast.success("Audit deleted");\n  };', dhiStart);
    if (dhiEnd !== -1) content = content.slice(0, dhiStart) + content.slice(dhiEnd + 37);
}

// Delete clearAll
const caStart = content.indexOf('const clearAll = async () => {');
if (caStart !== -1) {
    const caEnd = content.indexOf('haptic.warning();\n  };', caStart);
    if (caEnd !== -1) content = content.slice(0, caStart) + content.slice(caEnd + 22);
}

// Remove `const [isTest, setIsTest] = useState(false);`
content = content.replace('const [isTest, setIsTest] = useState(false);', '');

// Update `isResetting` logic. Wait, this text exactly: "const factoryReset = async () => {"
content = content.replace(
    'const factoryReset = async () => {',
    'const [isResetting, setIsResetting] = useState(false);\n  const factoryReset = async () => {'
);


fs.writeFileSync('src/App.jsx', content);
console.log('App.jsx refactored successfully.');
