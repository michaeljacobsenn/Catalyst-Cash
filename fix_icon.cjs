const Jimp = require('jimp');
const fs = require('fs');

async function processIcon() {
    console.log("Loading original icon...");
    const image = await Jimp.read('public/icon-512.png');

    const w = image.bitmap.width;
    const h = image.bitmap.height;

    let minX = w, minY = h, maxX = 0, maxY = 0;

    // Find bounding box for non-white pixels
    image.scan(0, 0, w, h, function (x, y, idx) {
        const r = this.bitmap.data[idx + 0];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];
        const a = this.bitmap.data[idx + 3];

        // consider white / transparent as background to trim (add tolerance for compression artifacts)
        if (a > 10 && (r < 252 || g < 252 || b < 252)) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    });

    if (minX > maxX || minY > maxY) {
        console.log("Couldn't find non-white pixels. Image might be completely white or transparent.");
        minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
    }

    console.log(`Bounding box: x=${minX}, y=${minY}, w=${maxX - minX + 1}, h=${maxY - minY + 1}`);

    // Crop the logo
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const logo = image.clone().crop(minX, minY, cropW, cropH);

    // Create new 1024x1024 black background
    const bg1024 = new Jimp(1024, 1024, '#0D1117');

    // Calculate scaling to fit within 750x750 (padding)
    const scale = Math.min(750 / cropW, 750 / cropH);
    logo.resize(cropW * scale, cropH * scale, Jimp.RESIZE_BICUBIC);

    const xPos = Math.round((1024 - logo.bitmap.width) / 2);
    const yPos = Math.round((1024 - logo.bitmap.height) / 2);

    bg1024.composite(logo, xPos, yPos);

    await bg1024.writeAsync('public/AppStoreIcon-1024.png');
    console.log("Created AppStoreIcon-1024.png");

    await bg1024.clone().resize(180, 180, Jimp.RESIZE_BICUBIC).writeAsync('public/icon-apple-touch.png');

    // Check for resources directory since capacitor might use it
    if (fs.existsSync('resources')) {
        await bg1024.clone().writeAsync('resources/icon.png');
        console.log("Overwrote resources/icon.png");
    }

    console.log("Successfully processed all icons!");
}

processIcon().catch(console.error);
