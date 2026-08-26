# Local Idea Studio

Local Idea Studio is a Windows desktop application for discovering, downloading, and running compatible GGUF language models locally. It provides one interface for Hugging Face model search, model downloads, local chats, and llama.cpp runtime controls.

Official website: https://lumen-studio-local-ai.lush-flute-8657.chatgpt.site/

Official Discord community: https://discord.gg/cFaES6muP

## v0.2.1 early access

- Windows 10/11 x64
- Local GGUF inference through `node-llama-cpp`
- CPU, NVIDIA CUDA, and cross-vendor Vulkan GPU runtime options
- Automatic backend selection prefers CUDA on supported NVIDIA hardware, with explicit CUDA, Vulkan, and CPU choices in Settings
- Maximum-performance Auto mode uses every logical CPU thread and up to a 2048-token accelerated prompt batch
- Full GPU layer offload when the model and available VRAM/RAM permit it, with the actual layer count shown in Runtime info
- Per-model reasoning detection: compatible GGUF chat templates stream their real reasoning text in a collapsible panel; standard models show only their answer
- Minimal, Standard, and Max thinking modes with enforced thought budgets that always reserve space for a final answer
- Automatic final-answer recovery when a reasoning model still reaches its response limit before answering
- Permission-gated Agent Mode preview for inspecting folders, reading bounded sections of text/code files, creating files, and applying exact code edits inside one user-selected workspace
- A native **Allow once** confirmation with the model's reason appears before every Agent Mode file operation; declining makes no change
- After an Agent Mode decision, the application saves the operation result in model context and automatically continues the same response; completed operations are detected and cannot loop as duplicate proposals
- Exact absolute paths pasted from Explorer are accepted only when they resolve inside the selected workspace and are converted to workspace-relative paths before execution
- Safe Agent Mode operation aliases from smaller local models, such as `read`, `inspect_file`, and `open_file`, normalize to the permission-gated `read_file` action instead of failing as unsupported
- Workspace-root paths such as `/hello.txt` are safely normalized to `hello.txt`, while absolute paths outside the workspace, UNC paths, traversal, linked-folder escapes, and outside-workspace paths remain blocked
- The requested response-token limit now has an exact number input up to 32,768 tokens per model; larger requests automatically raise that model's context cap and clearly require a reload
- Hugging Face GGUF search and downloads
- Models stored by default in the current user's `Documents/Local Idea Studio/models` folder
- Existing Lumen Studio installations retain their selected storage path so downloaded models remain visible after the rename
- Configurable model storage directory for any available local drive
- Per-model generation and context settings
- Local chat and settings storage

New installations never require a `D:` drive. Existing v0.1.0 users who already have Lumen data on `D:\LLM AI` keep that location so an update does not hide their settings or downloaded models.

The v0.2.1 Windows installer is currently **unsigned**. Windows may display a Microsoft Defender SmartScreen warning. Verify the installer checksum against [`SHA256SUMS.txt`](./SHA256SUMS.txt) before running it.

## Privacy and network behavior

Prompts and model inference are processed locally by the application. Chats, settings, and downloaded models are stored on the user's computer. Network access occurs when the user searches or downloads models from Hugging Face or opens an external link. The application does not require a Local Idea Studio account and does not include intentional prompt telemetry.

An optional Hugging Face token can be entered in Settings for repositories that require authentication. It is stored in the local settings file and is only sent to Hugging Face requests.

Agent Mode is off by default. When enabled, it is restricted to the workspace folder selected by the user. It can list one folder, read up to 400 lines of a text/code file at a time, and propose exact text replacements after inspecting the file. It does not run shell commands, delete files, or access paths outside that folder. Every proposed operation is validated in the Electron main process and requires a separate native confirmation. Replacing or editing an existing file creates a local backup next to it. A completed, declined, or failed result is stored locally in the conversation so the model can continue without repeating the same operation.

## Community and support

Join the official Discord community for setup help, bug reports, GGUF model discussion, CPU/GPU benchmarks, release news, and feedback:

https://discord.gg/cFaES6muP

## Build from source

Requirements:

- Windows 10/11 x64
- Node.js 22 or newer
- npm

```powershell
npm ci
npm run lint
npm run package:windows
```

The NSIS installer is written to `release-artifacts/`. Build output, dependencies, model files, chats, settings, caches, and local environment files are intentionally excluded from this repository.

## Source layout

- `src/` — React desktop interface and state
- `electron/` — Electron main process, model runtime, downloads, storage, and IPC
- `scripts/` — brand asset generation, packaging helpers, and runtime tests
- `build/` — installer artwork, icons, and the installer EULA

## Security

Please read [`SECURITY.md`](./SECURITY.md) before reporting a vulnerability. Do not publish API tokens, private model links, chats, settings files, or personal information in a public issue.

## License

The source is publicly visible for transparency, auditing, and trust, but Local Idea Studio is **source-available proprietary software**, not an open-source project. Use and redistribution are governed by [`LICENSE`](./LICENSE). Third-party dependencies keep their own licenses.
