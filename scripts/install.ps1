# Install Lumen Studio to D:\LLM AI\Lumen Studio and create Start Menu + Desktop shortcuts
$ErrorActionPreference = "Stop"

$Source      = "D:\LLM AI\lumen-studio\release-artifacts\win-unpacked"
$InstallDir  = "D:\LLM AI\Lumen Studio"
$AppName     = "Lumen Studio"
$ExeName     = "Lumen Studio.exe"
$ExePath     = Join-Path $InstallDir $ExeName

function Assert-ChildPath($path, $parent, $label) {
    $fullPath = [IO.Path]::GetFullPath($path).TrimEnd('\')
    $fullParent = [IO.Path]::GetFullPath($parent).TrimEnd('\') + '\'
    if (-not $fullPath.StartsWith($fullParent, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$label must stay inside $parent (resolved to $fullPath)"
    }
    return $fullPath
}

$Source = Assert-ChildPath $Source "D:\LLM AI" "Package source"
$InstallDir = Assert-ChildPath $InstallDir "D:\LLM AI" "Install directory"
$ExePath = Join-Path $InstallDir $ExeName
if (-not (Test-Path -LiteralPath (Join-Path $Source $ExeName) -PathType Leaf)) {
    throw "Packaged application not found: $(Join-Path $Source $ExeName)"
}

# 1. Copy the unpacked app to the final install location
Write-Host "Installing to $InstallDir ..."
if (Test-Path $InstallDir) {
    Get-Process -Name $AppName -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.Path.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) } |
        Stop-Process -Force
    Start-Sleep -Milliseconds 500
    Write-Host "  removing existing install..."
    Remove-Item -LiteralPath $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item -Path "$Source\*" -Destination $InstallDir -Recurse -Force
Write-Host "  done."

# 2. Helper to create a .lnk
function New-Shortcut($targetPath, $shortcutPath, $iconPath) {
    $wsh = New-Object -ComObject WScript.Shell
    $s = $wsh.CreateShortcut($shortcutPath)
    $s.TargetPath = $targetPath
    $s.WorkingDirectory = (Split-Path $targetPath -Parent)
    $s.IconLocation = "$iconPath,0"
    $s.Description = $AppName
    $s.WindowStyle = 7   # minimized? no — 1 = normal, 7 = normal for shortcut
    $s.Save()
}

# 3. Create Start Menu shortcut (Programs folder for current user)
$startMenu = [Environment]::GetFolderPath("Programs")
$startMenuShortcut = Join-Path $startMenu "$AppName.lnk"
New-Shortcut -targetPath $ExePath -shortcutPath $startMenuShortcut -iconPath $ExePath
Write-Host "Start Menu shortcut: $startMenuShortcut"

# 4. Create Desktop shortcut
$desktop = [Environment]::GetFolderPath("Desktop")
$desktopShortcut = Join-Path $desktop "$AppName.lnk"
New-Shortcut -targetPath $ExePath -shortcutPath $desktopShortcut -iconPath $ExePath
Write-Host "Desktop shortcut:    $desktopShortcut"

# 5. Write an uninstall helper
$uninst = Join-Path $InstallDir "Uninstall.bat"
@"
@echo off
echo Removing $AppName...
taskkill /IM ""$ExeName"" /F 2>nul
timeout /t 2 /nobreak >nul
rd /s /q ""$InstallDir""
del ""$startMenuShortcut"" 2>nul
del ""$desktopShortcut"" 2>nul
echo Done.
pause
"@ | Set-Content -Encoding ASCII $uninst

# 6. Notify Windows shell about new shortcuts so Win-key search picks it up
$signature = @"
[DllImport("shell32.dll")]
public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
"@
try {
    Add-Type -MemberDefinition $signature -Namespace Win32 -Name Shell32
    # SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0x0000
    [Win32.Shell32]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
    Write-Host "Notified Windows shell."
} catch {
    Write-Host "(Could not notify shell, but shortcuts exist on disk.)"
}

Write-Host ""
Write-Host "Install complete." -ForegroundColor Green
Write-Host "Press the Windows key and type 'Lumen' to find the app."
