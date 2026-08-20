import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { ModelLibrary } from "./components/ModelLibrary";
import { DownloadsPanel } from "./components/DownloadsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { useSettings } from "./store/settings";
import { useModels } from "./store/models";
import { useChats } from "./store/chats";
import { useDownloads } from "./store/downloads";
import { useUi } from "./store/ui";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "./lib/utils";

export default function App() {
  const { view, toast } = useUi();
  const { load: loadSettings, loaded: settingsLoaded } = useSettings();
  const { refresh: refreshModels } = useModels();
  const { refresh: refreshDownloads, apply: applyDownload } = useDownloads();
  const { refresh: refreshChats } = useChats();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await loadSettings();
      await refreshModels();
      await refreshDownloads();
      await refreshChats();
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    const offProgress = window.lumen.onDownloadProgress((job: any) => applyDownload(job));
    const offComplete = window.lumen.onDownloadComplete(async (job: any) => {
      applyDownload(job);
      await refreshModels();
    });
    return () => {
      offProgress();
      offComplete();
    };
  }, [applyDownload, refreshModels]);

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text overflow-hidden">
      <div className="h-9 shrink-0 bg-bg-panel border-b border-border drag-region flex items-center px-3 no-drag">
        <span className="text-[11px] text-text-dim">Local Idea Studio</span>
        <div className="ml-auto text-[10px] text-text-dim flex items-center gap-2">
          {ready ? <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-success" /> ready</span> : <span>loading…</span>}
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 flex min-w-0">
          {view === "chat" && <ChatView />}
          {view === "library" && <ModelLibrary />}
          {view === "downloads" && <DownloadsPanel />}
          {view === "settings" && <SettingsPanel />}
        </main>
      </div>
      {toast && (
        <div
          className={cn(
            "fixed bottom-5 right-5 panel px-4 py-3 flex items-center gap-2 shadow-panel animate-fade-in z-50",
            toast.kind === "success" && "border-success/40",
            toast.kind === "error" && "border-danger/40"
          )}
        >
          {toast.kind === "success" && <CheckCircle2 className="w-4 h-4 text-success" />}
          {toast.kind === "error" && <AlertCircle className="w-4 h-4 text-danger" />}
          {toast.kind === "info" && <Info className="w-4 h-4 text-accent" />}
          <span className="text-sm">{toast.text}</span>
        </div>
      )}
    </div>
  );
}
