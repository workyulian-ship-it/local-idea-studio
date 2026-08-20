import path from "path";
import fs from "fs";

const HF_API = "https://huggingface.co/api";

export interface HfSearchResult {
  id: string;
  author?: string;
  downloads: number;
  likes: number;
  ggufFileCount?: number;
  tags?: string[];
  lastModified?: string;
  pipeline_tag?: string;
}

export interface HfModelDetail extends HfSearchResult {
  siblings?: HfFile[];
  cardData?: any;
  description?: string;
}

export interface HfFile {
  rfilename: string;
  size?: number;
  quantization?: string;
}

export interface HfSearchQuery {
  query?: string;
  author?: string;
  limit?: number;
  cursor?: string;
  ggufOnly?: boolean;
}

const cacheFile = (cacheDir: string, key: string) =>
  path.join(cacheDir, `hf-${key.replace(/[^\w.-]/g, "_")}.json`);

async function readCache<T>(cacheDir: string, key: string): Promise<T | null> {
  try {
    const f = cacheFile(cacheDir, key);
    if (fs.existsSync(f)) {
      const stat = fs.statSync(f);
      if (Date.now() - stat.mtimeMs < 1000 * 60 * 10) {
        return JSON.parse(fs.readFileSync(f, "utf-8")) as T;
      }
    }
  } catch {}
  return null;
}

async function writeCache(cacheDir: string, key: string, data: unknown) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile(cacheDir, key), JSON.stringify(data));
  } catch {}
}

function hfHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "LocalIdeaStudio/0.1.4",
    Accept: "application/json",
  };
  if (token?.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  return headers;
}

async function fetchJson<T = any>(url: string, token?: string): Promise<T> {
  return (await fetchJsonResponse<T>(url, token)).data;
}

