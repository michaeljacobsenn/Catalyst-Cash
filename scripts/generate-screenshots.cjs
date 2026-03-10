const path = require('path');
const fs = require('fs');

async function main() {
    let chromium;
    try {
        const pw = require('@playwright/test');
        chromium = pw.chromium;
    } catch (e) {
        console.error("Playwright test is not installed. Run 'npx playwright install chromium' first.");
        const playwright = require('playwright');
        chromium = playwright.chromium;
    }

    const BASE_URL = 'http://localhost:5173';
    const OUTPUT_DIR = path.join(__dirname, '..', 'app-store-screenshots');

    const DEVICES = [
        { name: '6.5-inch', width: 1284, height: 2778 },
        { name: '5.5-inch', width: 1242, height: 2208 }
    ];

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR);
    }

    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });

    for (const device of DEVICES) {
        console.log(`\n📸 Generating screenshots for ${device.name}...`);
        const deviceDir = path.join(OUTPUT_DIR, device.name);
        if (!fs.existsSync(deviceDir)) {
            fs.mkdirSync(deviceDir);
        }

        const context = await browser.newContext({
            viewport: { width: device.width, height: device.height },
            deviceScaleFactor: 1,
            isMobile: true,
            hasTouch: true,
        });

        const page = await context.newPage();

        try {
            console.log(`Navigating to ${BASE_URL}...`);
            await page.goto(BASE_URL, { waitUntil: 'networkidle' });

            // 1. Instantly bypass the onboarding wizard via explicit localStorage injection
            console.log("Bypassing onboarding wizard...");
            await page.evaluate(() => {
                localStorage.setItem('CapacitorStorage.onboarding-complete', 'true');
                localStorage.setItem('onboarding-complete', 'true');
            });

            // Reload into the main application (EmptyDashboard)
            await page.reload({ waitUntil: 'networkidle' });

            // 2. Click the empty state demo trigger to populate all the arrays and histories for screenshots
            console.log("Injecting rich demo data...");
            try {
                const demoBtn = page.locator('button', { hasText: 'Try Demo Audit ✨' }).first();
                await demoBtn.waitFor({ state: 'visible', timeout: 5000 });
                await demoBtn.click({ force: true });
                await page.waitForTimeout(2500); // Allow synthetic history arrays to settle and rerender
            } catch (e) {
                console.log("Could not find or click the 'Try Demo Audit' button.", e.message);
            }

            // Ensure app is fully loaded by waiting for the bottom navigation
            await page.waitForSelector('nav button', { state: 'attached', timeout: 15000 });

            // 1. Dashboard
            await page.waitForTimeout(2000);
            await page.screenshot({ path: path.join(deviceDir, '1-Dashboard.png') });
            console.log("✓ Dashboard screenshot saved.");

            // 2. Chat
            try {
                await page.locator('nav button').nth(1).click({ force: true });
                await page.waitForTimeout(1500);
                await page.screenshot({ path: path.join(deviceDir, '2-AIChat.png') });
                console.log("✓ AI Chat screenshot saved.");
            } catch (e) {
                console.log("Failed to click 'Ask AI'", e.message);
            }

            // 3. Portfolio
            try {
                await page.locator('nav button').nth(4).click({ force: true });
                await page.waitForTimeout(1500);
                await page.screenshot({ path: path.join(deviceDir, '3-Portfolio.png') });
                console.log("✓ Portfolio screenshot saved.");
            } catch (e) {
                console.log("Failed to click 'Accounts'", e.message);
            }

            // 4. Expenses
            try {
                await page.locator('nav button').nth(3).click({ force: true });
                await page.waitForTimeout(1500);
                await page.screenshot({ path: path.join(deviceDir, '4-Expenses.png') });
                console.log("✓ Expenses screenshot saved.");
            } catch (e) {
                console.log("Failed to click 'Expenses'", e.message);
            }

            // 5. Audit
            try {
                await page.locator('nav button').nth(0).click({ force: true });
                await page.waitForTimeout(1500);
                await page.screenshot({ path: path.join(deviceDir, '5-Audit.png') });
                console.log("✓ Audit scanner screenshot saved.");
            } catch (e) {
                console.log("Failed to click 'Audit'", e.message);
            }

        } catch (e) {
            console.log(`Failed to capture ${device.name}:`, e.message);
        } finally {
            await context.close();
        }
    }

    await browser.close();
    console.log(`\n🎉 All screenshots generated efficiently in ./app-store-screenshots/`);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
