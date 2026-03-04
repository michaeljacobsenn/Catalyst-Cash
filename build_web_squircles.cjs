const Jimp = require('jimp');

async function buildTransparentWebIcons() {
    const iconInput = "/Users/michaeljacobsen/.gemini/antigravity/brain/5b885c5b-b617-4acc-9368-8842e6d6aac7/media__1772516497517.png";
    console.log("Loading optimized Glass PNG to sculpt pure transparent squircles...");

    // Read the non-transparent flat JPEG/PNG
    const rawIcon = await Jimp.read(iconInput);
    const master = rawIcon.clone().resize(1024, 1024, Jimp.RESIZE_BICUBIC);

    const width = master.bitmap.width;
    const height = master.bitmap.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const a = width / 2;
    const b = height / 2;
    const n = 4.5; // Apple Superellipse curve 

    console.log("Carving out absolute Squircle Alpha Mask...");
    master.scan(0, 0, width, height, function (x, y, idx) {
        const nx = Math.abs(x - centerX + 0.5) / a;
        const ny = Math.abs(y - centerY + 0.5) / b;
        const value = Math.pow(nx, n) + Math.pow(ny, n);

        if (value <= 0.95) {
            this.bitmap.data[idx + 3] = 255;
        } else if (value <= 1.0) {
            const remainder = (1.0 - value) / 0.05;
            this.bitmap.data[idx + 3] = Math.max(0, Math.min(255, remainder * 255));
        } else {
            this.bitmap.data[idx + 3] = 0; // Pure transparent corners
        }
    });

    console.log("Exporting mathematically perfect squircle transparent web assets...");

    // We also need to export a specific one for the Twitter PFP that is OPAQUE BLACK
    const blackAvatarCanvas = new Jimp(1024, 1024, Jimp.rgbaToInt(0, 0, 0, 255));
    blackAvatarCanvas.composite(master, 0, 0);
    await blackAvatarCanvas.writeAsync(`/Users/michaeljacobsen/Desktop/PortfolioPro Public/assets/Catalyst-Twitter-PFP.png`);
    console.log("Generated pure pitch-black #000000 Catalyst Twitter Profile Picture.");

    const webSizes = [
        { path: 'public/icon-512.png', size: 512 },
        { path: 'public/icon-192.png', size: 192 },
        { path: 'public/apple-touch-icon.png', size: 180 },
        { path: 'public/favicon.png', size: 64 },
        { path: 'site/icon-512.png', size: 512 },
        { path: 'site/icon-192.png', size: 192 },
        { path: 'site/apple-touch-icon.png', size: 180 },
        { path: 'site/favicon.png', size: 64 },
        { path: 'site/AppStoreIcon-1024.png', size: 1024 },
    ];

    for (const target of webSizes) {
        const cloned = master.clone().resize(target.size, target.size, Jimp.RESIZE_BICUBIC);
        await cloned.writeAsync(`/Users/michaeljacobsen/Desktop/PortfolioPro Public/${target.path}`);
    }

    console.log("All Web icons are now true transparent squircles.");
}

buildTransparentWebIcons().catch(console.error);
