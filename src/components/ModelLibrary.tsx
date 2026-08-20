import { useEffect, useState } from "react";
import { Search, Download, Loader2, HardDrive, Cpu, Star, Folder, ChevronRight, Play, Database } from "lucide-react";
import { useHf, useModels } from "../store/models";
import { useDownloads } from "../store/downloads";
import { useUi } from "../store/ui";
import { cn, formatBytes, formatNumber } from "../lib/utils";
import type { HfFile, HfSearchResult } from "../types";

const POPULAR_QUERIES = ["llama", "mistral", "qwen", "gemma", "phi", "deepseek", "codellama", "command-r"];

export function ModelLibrary() {
  const { query, results, loading, loadingMore, nextCursor, error, setQuery, search, loadMore } = useHf();
  const { local } = useModels();
  const { start } = useDownloads();
  const { pushToast } = useUi();
  const [selected, setSelected] = useState<HfSearchResult | null>(null);

  const totalLocalSize = local.reduce((sum, m) => sum + (m.sizeBytes || 0), 0);

  useEffect(() => {
    search("llama");
  }, []);

  return (
    <div className="model-library-layout flex-1 min-h-0 overflow-hidden">
      {/* ── Left panel: search + results ── */}
      <div className="model-search-panel border-r border-border flex flex-col min-h-0 bg-bg-panel/30">
        {/* Search bar */}
        <div className="p-3 border-b border-border shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-text-dim" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder="Search models or paste org/repo…"
                className="input pl-8"
              />
            </div>
            <button className="btn-primary shrink-0" onClick={() => search()} disabled={loading}>
              Search
            </button>
          </div>
          {/* Popular tags row with horizontal scroll */}
          <div className="flex gap-1 mt-2 overflow-x-auto pb-0.5 no-scrollbar">
            {POPULAR_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuery(q);
                  search(q);
                }}
                className="text-[10px] px-2 py-0.5 rounded-full border border-border text-text-muted hover:bg-bg-hover hover:text-text shrink-0 whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Results list — scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-12 text-text-dim text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching Hugging Face…
            </div>
          )}
          {error && (
            <div className="p-3 text-sm text-danger break-words overflow-hidden max-h-32 overflow-y-auto">
              {error}
            </div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="p-3 text-sm text-text-muted">
              No models found. Try a shorter name, a GGUF repo like <code>bartowski/Llama-3.1-8B-Instruct-GGUF</code>, or paste a Hugging Face URL.
            </div>
          )}
          {!loading &&
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={cn(
                  "w-full text-left p-3 rounded-md border transition-colors overflow-hidden",
                  selected?.id === r.id
                    ? "bg-accent-muted border-accent/40"
                    : "bg-bg-elev border-border hover:bg-bg-hover"
                )}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="text-sm font-medium truncate" title={r.id}>{r.id}</div>
                    <div className="text-[11px] text-text-dim flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="flex items-center gap-1 shrink-0">
                        <Download className="w-3 h-3" /> {formatNumber(r.downloads)}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Star className="w-3 h-3" /> {formatNumber(r.likes)}
                      </span>
                      {r.pipeline_tag && <span className="chip bg-bg-active text-text-muted truncate max-w-[120px]">{r.pipeline_tag}</span>}
                      {typeof r.ggufFileCount === "number" && r.ggufFileCount > 0 && (
                        <span className="flex items-center gap-1 shrink-0">
                          <Database className="w-3 h-3" /> {r.ggufFileCount} GGUF
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-dim mt-1 shrink-0" />
                </div>
              </button>
            ))}
          {!loading && nextCursor && results.length > 0 && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="btn-secondary w-full mt-2 text-xs"
            >
              {loadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {loadingMore ? "Loading more…" : "Load more models"}
            </button>
          )}
        </div>

        {/* Bottom indicator */}
        <div className="px-3 py-2 border-t border-border text-[10px] text-text-dim flex items-center justify-between shrink-0">
          <span>{results.length} results found</span>
          <span className="font-mono">Local: {local.length} ({formatBytes(totalLocalSize)})</span>
        </div>
      </div>

      {/* ── Right panel: model detail ── */}
      <div className="model-detail-panel flex-1 flex flex-col min-w-0 min-h-0 bg-bg overflow-hidden">
        {selected ? (
          <ModelDetail
            model={selected}
            onDownload={async (filename, quant, sizeBytes) => {
              try {
                await start(selected.id, filename, quant, sizeBytes);
                pushToast({ kind: "success", text: `Download started: ${filename}` });
              } catch (e: any) {
                pushToast({ kind: "error", text: e?.message ?? String(e) });
              }
            }}
          />
        ) : (
          <EmptyDetail localCount={local.length} localSize={totalLocalSize} />
        )}
      </div>
    </div>
  );
}

