# Security policy

## Supported version

Security fixes currently target the newest v0.1.x early-access release.

## Reporting a vulnerability

Please report security problems privately to the repository owner through GitHub rather than opening a public issue containing exploit details. Include the affected version, reproduction steps, expected behavior, and impact.

Never attach Hugging Face tokens, private model URLs, chats, settings files, logs containing personal information, or other secrets to a public issue.

## Release verification

The Windows v0.1.8 installer is not code-signed. Confirm its SHA-256 digest using:

```powershell
Get-FileHash -Algorithm SHA256 '.\Local Idea Studio-0.1.8-win-x64.exe'
```

Compare the result with [`SHA256SUMS.txt`](./SHA256SUMS.txt). A different digest means the file must not be trusted or executed.

## Agent Mode boundary

Agent Mode is disabled by default. The v0.1.8 preview only supports text-file creation, replacement, append, and folder creation inside a user-selected workspace. Every operation is validated in the Electron main process and requires a native **Allow once** confirmation. A model's leading slash is interpreted as the selected workspace root; drive-qualified paths, UNC paths, shell execution, deletion, path traversal, and linked-folder escapes are rejected.
