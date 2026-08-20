import { useEffect, useState } from "react";
import { Download, X, CheckCircle2, AlertCircle, Loader2, FileArchive, HardDrive } from "lucide-react";
import { useDownloads } from "../store/downloads";
import { useModels } from "../store/models";
import { formatBytes, formatTime, cn } from "../lib/utils";

export function DownloadsPanel() {
  const { jobs, cancel } = useDownloads();
  const { local } = useModels();
  const [modelsDir, setModelsDir] = useState("configured model folder");

  useEffect(() => {
    window.lumen.getPaths().then((paths) => setModelsDir(paths.modelsDir));
  }, []);

  const totalLocalSize = local.reduce((sum, m) => sum + (m.sizeBytes || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 min-h-0">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Downloads</h1>
            <p className="text-sm text-text-muted">
              All models save to <code className="text-accent break-all">{modelsDir}</code>
            </p>
          </div>
          <div className="bg-bg-panel border border-border rounded-lg px-3.5 py-2 flex items-center gap-2.5 text-xs">
            <HardDrive className="w-4 h-4 text-accent shrink-0" />
            <div>
              <div className="text-[10px] text-text-dim uppercase tracking-wider">Local Models Storage</div>
              <div className="font-semibold text-text font-mono">
                {local.length} model{local.length === 1 ? "" : "s"} · {formatBytes(totalLocalSize)}
              </div>
            </div>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="panel p-8 text-center text-text-dim">
            <Download className="w-10 h-10 mx-auto mb-2 text-text-dim" />
            <div className="text-sm font-medium">No active or past downloads.</div>
            <div className="text-xs mt-1">Browse the Models tab to download new GGUF models.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="panel p-3 overflow-hidden">
                <div className="flex items-center gap-3 min-w-0 flex-wrap sm:flex-nowrap">
                  <div className="w-9 h-9 rounded-md bg-bg-elev flex items-center justify-center shrink-0">
                    <FileArchive className="w-4 h-4 text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="text-sm font-medium truncate" title={j.filename}>{j.filename}</div>
                    <div className="text-[11px] text-text-dim truncate">
                      {j.repoId} · {j.quantization ?? "—"}
                      {j.sizeBytes > 0 ? ` · ${formatBytes(j.sizeBytes)}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={j.status} />
                  {j.status === "downloading" || j.status === "queued" ? (
                    <button onClick={() => cancel(j.id)} className="btn-icon shrink-0" title="Cancel">
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
                {j.status === "downloading" && (
                  <div className="mt-2.5">
                    <div className="h-1.5 rounded-full bg-bg-elev overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${j.sizeBytes > 0 ? (j.downloaded / j.sizeBytes) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-text-dim mt-1">
                      <span>
                        {formatBytes(j.downloaded)} / {j.sizeBytes > 0 ? formatBytes(j.sizeBytes) : "—"}
                      </span>
                      <span>
                        {formatBytes(j.speed)}/s · {formatTime(j.eta)} left
                      </span>
                    </div>
                  </div>
                )}
                {j.status === "completed" && (
                  <div className="mt-2 text-[11px] text-text-dim flex items-center gap-1.5 min-w-0 overflow-hidden">
                    <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                    <span className="truncate">Saved to <code className="text-text-muted truncate">{j.destination}</code></span>
                  </div>
                )}
                {j.status === "error" && (
                  <div className="mt-2 text-[11px] text-danger flex items-center gap-1.5 break-words">
                    <AlertCircle className="w-3 h-3 shrink-0" /> <span className="break-all">{j.error}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "downloading") return <span className="chip bg-accent-muted text-accent shrink-0"><Loader2 className="w-3 h-3 animate-spin" /> Downloading</span>;
  if (status === "queued") return <span className="chip bg-bg-active text-text-muted shrink-0">Queued</span>;
  if (status === "completed") return <span className="chip bg-success/15 text-success shrink-0"><CheckCircle2 className="w-3 h-3" /> Done</span>;
  if (status === "cancelled") return <span className="chip bg-bg-active text-text-dim shrink-0">Cancelled</span>;
  if (status === "error") return <span className="chip bg-danger/15 text-danger shrink-0">Error</span>;
  return null;
}
