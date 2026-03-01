# tools/fetch-igraph-wasm.ps1
#
# Downloads and extracts the prebuilt kanaverse/igraph-wasm artifacts
# (libigraph.a + headers compiled for Emscripten 3.1.68).
#
# Usage (from repo root):
#   .\tools\fetch-igraph-wasm.ps1

param(
    [string]$Tag     = "v0.2.2-pthreads_3.1.68",
    [string]$Version = "0.10.13"
)

$ErrorActionPreference = "Stop"
$RepoRoot  = Split-Path $PSScriptRoot -Parent
$OutDir    = Join-Path $RepoRoot "wasm-igraph\igraph-wasm-artifacts"
$TmpTar    = Join-Path $env:TEMP "igraph-wasm.tar.gz"
$TmpExtract= Join-Path $env:TEMP "igraph-wasm-extract"

$Url       = "https://github.com/kanaverse/igraph-wasm/releases/download/$Tag/igraph-$Version-wasm.tar.gz"
$ExpectedSHA256 = "c099c1fc629bfe91e1e79d5799b3b2bb26f40f3b6100700b74ead1fd57e9c095"

Write-Host "=== fetch-igraph-wasm ===" -ForegroundColor Cyan
Write-Host "Tag    : $Tag"
Write-Host "Version: $Version"
Write-Host "Output : $OutDir"
Write-Host ""

# ------------------------------------------------------------------
# 1. Download
# ------------------------------------------------------------------
if (Test-Path $TmpTar) { Remove-Item $TmpTar -Force }

Write-Host "Downloading from $Url ..." -ForegroundColor Yellow
try {
    $ProgressPreference = 'SilentlyContinue'   # Speeds up Invoke-WebRequest significantly
    Invoke-WebRequest -Uri $Url -OutFile $TmpTar -UseBasicParsing
} catch {
    Write-Error "Download failed: $_"
    exit 1
}

# ------------------------------------------------------------------
# 2. Verify SHA256
# ------------------------------------------------------------------
Write-Host "Verifying SHA256 ..."
$actual = (Get-FileHash $TmpTar -Algorithm SHA256).Hash.ToLower()
if ($actual -ne $ExpectedSHA256) {
    Write-Error "SHA256 mismatch!`n  Expected: $ExpectedSHA256`n  Actual  : $actual"
    exit 1
}
Write-Host "SHA256 OK" -ForegroundColor Green

# ------------------------------------------------------------------
# 3. Extract (tar is built into Windows 10+ and Server 2019+)
# ------------------------------------------------------------------
if (Test-Path $TmpExtract) { Remove-Item $TmpExtract -Recurse -Force }
New-Item -ItemType Directory -Path $TmpExtract | Out-Null

Write-Host "Extracting ..."
& tar -xzf $TmpTar -C $TmpExtract
if ($LASTEXITCODE -ne 0) {
    Write-Error "tar extraction failed (exit $LASTEXITCODE). Ensure Windows tar (built-in) is available."
    exit 1
}

# ------------------------------------------------------------------
# 4. Detect layout: either a single wrapper dir, or flat include/lib
# ------------------------------------------------------------------
$TopDirs  = Get-ChildItem $TmpExtract | Where-Object { $_.PSIsContainer }
$TopFiles = Get-ChildItem $TmpExtract | Where-Object { -not $_.PSIsContainer }

# Flat layout: top level has both include/ and lib/ (kanaverse release format)
$hasInclude = $TopDirs | Where-Object { $_.Name -eq 'include' }
$hasLib     = $TopDirs | Where-Object { $_.Name -eq 'lib' }

if ($hasInclude -and $hasLib) {
    # Flat layout — copy entire extract root
    $SourceDir = $TmpExtract
    Write-Host "Detected flat layout (include/ + lib/ at root)"
} elseif ($TopDirs.Count -eq 1 -and $TopFiles.Count -eq 0) {
    # Single wrapper dir (old-style release)
    $SourceDir = $TopDirs[0].FullName
    Write-Host "Detected wrapped layout: $($TopDirs[0].Name)"
} else {
    Write-Error "Cannot determine archive layout. Top-level items: $($TopDirs.Name -join ', ')"
    exit 1
}

# ------------------------------------------------------------------
# 5. Copy to wasm-igraph/igraph-wasm-artifacts/
# ------------------------------------------------------------------
if (Test-Path $OutDir) {
    Write-Host "Removing existing $OutDir ..."
    Remove-Item $OutDir -Recurse -Force
}
Copy-Item "$SourceDir\*" -Destination $OutDir -Recurse -Force
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory $OutDir | Out-Null }

Write-Host ""
Write-Host "Installed artifacts:" -ForegroundColor Green
Get-ChildItem $OutDir -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    Write-Host "  $($_.FullName.Replace($RepoRoot + '\', ''))"
}

# ------------------------------------------------------------------
# 6. Cleanup temp files
# ------------------------------------------------------------------
Remove-Item $TmpTar -Force -ErrorAction SilentlyContinue
Remove-Item $TmpExtract -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Done! igraph-wasm artifacts ready. ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "NOTE: Build requires Emscripten 3.1.68 (must match artifact build)."
Write-Host "To install the correct version:"
Write-Host "  cd `$env:USERPROFILE\emsdk"
Write-Host "  .\emsdk.bat install 3.1.68"
Write-Host "  .\emsdk.bat activate 3.1.68"
Write-Host ""
Write-Host "Then build:"
Write-Host "  cd wasm-igraph"
Write-Host "  .\build_wasm.bat"
