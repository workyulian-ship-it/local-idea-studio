import { useEffect, useState, type ReactNode } from "react";
import { useSettings } from "../store/settings";
import { useModels } from "../store/models";
import { useChats } from "../store/chats";
import { useUi } from "../store/ui";
import { Brain, Folder, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import type { AppSettings, ModelProfile, SystemPaths } from "../types";
import { cn } from "../lib/utils";
import { getEffectiveModelSettings, getModelProfile } from "../lib/modelSettings";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="text-sm font-semibold mb-3 text-text">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Slider({
  label, value, min, max, step, onChange, format, hint, editable = false,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string; hint?: string; editable?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, Math.round(parsed / step) * step));
    setDraft(String(next));
    onChange(next);
  };
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-text-muted">{label}</span>
        {editable ? (
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={draft}
            aria-label={`${label} exact value`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitDraft();
                event.currentTarget.blur();
              }
            }}
            className="w-28 rounded border border-border bg-bg-elev px-2 py-1 text-right font-mono text-text"
          />
        ) : (
          <span className="font-mono text-text">{format ? format(value) : value}</span>
        )}
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent"
      />
      {hint && <div className="text-[10px] text-text-dim mt-0.5">{hint}</div>}
    </div>
  );
}

export function SettingsPanel() {
  const { settings, update, reset } = useSettings();
  const { loaded, refresh: refreshModels } = useModels();
  const { pushToast } = useUi();
  const [paths, setPaths] = useState<SystemPaths | null>(null);
  const [tps, setTps] = useState<{ backend: string; gpu: string | null; modelLoaded: boolean } | null>(null);
  const [backendChanging, setBackendChanging] = useState(false);

  useEffect(() => {
    window.lumen.getPaths().then(setPaths);
    window.lumen.getGpuInfo().then((g: any) => setTps(g));
  }, []);

  if (!settings) {
    return <div className="flex-1 flex items-center justify-center text-text-dim">Loading…</div>;
  }

  const profile = getModelProfile(settings, loaded);
  const effective = getEffectiveModelSettings(settings, loaded);
  const contextMaximum = loaded?.trainContextSize ?? 131072;
  const outputContextLimit = Math.min(loaded?.contextSize ?? effective.contextSize, effective.contextSize);
  const maxTokensMaximum = Math.min(32768, Math.max(32, outputContextLimit - 256));
  const requestedMaxTokens = profile.maxTokens ?? settings.maxTokens;
  const configurableMaxTokens = 32768;
  const updateModelSetting = (patch: Partial<ModelProfile>) => {
    if (!loaded) return update(patch);
    return update({
      modelProfiles: {
        ...(settings.modelProfiles ?? {}),
        [loaded.modelPath]: { ...profile, ...patch },
      },
    });
  };
  const updateMaxOutputTokens = (value: number) => {
    const maxTokens = Math.min(configurableMaxTokens, Math.max(32, Math.round(value)));
    const requiredContext = Math.min(
      contextMaximum,
      Math.max(512, Math.ceil((maxTokens + 256) / 512) * 512),
    );
    const patch: Partial<ModelProfile> = { maxTokens };
    if (requiredContext > effective.contextSize) patch.contextSize = requiredContext;
    void updateModelSetting(patch);
  };
  const resetCurrentProfile = () => {
    if (!loaded) return;
    const nextProfiles = { ...(settings.modelProfiles ?? {}) };
    delete nextProfiles[loaded.modelPath];
    void update({ modelProfiles: nextProfiles });
    pushToast({ kind: "info", text: `Reset settings for ${loaded.modelId}` });
  };
  const chooseModelsDirectory = async () => {
    const selected = await window.lumen.selectModelsDirectory(paths?.modelsDir);
    if (!selected) return;
    await update({ modelsDirectory: selected });
    setPaths(await window.lumen.getPaths());
    await refreshModels();
    pushToast({ kind: "success", text: "Model download folder updated" });
  };
  const useDefaultModelsDirectory = async () => {
    await update({ modelsDirectory: null });
    setPaths(await window.lumen.getPaths());
    await refreshModels();
    pushToast({ kind: "info", text: "Using the default model folder" });
  };
  const chooseAgentWorkspace = async () => {
    const selected = await window.lumen.selectAgentWorkspace(settings.agentWorkspace ?? undefined);
    if (!selected) return null;
    await update({ agentWorkspace: selected });
    pushToast({ kind: "success", text: "Agent workspace updated" });
    return selected;
  };
  const toggleAgentMode = async (enabled: boolean) => {
    if (!enabled) {
      await update({ agentMode: false });
      return;
    }
    let workspace = settings.agentWorkspace;
    if (!workspace) {
      workspace = await window.lumen.selectAgentWorkspace();
      if (!workspace) {
        pushToast({ kind: "info", text: "Agent Mode remains off until you choose a workspace" });
        return;
      }
    }
    await update({ agentWorkspace: workspace, agentMode: true });
    pushToast({ kind: "success", text: "Agent Mode enabled with per-action permission" });
  };
  const changeBackend = async (nextBackend: AppSettings["gpuBackend"]) => {
    if (nextBackend === settings.gpuBackend || backendChanging) return;
    const previousBackend = settings.gpuBackend;
    const modelPath = loaded?.modelPath;
    setBackendChanging(true);
    try {
      const chatState = useChats.getState();
      if (chatState.streaming && chatState.current) {
        await window.lumen.abortChat(chatState.current.id);
      }
      await update({ gpuBackend: nextBackend });
      if (modelPath) {
        await useModels.getState().load(modelPath);
      }
      const runtime = await window.lumen.getGpuInfo();
      setTps(runtime);
      pushToast({
        kind: "success",
        text: modelPath
          ? `Model reloaded on ${runtime.backend}`
          : `${nextBackend} will be used when a model is loaded`,
      });
    } catch (error: any) {
      try {
        await update({ gpuBackend: previousBackend });
        if (modelPath) await useModels.getState().load(modelPath);
        setTps(await window.lumen.getGpuInfo());
      } catch (restoreError) {
        console.error("Failed to restore previous inference backend", restoreError);
      }
      pushToast({ kind: "error", text: `Backend switch failed: ${error?.message ?? String(error)}` });
    } finally {
      setBackendChanging(false);
    }
  };

  return (
    <div className="settings-scroll flex-1 overflow-y-auto p-6" data-testid="settings-scroll">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-sm text-text-muted">Generation parameters, model defaults, and storage.</p>
          </div>
          <button onClick={async () => { await reset(); pushToast({ kind: "info", text: "Settings reset" }); }} className="btn-ghost text-xs">
            <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
          </button>
        </div>

        <div className="panel px-4 py-3 text-xs flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-medium text-text">
              {loaded ? `Per-model profile: ${loaded.modelId}` : "Default profile for newly loaded models"}
            </div>
            <div className="text-text-dim mt-0.5">
              {loaded
                ? `Model limit ${loaded.trainContextSize.toLocaleString()} tokens · active context ${loaded.contextSize.toLocaleString()}. Context changes apply after reloading this model.`
                : "Load a model to give it its own generation and context settings."}
            </div>
          </div>
          {loaded && Object.keys(profile).length > 0 && (
            <button onClick={resetCurrentProfile} className="btn-ghost text-xs shrink-0">
              Reset this model
            </button>
          )}
        </div>

        <Section title="Generation">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
              <Brain className="w-3.5 h-3.5 text-accent" /> Thinking mode
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["minimal", "Minimal", "Fast, direct answer"],
                ["standard", "Standard", "Balanced reasoning"],
                ["max", "Max", "Deepest reasoning"],
              ] as const).map(([value, label, hint]) => (
                <button
                  key={value}
                  onClick={() => void update({ thinkingMode: value })}
                  className={cn(
                    "rounded-md border px-2 py-2 text-left transition-colors",
                    settings.thinkingMode === value
                      ? "border-accent/60 bg-accent/10"
                      : "border-border bg-bg-elev hover:bg-bg-hover",
                  )}
                >
                  <div className="text-xs font-medium">{label}</div>
                  <div className="text-[10px] text-text-dim mt-0.5">{hint}</div>
                </button>
              ))}
            </div>
            <div className="text-[10px] text-text-dim mt-1.5">
              Every mode reserves tokens for a final answer. Models without native reasoning still answer normally.
            </div>
          </div>
          <Slider label="Temperature" value={effective.temperature} min={0} max={2} step={0.05}
            onChange={(v) => updateModelSetting({ temperature: v })}
            format={(v) => v.toFixed(2)}
            hint="Higher = more creative, lower = more deterministic"
          />
          <Slider label="Top-P" value={effective.topP} min={0} max={1} step={0.01}
            onChange={(v) => updateModelSetting({ topP: v })}
            format={(v) => v.toFixed(2)}
            hint="Nucleus sampling"
          />
          <Slider label="Top-K" value={effective.topK} min={1} max={100} step={1}
            onChange={(v) => updateModelSetting({ topK: v })}
            hint="Sample from top K tokens"
          />
          <Slider label="Requested max response tokens" value={requestedMaxTokens} min={32} max={configurableMaxTokens} step={1}
            onChange={updateMaxOutputTokens}
            editable
            hint={loaded
              ? `Saved per model. The currently loaded ${loaded.contextSize.toLocaleString()}-token context can generate up to ${maxTokensMaximum.toLocaleString()} tokens per reply. Larger values automatically raise the Context size cap below; reload the model to apply it, and hardware memory fitting may still select less.`
              : "Enter the maximum response length you want. The active model context and available memory determine the runtime limit."}
          />
          <Slider label="Repeat penalty" value={effective.repeatPenalty} min={1} max={2} step={0.05}
            onChange={(v) => updateModelSetting({ repeatPenalty: v })}
            format={(v) => v.toFixed(2)}
            hint="Penalize repeated tokens (1.0 = off)"
          />
          <div>
            <div className="text-xs text-text-muted mb-1.5">Seed (optional)</div>
            <input
              type="number"
              value={effective.seed ?? ""}
              onChange={(e) => updateModelSetting({ seed: e.target.value === "" ? null : parseInt(e.target.value) })}
              placeholder="random"
              className="input"
            />
          </div>
        </Section>

        <Section title="System prompt">
          <textarea
            value={settings.systemPrompt}
            onChange={(e) => update({ systemPrompt: e.target.value })}
            rows={5}
            className="input font-mono text-xs leading-relaxed"
            placeholder="You are a helpful assistant…"
          />
        </Section>

        <Section title="Agent Mode (permission-gated preview)">
          <div className="grid grid-cols-2 gap-2">
            <Toggle
              label="Enable Agent Mode"
              hint="Let the model propose workspace file changes"
              value={settings.agentMode}
              onChange={(value) => void toggleAgentMode(value)}
            />
            <div className="rounded-md border border-border bg-bg-elev p-2.5">
              <div className="flex items-center gap-2 text-xs font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-success" /> Allow once, every action
              </div>
              <div className="text-[10px] text-text-dim mt-0.5">
                A native confirmation appears before each file operation.
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1.5">Allowed workspace</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 bg-bg-elev px-2 py-1.5 rounded border border-border truncate text-xs">
                {settings.agentWorkspace ?? "No workspace selected"}
              </code>
              <button onClick={() => void chooseAgentWorkspace()} className="btn-secondary text-xs shrink-0">
                <Folder className="w-3.5 h-3.5" /> {settings.agentWorkspace ? "Change…" : "Choose…"}
              </button>
            </div>
          </div>
          <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-text-muted leading-relaxed">
            Agent Mode can inspect folders, read bounded sections of text/code files, and create or edit files inside the selected workspace. Every action requires a separate native confirmation.
            It cannot run commands, delete files, or access paths outside that folder. Replacing a file creates a backup.
          </div>
        </Section>

        <Section title="Performance (GPU acceleration)">
          <div className="text-xs text-text-muted">
            Performance options are applied when the model loads. Memory locking defaults off because some systems require extra privileges.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Toggle
              label="Flash attention"
              hint="Faster inference, lower memory"
              value={settings.flashAttention}
              onChange={(v) => update({ flashAttention: v })}
            />
            <Toggle
              label="mlock (lock RAM)"
              hint="Prevents swapping, faster"
              value={settings.mlock}
              onChange={(v) => update({ mlock: v })}
            />
            <Toggle
              label="mmap (memory map)"
              hint="Faster model load"
              value={settings.mmap}
              onChange={(v) => update({ mmap: v })}
            />
          </div>
        </Section>

        <Section title="Model loading">
          <Slider
            label="Context size cap" value={effective.contextSize} min={512} max={contextMaximum} step={512}
            onChange={(v) => updateModelSetting({ contextSize: v })}
            editable
            hint={loaded
              ? `Never exceeds this model's trained limit (${contextMaximum.toLocaleString()}); memory fitting may select less.`
              : "Default cap only. Each loaded model gets its own profile and trained-context limit."}
          />
          <Slider
            label="GPU layers (-1 = all)" value={settings.gpuLayers} min={-1} max={99} step={1}
            onChange={(v) => update({ gpuLayers: v })}
            format={(v) => (v === -1 ? "all" : v.toString())}
            hint="Number of model layers to offload through CUDA or Vulkan"
          />
          <div>
            <div className="text-xs text-text-muted mb-1.5">GPU backend</div>
            <select
              value={settings.gpuBackend}
              onChange={(e) => void changeBackend(e.target.value as AppSettings["gpuBackend"])}
              disabled={backendChanging}
              className="input"
            >
              <option value="auto">Auto-detect (CUDA preferred, then Vulkan)</option>
              <option value="cuda">CUDA (NVIDIA RTX/GTX)</option>
              <option value="vulkan">Vulkan (AMD/NVIDIA/Intel GPU)</option>
              <option value="cpu">CPU only</option>
            </select>
            <div className="text-[10px] text-text-dim mt-1 flex items-center gap-1.5">
              {backendChanging && <Loader2 className="w-3 h-3 animate-spin" />}
              {backendChanging
                ? "Stopping generation and reloading the model on the selected backend…"
                : "Auto uses the fastest supported backend. A loaded model is reloaded automatically when this changes."}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-1.5">CPU threads (0 = all logical processors)</div>
            <input
              type="number" min={0} max={64}
              value={settings.threads}
              onChange={(e) => update({ threads: parseInt(e.target.value || "0") })}
              className="input"
            />
            <div className="text-[10px] text-text-dim mt-1">
              Auto uses every logical CPU thread detected by Windows. Manual values are intended for thermal or responsiveness limits.
            </div>
          </div>
        </Section>

        <Section title="Interface">
          <Toggle
            label="Show generation speed"
            hint="Display tokens/sec, generated token count, and elapsed time"
            value={settings.showTokensPerSecond}
            onChange={(v) => update({ showTokensPerSecond: v })}
          />
        </Section>

        <Section title="Hugging Face">
          <div>
            <div className="text-xs text-text-muted mb-1.5">Access token (optional, for private/gated repos)</div>
            <input
              type="password"
              value={settings.hfToken}
              onChange={(e) => update({ hfToken: e.target.value })}
              placeholder="hf_…"
              className="input font-mono"
            />
            <div className="text-[10px] text-text-dim mt-1">
              Get a token at huggingface.co/settings/tokens
            </div>
          </div>
        </Section>

        <Section title="Storage">
          {paths && (
            <div className="space-y-2 text-xs">
              <PathRow label="AI root" path={paths.aiRoot} onOpen={() => window.lumen.openFolder(paths.aiRoot)} />
              <PathRow label="Models" path={paths.modelsDir} onOpen={() => window.lumen.openFolder(paths.modelsDir)} />
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <button onClick={chooseModelsDirectory} className="btn-secondary text-xs">Change model folder…</button>
                {settings.modelsDirectory && (
                  <button onClick={useDefaultModelsDirectory} className="btn-ghost text-xs">Use default</button>
                )}
                <span className="text-[10px] text-text-dim">New downloads and model scanning use this folder immediately.</span>
              </div>
              <PathRow label="Chats" path={paths.chatsDir} onOpen={() => window.lumen.openFolder(paths.chatsDir)} />
              <PathRow label="Logs" path={paths.logsDir} onOpen={() => window.lumen.openFolder(paths.logsDir)} />
            </div>
          )}
        </Section>

        <Section title="Runtime info">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Info label="Backend" value={tps?.backend ?? "—"} />
            <Info label="GPU" value={tps?.gpu ?? "none"} />
            <Info
              label="CPU threads"
              value={loaded ? `${loaded.cpuThreads}/${loaded.logicalCpuThreads} logical` : "auto"}
            />
            <Info
              label="GPU offload"
              value={loaded ? `${loaded.gpuLayers}/${loaded.totalLayers} layers (${loaded.gpuOffloadPercent}%)` : "—"}
            />
            <Info label="Batch size" value={loaded ? String(loaded.batchSize) : "—"} />
            <Info label="Flash attention" value={loaded ? (loaded.flashAttention ? "active" : "unavailable/off") : "—"} />
            <Info
              label="Reasoning"
              value={!loaded
                ? "—"
                : loaded.reasoningSupported
                  ? `visible reasoning · ${loaded.chatWrapper}`
                  : "standard model · hidden unless emitted"}
            />
            <Info label="App version" value={paths?.appVersion ?? "—"} />
            <Info label="Platform" value={paths?.platform ?? "—"} />
          </div>
        </Section>

        <div className="text-center text-[10px] text-text-dim pt-4">
          Local Idea Studio · all inference runs on your machine
        </div>
      </div>
    </div>
  );
}

function PathRow({ label, path, onOpen }: { label: string; path: string; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-dim w-16">{label}</span>
      <code className="flex-1 bg-bg-elev px-2 py-1 rounded border border-border truncate">{path}</code>
      <button onClick={onOpen} className="btn-ghost p-1" title="Open folder">
        <Folder className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-elev border border-border rounded-md p-2">
      <div className="text-[10px] text-text-dim uppercase tracking-wider">{label}</div>
      <div className="font-mono text-text truncate">{value}</div>
    </div>
  );
}

function Toggle({
  label, hint, value, onChange,
}: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "text-left p-2.5 rounded-md border transition-colors",
        value
          ? "bg-success/10 border-success/40"
          : "bg-bg-elev border-border hover:bg-bg-hover"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className={cn("text-[10px] uppercase tracking-wider", value ? "text-success" : "text-text-dim")}>
          {value ? "ON" : "OFF"}
        </span>
      </div>
      {hint && <div className="text-[10px] text-text-dim mt-0.5">{hint}</div>}
    </button>
  );
}
