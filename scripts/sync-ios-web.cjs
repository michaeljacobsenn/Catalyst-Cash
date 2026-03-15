#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const iosAppDir = path.join(root, "ios", "App", "App");
const iosPublicDir = path.join(iosAppDir, "public");
const capacitorConfigSrc = path.join(root, "capacitor.config.json");
const capacitorConfigDest = path.join(iosAppDir, "capacitor.config.json");

if (!fs.existsSync(distDir)) {
  console.error("❌ dist/ does not exist. Run the web build first.");
  process.exit(1);
}

fs.rmSync(iosPublicDir, { recursive: true, force: true });
fs.mkdirSync(iosPublicDir, { recursive: true });
fs.cpSync(distDir, iosPublicDir, { recursive: true });

if (fs.existsSync(capacitorConfigSrc)) {
  fs.copyFileSync(capacitorConfigSrc, capacitorConfigDest);
}

console.log("✅ Copied dist/ to ios/App/App/public");
console.log("✅ Updated ios/App/App/capacitor.config.json");
