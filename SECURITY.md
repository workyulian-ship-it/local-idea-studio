# Security policy

## Supported version

Security fixes currently target the newest v0.1.x early-access release.

## Reporting a vulnerability

Please report security problems privately to the repository owner through GitHub rather than opening a public issue containing exploit details. Include the affected version, reproduction steps, expected behavior, and impact.

Never attach Hugging Face tokens, private model URLs, chats, settings files, logs containing personal information, or other secrets to a public issue.

## Release verification

The Windows v0.1.4 installer is not code-signed. Confirm its SHA-256 digest using:

```powershell
Get-FileHash -Algorithm SHA256 '.\Local Idea Studio-0.1.4-win-x64.exe'
```

Compare the result with [`SHA256SUMS.txt`](./SHA256SUMS.txt). A different digest means the file must not be trusted or executed.
