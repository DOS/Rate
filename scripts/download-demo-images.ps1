$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

param(
    [string]$SourceDirRel,
    [string]$DestDirRel
)

try {
    $root = Split-Path -Path $PSScriptRoot -Parent
    if (-not (Test-Path -LiteralPath $root)) { $root = (Get-Location).Path }

    if ([string]::IsNullOrWhiteSpace($SourceDirRel)) { $SourceDirRel = 'apps\ui\src\app\[locale]' }
    if ([string]::IsNullOrWhiteSpace($DestDirRel)) { $DestDirRel = 'apps\ui\public\img' }

    $SourceDir = Join-Path $root $SourceDirRel
    $DestDir = Join-Path $root $DestDirRel

    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

    $files = Get-ChildItem -LiteralPath $SourceDir -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @('.tsx', '.ts') }
    $paths = @{}

    foreach ($f in $files) {
        try {
            $content = [System.IO.File]::ReadAllText($f.FullName)
            $regex = [regex]'/img/([A-Za-z0-9_\/\-\.%]+)'
            foreach ($m in $regex.Matches($content)) {
                $rel = $m.Groups[1].Value
                if ($rel) { $paths[$rel] = $true }
            }
        }
        catch {}
    }

    $bases = @(
        'https://listinghub-shreethemes.netlify.app/img/',
        'https://listinghub-shreethemes.netlify.app/assets/img/',
        'https://listinghub-shreethemes.netlify.app/assets/images/',
        'https://listinghub-shreethemes.netlify.app/images/'
    )

    $ok = 0; $miss = 0; $log = @()

    foreach ($rel in $paths.Keys) {
        $outPath = Join-Path $DestDir $rel
        $outDir = Split-Path $outPath -Parent
        New-Item -ItemType Directory -Force -Path $outDir | Out-Null
        $done = $false
        foreach ($b in $bases) {
            $url = $b + $rel
            try {
                Invoke-WebRequest -Uri $url -OutFile $outPath -Headers @{ 'User-Agent' = 'Mozilla/5.0' } -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop
                $ok++; $log += ('OK  ' + $rel + '  <-  ' + $url)
                $done = $true; break
            }
            catch {}
        }
        if (-not $done) { $miss++; $log += ('MISS ' + $rel) }
    }

    Write-Output ('TOTAL OK: ' + $ok)
    Write-Output ('TOTAL MISS: ' + $miss)
    $log | Sort-Object | Select-Object -First 120 | ForEach-Object { Write-Output $_ }
}
catch {
    Write-Error $_
    exit 1
}