async function fetchJsonResponse<T = any>(
  url: string,
  token?: string
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(url, { headers: hfHeaders(token), redirect: "follow" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const hint =
      res.status === 401 || res.status === 403
        ? " Add a Hugging Face token in Settings if this is a gated/private model."
        : "";
    throw new Error(`Hugging Face HTTP ${res.status} (${url}): ${text.slice(0, 200) || res.statusText}.${hint}`);
  }
  return { data: (await res.json()) as T, headers: res.headers };
}

const QUANT_KEYS = [
  "IQ1_S",
  "IQ1_M",
  "IQ2_XXS",
  "IQ2_XS",
  "IQ2_S",
  "IQ2_M",
  "IQ3_XXS",
  "IQ3_XS",
  "IQ3_S",
  "IQ3_M",
  "IQ3_L",
  "IQ4_NL",
  "IQ4_XS",
  "Q2_K_L",
  "Q2_K_S",
  "Q2_K",
  "Q3_K_XL",
  "Q3_K_L",
  "Q3_K_M",
  "Q3_K_S",
  "Q3_K",
  "Q4_K_M",
  "Q4_K_S",
  "Q4_K_L",
  "Q4_K",
  "Q4_0_4_4",
  "Q4_0_8_8",
  "Q4_0_4_8",
  "Q4_0",
  "Q4_1",
  "Q5_K_M",
  "Q5_K_S",
  "Q5_K_L",
  "Q5_K",
  "Q5_0",
  "Q5_1",
  "Q6_K_L",
  "Q6_K",
  "Q6_0",
  "Q8_0",
  "Q8_1",
  "Q8_K",
  "FP16",
  "FP32",
  "F16",
  "F32",
  "BF16",
];

function detectQuant(name: string): string | undefined {
  const n = name.toUpperCase();
  let best: string | undefined;
  for (const q of QUANT_KEYS) {
    if (n.includes(q) && (!best || q.length > best.length)) best = q;
  }
  return best;
}

/** Accepts free text, org/name, or a huggingface.co / hf.co URL. */
export function parseHfQuery(raw?: string): { search?: string; repoId?: string } {
  if (!raw) return {};
  const q = raw.trim();
  if (!q) return {};

  const urlMatch = q.match(
    /(?:https?:\/\/)?(?:www\.)?(?:huggingface\.co|hf\.co)\/+([\w.-]+)\/+([\w.-]+)/i
  );
  if (urlMatch) return { repoId: `${urlMatch[1]}/${urlMatch[2]}`, search: `${urlMatch[1]}/${urlMatch[2]}` };

  if (/^[\w.-]+\/[\w.-]+$/.test(q)) return { repoId: q, search: q };
  return { search: q };
}

function mapSearchItem(m: any): HfSearchResult {
  const siblings = Array.isArray(m.siblings) ? m.siblings : [];
  return {
    id: m.id ?? m.modelId,
    author: m.author,
    downloads: m.downloads ?? 0,
    likes: m.likes ?? 0,
    ggufFileCount: siblings.length
      ? siblings.filter((s: any) => /\.gguf$/i.test(s.rfilename ?? s.path ?? "")).length
      : undefined,
    tags: m.tags,
    lastModified: m.lastModified,
    pipeline_tag: m.pipeline_tag,
  };
}

async function listModels(
  q: { search?: string; author?: string; limit: number; cursor?: string; filter?: string },
  token?: string
): Promise<{ items: HfSearchResult[]; nextCursor?: string }> {
  const params = new URLSearchParams();
  params.set("limit", String(q.limit));
  if (q.search) params.set("search", q.search);
  if (q.author) params.set("author", q.author);
  if (q.filter) params.set("filter", q.filter);
  params.set("sort", "downloads");
  params.set("direction", "-1");
  if (q.cursor) params.set("cursor", q.cursor);
  const url = `${HF_API}/models?${params.toString()}`;
  const { data, headers } = await fetchJsonResponse<any[]>(url, token);
  const link = headers.get("link") ?? "";
  const nextUrl = link
    .split(",")
    .map((part) => part.trim())
    .find((part) => /;\s*rel="next"/i.test(part))
    ?.match(/^<([^>]+)>/)?.[1];
  const nextCursor = nextUrl ? new URL(nextUrl).searchParams.get("cursor") ?? undefined : undefined;
  return {
    items: (Array.isArray(data) ? data : []).map(mapSearchItem).filter((m) => m.id),
    nextCursor,
  };
}

export async function hfSearch(
  q: HfSearchQuery,
  cacheDir: string,
  token?: string
): Promise<{ items: HfSearchResult[]; nextCursor?: string }> {
  const limit = q.limit ?? 30;
  const parsed = parseHfQuery(q.query);
  const ggufOnly = q.ggufOnly !== false;
  const cacheKey = `search-v3-${parsed.search ?? ""}-${parsed.repoId ?? ""}-${q.author ?? ""}-${q.cursor ?? ""}-${limit}-${ggufOnly ? "gguf" : "all"}`;
  const cached = await readCache<{ items: HfSearchResult[]; nextCursor?: string }>(cacheDir, cacheKey);
  if (cached) return cached;

  const items: HfSearchResult[] = [];
  const seen = new Set<string>();
  let nextCursor: string | undefined;

  const push = (m: HfSearchResult | null | undefined) => {
    if (!m?.id || seen.has(m.id)) return;
    seen.add(m.id);
    items.push(m);
  };

  if (parsed.repoId) {
    try {
      push(await hfGetModel(parsed.repoId, cacheDir, token));
    } catch {
      // Repo may not exist; still run a text search.
    }
  }

  const searchTerm = parsed.search;
  if (searchTerm || q.author || !parsed.repoId) {
    let listed = await listModels(
      {
        search: searchTerm,
        author: q.author,
        limit,
        cursor: q.cursor,
        filter: ggufOnly ? "gguf" : undefined,
      },
      token
    );
    if (ggufOnly && listed.items.length === 0 && searchTerm) {
      listed = await listModels(
        { search: searchTerm, author: q.author, limit, cursor: q.cursor },
        token
      );
    }
    nextCursor = listed.nextCursor;
    for (const m of listed.items) push(m);
  }

  const result = { items, nextCursor };
  await writeCache(cacheDir, cacheKey, result);
  return result;
}

export async function hfGetModel(id: string, cacheDir: string, token?: string): Promise<HfModelDetail> {
  const cacheKey = `model-v3-${id}`;
  const cached = await readCache<HfModelDetail>(cacheDir, cacheKey);
  if (cached) return cached;
  const safeId = id.replace(/[^A-Za-z0-9._/-]/g, "");
  const url = `${HF_API}/models/${safeId}?blobs=true`;
  const data = await fetchJson<any>(url, token);
  const siblings: HfFile[] = (Array.isArray(data.siblings) ? data.siblings : []).map((s: any) => ({
    rfilename: s.rfilename,
    size: typeof s.size === "number" ? s.size : s.lfs?.size,
    quantization: detectQuant(s.rfilename ?? ""),
  }));
  const detail: HfModelDetail = {
    id: data.id ?? safeId,
    author: data.author,
    downloads: data.downloads ?? 0,
    likes: data.likes ?? 0,
    tags: data.tags,
    lastModified: data.lastModified,
    pipeline_tag: data.pipeline_tag,
    ggufFileCount: siblings.filter((s) => /\.gguf$/i.test(s.rfilename)).length,
    siblings,
    cardData: data.cardData,
    description: data.cardData?.description,
  };
  await writeCache(cacheDir, cacheKey, detail);
  return detail;
}

export async function hfGetFiles(id: string, cacheDir: string, token?: string): Promise<HfFile[]> {
  const cacheKey = `files-v3-${id}`;
  const cached = await readCache<HfFile[]>(cacheDir, cacheKey);
  if (cached) return cached;

  const safeId = id.replace(/[^A-Za-z0-9._/-]/g, "");

  // 1. Model metadata with blobs=true includes exact Git LFS sizes and all sibling names.
  try {
    const detail = await hfGetModel(id, cacheDir, token);
    const files = (detail.siblings ?? []).filter((f) =>
      /\.(gguf|bin|safetensors|ggml)$/i.test(f.rfilename)
    );

    if (files.length > 0) {
      await writeCache(cacheDir, cacheKey, files);
      return files;
    }
  } catch (err) {
    console.warn(`HF model metadata failed for ${safeId}, falling back to tree API:`, err);
  }

  // 2. Tree fallback for unusual repositories.
  const treeUrl = `${HF_API}/models/${safeId}/tree/main?recursive=true&expand=true`;
  const tree = await fetchJson<any[]>(treeUrl, token);
  const fallbackFiles: HfFile[] = (Array.isArray(tree) ? tree : [])
    .filter((f) => f.type === "file" && /\.(gguf|bin|safetensors|ggml)$/i.test(f.path))
    .map((f) => ({
      rfilename: f.path,
      size: typeof f.size === "number" ? f.size : f.lfs?.size,
      quantization: detectQuant(f.path),
    }));

  await writeCache(cacheDir, cacheKey, fallbackFiles);
  return fallbackFiles;
}

export { detectQuant };
