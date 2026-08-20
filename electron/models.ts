import path from "path";
import fs from "fs";
import { detectQuant } from "./huggingface.js";

export interface LocalModel {
  id: string;          // stable id, includes relative path
  repoId: string;      // hf-style "author/name"
  filename: string;
  path: string;        // absolute path
  sizeBytes: number;
  quantization?: string;
  format: string;      // gguf, ggml, bin, safetensors
  modifiedAt: number;
}

export async function listLocalModels(modelsDir: string): Promise<LocalModel[]> {
  const out: LocalModel[] = [];
  if (!fs.existsSync(modelsDir)) return out;
  const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subdir = path.join(modelsDir, entry.name);
    const repoId = entry.name.replace("__", "/");
    const pending = [subdir];
    while (pending.length > 0) {
      const currentDir = pending.pop()!;
      const files = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const f of files) {
        const full = path.join(currentDir, f.name);
        if (f.isDirectory()) {
          pending.push(full);
          continue;
        }
        if (!f.isFile()) continue;
        const lower = f.name.toLowerCase();
      let format = "";
      if (lower.endsWith(".gguf")) format = "gguf";
      else if (lower.endsWith(".ggml")) format = "ggml";
      else if (lower.endsWith(".bin")) format = "ggml";
      else if (lower.endsWith(".safetensors")) format = "safetensors";
      else continue;
      const stat = fs.statSync(full);
      const relativeFile = path.relative(subdir, full).split(path.sep).join("/");
      out.push({
        id: `${entry.name}/${relativeFile}`,
        repoId,
        filename: relativeFile,
        path: full,
        sizeBytes: stat.size,
        quantization: detectQuant(f.name),
        format,
        modifiedAt: stat.mtimeMs,
      });
      }
    }
  }
  return out.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function deleteLocalModel(modelsDir: string, id: string) {
  // id is the normalized path relative to modelsDir: `author__repo/path/to/file.gguf`.
  const parts = id.replace(/\\/g, "/").split("/");
  const repoDirName = parts.shift();
  if (!repoDirName || parts.length === 0 || parts.some((part) => !part || part === "." || part === "..")) {
    return false;
  }
  const root = path.resolve(modelsDir);
  const repoRoot = path.resolve(root, repoDirName);
  const filePath = path.resolve(repoRoot, ...parts);
  if (!filePath.startsWith(repoRoot + path.sep)) return false;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    // Remove empty nested folders up to and including the repository folder.
    let dir = path.dirname(filePath);
    while (dir.startsWith(repoRoot) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
      if (dir === repoRoot) break;
      dir = path.dirname(dir);
    }
    return true;
  }
  return false;
}