function EmptyDetail({ localCount, localSize }: { localCount: number; localSize: number }) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-6 py-8 overflow-y-auto">
      <div className="max-w-md w-full">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-accent/15 flex items-center justify-center mb-3">
          <HardDrive className="w-7 h-7 text-accent" />
        </div>
        <h2 className="text-lg font-semibold mb-1">Browse the Hugging Face Hub</h2>
        <p className="text-sm text-text-muted">
          Search for any model, then download a GGUF quant to your configured model folder.
        </p>
        <div className="mt-4 p-3 bg-bg-panel border border-border rounded-lg text-xs text-text-muted flex items-center justify-between">
          <span>Downloaded models:</span>
          <span className="font-semibold text-text font-mono">
            {localCount} model{localCount === 1 ? "" : "s"} · {formatBytes(localSize)}
          </span>
        </div>
        <div className="mt-4 text-xs text-text-dim">
          Tip: try <code>llama-3.1</code>, paste <code>org/model</code>, or a full huggingface.co URL
        </div>
      </div>
    </div>
  );
}

const MAX_VISIBLE_TAGS = 8;

function ModelDetail({
  model,
  onDownload,
}: {
  model: HfSearchResult;
  onDownload: (filename: string, quant?: string, sizeBytes?: number) => void;
}) {
  const [files, setFiles] = useState<HfFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const { local, load } = useModels();
  const { jobs } = useDownloads();
  const { pushToast, setView } = useUi();

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setFileError(null);
    setLoading(true);
    window.lumen
      .hfFiles(model.id)
      .then((f: HfFile[]) => {
        if (!cancelled) {
          setFiles(f);
          setLoading(false);
        }
      })
      .catch((e: any) => {
        if (!cancelled) {
          setFileError(e?.message ?? String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [model.id]);

  const gguf = (files ?? []).filter((f) => /\.gguf$/i.test(f.rfilename));
  const others = (files ?? []).filter((f) => !/\.gguf$/i.test(f.rfilename));

  const allTags = model.tags ?? [];
  const visibleTags = allTags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCount = allTags.length - visibleTags.length;
  const knownSizes = gguf.map((file) => file.size).filter((size): size is number => typeof size === "number" && size > 0);
  const totalGgufSize = knownSizes.reduce((sum, size) => sum + size, 0);
  const minGgufSize = knownSizes.length ? Math.min(...knownSizes) : 0;
  const maxGgufSize = knownSizes.length ? Math.max(...knownSizes) : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header — fixed height, doesn't scroll */}
      <div className="p-5 border-b border-border shrink-0 overflow-hidden">
        <div className="model-detail-header-row flex items-start gap-3 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <h2 className="text-lg font-semibold truncate" title={model.id}>{model.id}</h2>
            <div className="text-xs text-text-muted flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 shrink-0">
                <Download className="w-3 h-3" /> {formatNumber(model.downloads)} downloads
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <Star className="w-3 h-3" /> {formatNumber(model.likes)} likes
              </span>
              {model.pipeline_tag && <span className="chip bg-bg-active text-text-muted shrink-0">{model.pipeline_tag}</span>}
            </div>
            <div className="flex flex-wrap gap-1 mt-2 max-h-[3rem] overflow-hidden">
              {visibleTags.map((t) => (
                <span key={t} className="chip border border-border text-text-dim shrink-0">
                  {t}
                </span>
              ))}
              {hiddenCount > 0 && (
                <span className="chip border border-border text-text-dim shrink-0">
                  +{hiddenCount} more
                </span>
              )}
            </div>
          </div>
          <a
            href={`https://huggingface.co/${model.id}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              e.preventDefault();
              window.lumen.openExternal(`https://huggingface.co/${model.id}`);
            }}
            className="btn-secondary text-xs shrink-0"
          >
            View on HF
          </a>
        </div>
      </div>

      {/* File list — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 p-5">
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <h3 className="text-sm font-semibold text-text-muted">GGUF files (recommended for Lumen)</h3>
          {!loading && gguf.length > 0 && (
            <div className="text-[11px] text-text-dim font-mono text-right">
              <span>{gguf.length} file{gguf.length === 1 ? "" : "s"}</span>
              {knownSizes.length > 0 && (
                <span>
                  {" · "}{formatBytes(totalGgufSize)} total
                  {minGgufSize !== maxGgufSize && ` · ${formatBytes(minGgufSize)}–${formatBytes(maxGgufSize)} each`}
                </span>
              )}
            </div>
          )}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-text-dim text-sm py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading files and exact sizes…
          </div>
        ) : fileError ? (
          <div className="panel p-3 text-xs text-danger break-words overflow-hidden max-h-24 overflow-y-auto">
            {fileError}
          </div>
        ) : gguf.length === 0 ? (
          <div className="panel p-3 text-xs text-text-dim">No GGUF files found in this repo.</div>
        ) : (
          <div className="space-y-1.5">
            {gguf.map((f: HfFile) => {
              const localMatch = local.find(
                (m) =>
                  (m.repoId === model.id || m.filename === f.rfilename) &&
                  m.filename.toLowerCase() === f.rfilename.toLowerCase()
              );
              const activeJob = jobs.find(
                (j) =>
                  j.repoId === model.id &&
                  j.filename === f.rfilename &&
                  (j.status === "downloading" || j.status === "queued")
              );

              return (
                <div key={f.rfilename} className="model-file-card panel p-3 flex items-center gap-3 overflow-hidden">
                  <Cpu className="w-4 h-4 text-accent shrink-0" />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="text-sm font-medium truncate" title={f.rfilename}>{f.rfilename}</div>
                    <div className="text-[11px] text-text-dim flex items-center gap-2 mt-0.5">
                      {f.quantization && <span className="chip bg-accent-muted text-accent shrink-0">{f.quantization}</span>}
                      {typeof f.size === "number" && f.size > 0 ? (
                        <span className="font-mono text-text-muted shrink-0">{formatBytes(f.size)}</span>
                      ) : (
                        <span className="shrink-0 text-text-dim">size unknown</span>
                      )}
                    </div>
                  </div>

                  {localMatch ? (
                    <button
                      onClick={async () => {
                        try {
                          await load(localMatch.path);
                          pushToast({ kind: "success", text: `Loaded: ${localMatch.filename}` });
                          setView("chat");
                        } catch (err: any) {
                          pushToast({ kind: "error", text: err?.message ?? String(err) });
                        }
                      }}
                      className="model-file-action btn-secondary text-success border-success/30 hover:bg-success/10 shrink-0 whitespace-nowrap text-xs gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Load
                    </button>
                  ) : activeJob ? (
                    <button
                      onClick={() => setView("downloads")}
                      className="model-file-action btn-ghost text-accent border border-accent/30 shrink-0 whitespace-nowrap text-xs gap-1.5"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {activeJob.sizeBytes > 0
                        ? `${Math.round((activeJob.downloaded / activeJob.sizeBytes) * 100)}%`
                        : "Downloading…"}
                    </button>
                  ) : (
                    <button onClick={() => onDownload(f.rfilename, f.quantization, f.size)} className="model-file-action btn-primary shrink-0 whitespace-nowrap">
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {others.length > 0 && (
          <>
            <h3 className="text-sm font-semibold mb-2 text-text-muted mt-6">Other model files</h3>
            <div className="space-y-1.5">
              {others.map((f) => (
                <div key={f.rfilename} className="px-3 py-2 text-xs flex items-center gap-2 text-text-muted bg-bg-elev/40 rounded-md border border-border/50 overflow-hidden">
                  <Folder className="w-3.5 h-3.5 shrink-0 text-text-dim" />
                  <span className="truncate flex-1 min-w-0 font-mono text-[11px]">{f.rfilename}</span>
                  {typeof f.size === "number" && f.size > 0 && <span className="text-text-dim shrink-0 font-mono">{formatBytes(f.size)}</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
