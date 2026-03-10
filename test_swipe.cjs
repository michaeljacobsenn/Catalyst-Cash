const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
    const browser = await chromium.launch({ headless: true });
    // Emulate iPhone 15 Pro Max
    const context = await browser.newContext({
        viewport: { width: 430, height: 932 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        hasTouch: true,
        isMobile: true
    });

    const page = await context.newPage();

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

    await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

    try {
        await page.waitForSelector(".snap-container", { timeout: 10000 });
        console.log("App loaded successfully.");
    } catch (e) {
        console.error("App failed to load.");
        process.exit(1);
    }

    await page.waitForTimeout(1000);

    const snapContainer = page.locator('.snap-container');
    const startScrollLeft = await snapContainer.evaluate(node => node.scrollLeft);
    console.log("Initial Scroll Left:", startScrollLeft);

    console.log("Initiating touch drag swipe left...");

    await page.mouse.move(350, 500);
    await page.mouse.down();

    await page.waitForTimeout(50);
    await page.mouse.move(250, 500, { steps: 20 });
    await page.waitForTimeout(50);
    await page.mouse.move(150, 500, { steps: 20 });
    await page.waitForTimeout(50);
    await page.mouse.move(50, 500, { steps: 20 });
    await page.waitForTimeout(50);

    console.log("Releasing touch to trigger scroll-snap physics...");
    await page.mouse.up();

    await page.waitForTimeout(1000);

    const finalScrollLeft = await snapContainer.evaluate(node => node.scrollLeft);
    console.log("Final Scroll Left:", finalScrollLeft);

    const url = await page.evaluate(() => window.location.href);
    console.log("Current URL/History state:", url);

    await browser.close();
})();
