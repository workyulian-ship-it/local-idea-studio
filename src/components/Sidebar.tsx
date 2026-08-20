import { Sparkles, MessageSquare, Library, Download, Settings2, Cpu, Power } from "lucide-react";
import { useUi } from "../store/ui";
import { useModels } from "../store/models";
import { cn, formatBytes } from "../lib/utils";
import type { View } from "../store/ui";

const NAV: { id: View; label: string; icon: any }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "library", label: "Models", icon: Library },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export function Sidebar() {
  const { view, setView, sidebarOpen, toggleSidebar } = useUi();
  const { loaded, load, local, refresh } = useModels();

  const totalSizeBytes = local.reduce((sum, m) => sum + (m.sizeBytes || 0), 0);

  if (!sidebarOpen) {
    return (
      <aside className="w-12 shrink-0 bg-bg-panel border-r border-border flex flex-col items-center py-3 gap-1">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-md hover:bg-bg-hover text-text-muted"
          title="Expand sidebar"
        >
          <Sparkles className="w-4 h-4 text-accent" />
        </button>
        <div className="w-6 h-px bg-border my-1" />
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            className={cn(
              "p-2 rounded-md transition-colors relative",
              view === n.id ? "bg-accent-muted text-accent" : "text-text-muted hover:bg-bg-hover"
            )}
            title={n.id === "library" ? `Models (${local.length} · ${formatBytes(totalSizeBytes)})` : n.label}
          >
            <n.icon className="w-4 h-4" />
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className="w-64 shrink-0 bg-bg-panel border-r border-border flex flex-col min-h-0 overflow-hidden">
      <div className="h-12 flex items-center px-3 border-b border-border drag-region shrink-0">
        <div className="flex items-center gap-2 no-drag min-w-0">
          <div className="w-7 h-7 rounded-md bg-accent/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">Lumen Studio</div>
            <div className="text-[10px] text-text-dim leading-tight truncate">Local AI · CUDA / Vulkan</div>
          </div>
        </div>
        <button
          onClick={toggleSidebar}
          className="ml-auto btn-ghost p-1 text-text-dim shrink-0"
          title="Collapse"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      <div className="px-3 py-3 border-b border-border shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-text-dim mb-2 px-1">Active model</div>
        {loaded ? (
          <div className="bg-bg-elev border border-border rounded-md p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Cpu className="w-4 h-4 text-success shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" title={loaded.modelId}>{loaded.modelId}</div>
                <div className="text-[10px] text-text-dim truncate">
                  {loaded.backend} · ctx {loaded.contextSize}
                </div>
              </div>
              <button
                onClick={() => useModels.getState().unload()}
                className="btn-icon shrink-0"
                title="Unload model"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-bg-elev border border-dashed border-border rounded-md p-2.5 text-xs text-text-dim">
            No model loaded
          </div>
        )}
        {local.length > 0 && !loaded && (
          <select
            className="input mt-2 text-xs py-1.5 truncate max-w-full"
            onChange={async (e) => {
              const id = e.target.value;
              if (!id) return;
              try {
                await load(id);
              } catch (err: any) {
                alert(`Failed to load: ${err?.message ?? err}`);
              }
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Load a model…
            </option>
            {local.map((m) => (
              <option key={m.id} value={m.path}>
                {m.filename} ({m.quantization ?? m.format}) · {formatBytes(m.sizeBytes)}
              </option>
            ))}
          </select>
        )}
      </div>

      <nav className="px-2 py-2 border-b border-border shrink-0">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setView(n.id)}
            className={cn(
              "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
              view === n.id
                ? "bg-accent-muted text-accent"
                : "text-text-muted hover:text-text hover:bg-bg-hover"
            )}
          >
            <n.icon className="w-4 h-4 shrink-0" />
            <span className="truncate flex-1 text-left">{n.label}</span>
            {n.id === "library" && local.length > 0 && (
              <span className="text-[10px] text-text-dim bg-bg-active px-1.5 py-0.5 rounded-full shrink-0">
                {local.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-text-dim mb-2 px-2">
          <span>Local models ({local.length})</span>
          {local.length > 0 && <span className="font-mono">{formatBytes(totalSizeBytes)}</span>}
        </div>
        {local.length === 0 ? (
          <div className="px-2 py-3 text-xs text-text-dim">
            No local models yet. Go to <span className="text-accent">Models</span> to download.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {local.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "group flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-bg-hover transition-colors overflow-hidden",
                  loaded?.modelPath === m.path ? "bg-bg-hover" : ""
                )}
                onClick={() => load(m.path).catch((e) => alert(e?.message ?? String(e)))}
                title={`${m.filename}\nSize: ${formatBytes(m.sizeBytes)}\nFormat: ${m.quantization ?? m.format}\nPath: ${m.path}`}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", loaded?.modelPath === m.path ? "bg-success" : "bg-text-dim")} />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="truncate font-medium">{m.filename}</div>
                  <div className="text-[10px] text-text-dim flex items-center justify-between gap-1">
                    <span className="truncate">{m.quantization ?? m.format}</span>
                    <span className="font-mono shrink-0">{formatBytes(m.sizeBytes)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border text-[10px] text-text-dim flex items-center justify-between shrink-0">
        <span className="truncate">
          {local.length} model{local.length === 1 ? "" : "s"} {local.length > 0 ? `· ${formatBytes(totalSizeBytes)}` : ""}
        </span>
        <button
          className="hover:text-text shrink-0 ml-1 p-0.5"
          onClick={() => refresh()}
          title="Refresh models list"
        >
          ↻
        </button>
      </div>
    </aside>
  );
}
