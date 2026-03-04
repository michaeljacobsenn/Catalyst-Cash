const Jimp = require('jimp');

async function buildOpaqueIcon() {
    const iconInput = "/Users/michaeljacobsen/.gemini/antigravity/brain/5b885c5b-b617-4acc-9368-8842e6d6aac7/media__1772516497517.png";
    console.log("Loading optimized Glass PNG for iOS App Icon generation...");

    // Read the user's raw icon
    const rawIcon = await Jimp.read(iconInput);

    // Create a 1024x1024 canvas with the EXACT #0C121B hex background
    const opaqueCanvas = new Jimp(1024, 1024, Jimp.rgbaToInt(12, 18, 27, 255));

    // Scale the neon logo up to fill the canvas edge-to-edge
    const logoLayer = rawIcon.clone().resize(1024, 1024, Jimp.RESIZE_BICUBIC);

    // Composite the logo over the exact #0C121B background.
    // This physically destroys the transparency so iOS doesn't automatically 
    // fill the alpha channels with its default pure black (#000000).
    opaqueCanvas.composite(logoLayer, 0, 0);

    const outPath = "/Users/michaeljacobsen/Desktop/PortfolioPro Public/assets/icon.png";
    console.log(`Overwriting the base Capacitor icon payload...`);
    await opaqueCanvas.writeAsync(outPath);

    console.log("App Icon forced to opaque #0C121B successfully.");
}

buildOpaqueIcon().catch(console.error);
