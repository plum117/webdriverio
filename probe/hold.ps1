# Holds the downloaded archive open the way a virus scan does: read access, no delete
# sharing, so a delete of the file fails on Windows. It waits for the build folder (the
# download is complete and the unpack runs), then opens the archive and keeps it open.
param([string]$Root, [string]$Pattern)
$ErrorActionPreference = 'SilentlyContinue'
$start = Get-Date
Write-Output READY
[Console]::Out.Flush()
while ($true) {
    $dirs = Get-ChildItem -LiteralPath $Root -Directory
    $archive = Get-ChildItem -LiteralPath $Root -File -Filter $Pattern | Select-Object -First 1
    if ($dirs -and $archive) {
        try {
            $h = [System.IO.File]::Open($archive.FullName, 'Open', 'Read', 'Read')
            Write-Output ("LOCKED {0} after {1:N1}s" -f $archive.Name, ((Get-Date) - $start).TotalSeconds)
            [Console]::Out.Flush()
            while ($true) { Start-Sleep -Seconds 1 }
        } catch {
            if (-not $failed) {
                Write-Output ("OPEN-FAILED {0}: {1}" -f $archive.Name, $_.Exception.Message)
                [Console]::Out.Flush()
                $failed = $true
            }
        }
    }
    Start-Sleep -Milliseconds 25
}
