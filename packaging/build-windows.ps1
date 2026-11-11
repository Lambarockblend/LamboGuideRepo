# LamboGuide local Windows build: installs Python + Inno Setup if missing, builds the helper exe and the installer.
# Runs at low priority so it does not disturb a running game. Output: LamboGuide-Setup-<version>.exe next to this script.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$work = Join-Path $env:TEMP "lamboguide-build"
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
New-Item -ItemType Directory -Force $work | Out-Null
[System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = "BelowNormal"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$h = @{ "User-Agent" = "LamboGuideBuild" }

function Step($t) { Write-Host "`n== $t" -ForegroundColor Yellow }

Step "Kaynak kod indiriliyor"
Invoke-WebRequest -Headers $h "https://github.com/Lambarockblend/LamboGuideRepo/archive/refs/heads/main.zip" -OutFile "$work\src.zip"
Expand-Archive "$work\src.zip" -DestinationPath $work -Force
$src = (Get-ChildItem $work -Directory | Where-Object { $_.Name -like "LamboGuideRepo*" } | Select-Object -First 1).FullName
$ver = (Get-Content "$src\version.json" -Raw | ConvertFrom-Json).version
Write-Host "Surum: $ver"

function FindPython {
  foreach ($p in @("$env:LOCALAPPDATA\Programs\Python\Python312\python.exe", "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe", "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe")) { if (Test-Path $p) { return $p } }
  $c = Get-Command python -ErrorAction SilentlyContinue
  if ($c -and $c.Source -notlike "*WindowsApps*") { return $c.Source }
  return $null
}
Step "Python"
$py = FindPython
if (-not $py) { winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements; $py = FindPython }
if (-not $py) { throw "Python kurulamadi" }
Write-Host $py
& $py -m pip install --quiet pyinstaller pystray pillow

Step "Inno Setup"
function FindIscc {
  foreach ($p in @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe")) { if (Test-Path $p) { return $p } }
  return $null
}
$iscc = FindIscc
if (-not $iscc) { winget install -e --id JRSoftware.InnoSetup --silent --accept-package-agreements --accept-source-agreements; $iscc = FindIscc }
if (-not $iscc) { throw "Inno Setup kurulamadi" }
Write-Host $iscc

Step "Codex CLI indiriliyor"
$rel = Invoke-RestMethod -Headers $h "https://api.github.com/repos/openai/codex/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -eq "codex-x86_64-pc-windows-msvc.exe.zip" } | Select-Object -First 1
if (-not $asset) { throw "Codex Windows dosyasi bulunamadi" }
New-Item -ItemType Directory -Force "$src\build\bin", "$src\build\codex" | Out-Null
Invoke-WebRequest -Headers $h $asset.browser_download_url -OutFile "$src\build\codex\codex.zip"
Expand-Archive "$src\build\codex\codex.zip" -DestinationPath "$src\build\codex" -Force
$main = Get-ChildItem "$src\build\codex" -Recurse -Filter "codex-x86_64-pc-windows-msvc.exe" | Select-Object -First 1
if (-not $main) { $main = Get-ChildItem "$src\build\codex" -Recurse -Filter "codex.exe" | Select-Object -First 1 }
Copy-Item $main.FullName "$src\build\bin\codex.exe"
Get-ChildItem "$src\build\codex" -Recurse -Filter "*.exe" | Where-Object { $_.FullName -ne $main.FullName } | ForEach-Object { Copy-Item $_.FullName "$src\build\bin\" }
Invoke-WebRequest -Headers $h "https://raw.githubusercontent.com/openai/codex/main/LICENSE" -OutFile "$src\build\bin\CODEX-LICENSE.txt"
& "$src\build\bin\codex.exe" --version

Step "Yardimci exe derleniyor (birkac dakika)"
Push-Location $src
& $py -m PyInstaller --noconfirm packaging\LamboGuideHelper.spec --distpath dist --workpath build\pyi
if ($LASTEXITCODE -ne 0) { throw "PyInstaller basarisiz" }

Step "Kurulum programi derleniyor"
& $iscc "/DMyVersion=$ver" packaging\LamboGuide.iss
if ($LASTEXITCODE -ne 0) { throw "Inno Setup basarisiz" }
Pop-Location

$out = Join-Path $here "LamboGuide-Setup-$ver.exe"
Copy-Item "$src\dist\LamboGuide-Setup-$ver.exe" $out -Force
Write-Host "`nHAZIR: $out" -ForegroundColor Green
