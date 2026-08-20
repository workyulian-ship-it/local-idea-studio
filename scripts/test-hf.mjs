import { hfSearch, hfGetFiles } from "../dist-electron/huggingface.js";
import os from "node:os";
import path from "node:path";

const cacheDir = path.join(os.tmpdir(), "lumen-studio-hf-test-cache");

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit > 1 ? 2 : 0)} ${units[unit]}`;
}

(async () => {
  try {
    console.log("Searching HF for GGUF models...");
    const r = await hfSearch({ query: "llama-3.1", limit: 5 }, cacheDir);
    console.log(`Found ${r.items?.length ?? 0} models; next page: ${r.nextCursor ? "yes" : "no"}`);
    for (const m of (r.items ?? []).slice(0, 5)) {
      console.log(`  - ${m.id}  (${m.downloads} dl, ${m.likes} likes)`);
    }
    if (r.items && r.items[0]) {
      console.log(`\nListing files for ${r.items[0].id}...`);
      const files = await hfGetFiles(r.items[0].id, cacheDir);
      const allGguf = files.filter((f) => /\.gguf$/i.test(f.rfilename));
      const gguf = allGguf.slice(0, 10);
      console.log(`GGUF files:`);
      for (const f of gguf) {
        console.log(`  - ${f.rfilename}  (${f.quantization ?? "?"}, ${formatBytes(f.size)})`);
      }
      if (allGguf.length && !allGguf.some((file) => Number.isFinite(file.size))) {
        throw new Error("Hugging Face returned GGUF files without any usable sizes");
      }
    }
  } catch (e) {
    console.error("FAILED:", e?.message ?? e);
    process.exit(1);
  }
})();
