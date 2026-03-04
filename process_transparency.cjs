const Jimp = require('jimp');

async function createTrueTransparentWebIcons() {
    const iconInput = "/Users/michaeljacobsen/.gemini/antigravity/brain/5b885c5b-b617-4acc-9368-8842e6d6aac7/media__1772516497517.png";
    console.log("Loading optimized Glass PNG for absolute transparent extraction...");

    const rawIcon = await Jimp.read(iconInput);
    const master = rawIcon.clone().resize(1024, 1024, Jimp.RESIZE_BICUBIC);

    console.log("Applying aggressive mathematical transparency mask to dark pixels...");
    master.scan(0, 0, master.bitmap.width, master.bitmap.height, function (x, y, idx) {
        const red = this.bitmap.data[idx + 0];
        const green = this.bitmap.data[idx + 1];
        const blue = this.bitmap.data[idx + 2];

        // Calculate luminosity
        const brightness = (red * 0.299) + (green * 0.587) + (blue * 0.114);

        // The previous algorithm allowed a low-opacity blur (up to 60%) to bleed through, 
        // which CSS drop-shadow amplified into a hard square. 
        // We will aggressively drop all dark slate colors to literal 0 alpha.
        if (brightness < 45 && red < 50 && green < 50 && blue < 60) {
            let alphaVal = 0; // Pure transparency

            // tiny antialiasing ramp just for the immediate edge (30 to 45 brightness)
            if (brightness > 30) {
                // scale from 0 to 255 across a very narrow delta of 15 brightness points
                alphaVal = (brightness - 30) * 17;
            }

            this.bitmap.data[idx + 3] = Math.max(0, Math.min(255, alphaVal));
        }
    });

    console.log("Exporting true transparent web assets...");

    // Scale for web formats
    const webSizes = [
        { path: 'public/icon-512.png', size: 512 },
        { path: 'public/icon-192.png', size: 192 },
        { path: 'public/apple-touch-icon.png', size: 180 },
        { path: 'public/favicon.png', size: 64 },
        { path: 'site/icon-512.png', size: 512 },
        { path: 'site/icon-192.png', size: 192 },
        { path: 'site/apple-touch-icon.png', size: 180 },
        { path: 'site/favicon.png', size: 64 },
    ];

    for (const target of webSizes) {
        const cloned = master.clone().resize(target.size, target.size, Jimp.RESIZE_BICUBIC);
        await cloned.writeAsync(`/Users/michaeljacobsen/Desktop/PortfolioPro Public/${target.path}`);
    }

    console.log("Web icons synchronized. Faint background square removed.");
}

createTrueTransparentWebIcons().catch(console.error);
