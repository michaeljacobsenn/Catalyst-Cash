const Jimp = require('jimp');
const fs = require('fs');

async function processIcon() {
    console.log("Loading user's provided transparent icon...");
    const image = await Jimp.read('/Users/michaeljacobsen/.gemini/antigravity/brain/fbafa8bd-eaf8-4795-9540-281d98dae2e1/media__1772162224052.png');

    const w = image.bitmap.width;
    const h = image.bitmap.height;

    let minX = w, minY = h, maxX = 0, maxY = 0;

    // Find bounding box for non-transparent pixels
    image.scan(0, 0, w, h, function (x, y, idx) {
        const a = this.bitmap.data[idx + 3];
        if (a > 10) { // Not transparent
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    });

    if (minX > maxX || minY > maxY) {
        console.log("Completely transparent image?");
        minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
    }

    console.log(`Bounding box: x=${minX}, y=${minY}, w=${maxX - minX + 1}, h=${maxY - minY + 1}`);

    // Crop it to the actual logo bounds
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const logo = image.clone().crop(minX, minY, cropW, cropH);

    // The App Store icon MUST NOT contain transparent pixels
    // Create new 1024x1024 solid dark background (matching the app's aesthetic)
    const bg1024 = new Jimp(1024, 1024, '#0D1117');

    // Since App Store crops into a squircle, we should size the logo so it fills
    // the bounds edge-to-edge if it's already a squircle, or leave a slight padding if it's a glyph.
    // Assuming the user's icon is the bounding box of a squircle, we want it to be 1024x1024
    logo.resize(1024, 1024, Jimp.RESIZE_BICUBIC);

    bg1024.composite(logo, 0, 0);

    await bg1024.writeAsync('public/AppStoreIcon-1024.png');
    console.log("Created AppStoreIcon-1024.png");

    await bg1024.clone().resize(512, 512, Jimp.RESIZE_BICUBIC).writeAsync('public/icon-512.png');
    await bg1024.clone().resize(192, 192, Jimp.RESIZE_BICUBIC).writeAsync('public/icon-192.png');
    await bg1024.clone().resize(180, 180, Jimp.RESIZE_BICUBIC).writeAsync('public/apple-touch-icon.png');
    await bg1024.clone().resize(180, 180, Jimp.RESIZE_BICUBIC).writeAsync('public/icon-apple-touch.png');

    console.log("Successfully processed all icons!");
}

processIcon().catch(console.error);
