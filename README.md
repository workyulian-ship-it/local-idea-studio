# Lumen Studio

Lumen Studio is a Windows desktop application for discovering, downloading, and running compatible GGUF language models locally. It provides one interface for Hugging Face model search, model downloads, local chats, and llama.cpp runtime controls.

Official website: https://lumen-studio-local-ai.lush-flute-8657.chatgpt.site/

## v0.1.1 early access

- Windows 10/11 x64
- Local GGUF inference through `node-llama-cpp`
- CPU and Vulkan GPU runtime options
- Hugging Face GGUF search and downloads
- Models stored by default in the current user's `Documents/Lumen Studio/models` folder
- Configurable model storage directory for any available local drive
- Per-model generation and context settings
- Local chat and settings storage

New installations never require a `D:` drive. Existing v0.1.0 users who already have Lumen data on `D:\LLM AI` keep that location so an update does not hide their settings or downloaded models.

The v0.1.1 Windows installer is currently **unsigned**. Windows may display a Microsoft Defender SmartScreen warning. Verify the installer checksum against [`SHA256SUMS.txt`](./SHA256SUMS.txt) before running it.

## Privacy and network behavior

Prompts and model inference are processed locally by the application. Chats, settings, and downloaded models are stored on the user's computer. Network access occurs when the user searches or downloads models from Hugging Face or opens an external link. The application does not require a Lumen account and does not include intentional prompt telemetry.

An optional Hugging Face token can be entered in Settings for repositories that require authentication. It is stored in the local settings file and is only sent to Hugging Face requests.

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

The source is publicly visible for transparency, auditing, and trust, but Lumen Studio is **source-available proprietary software**, not an open-source project. Use and redistribution are governed by [`LICENSE`](./LICENSE). Third-party dependencies keep their own licenses.
