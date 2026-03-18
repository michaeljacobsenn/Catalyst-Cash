import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderGuideHtml } from "../src/modules/guides/renderGuideHtml.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

await mkdir(publicDir, { recursive: true });

await Promise.all([
  writeFile(path.join(publicDir, "CatalystCash-Guide-Free.html"), renderGuideHtml("free")),
  writeFile(path.join(publicDir, "CatalystCash-Guide-Pro.html"), renderGuideHtml("pro")),
]);

console.log("Generated in-app guides:", "CatalystCash-Guide-Free.html", "CatalystCash-Guide-Pro.html");
