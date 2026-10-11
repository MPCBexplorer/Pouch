# check-constraints.ps1 — 全仓库反向搜索约束检查（Ticket 09 / spec Testing Decisions）
# 用法：powershell -ExecutionPolicy Bypass -File scripts\check-constraints.ps1
# 退出码 0 = 全部通过；1 = 有违反。可在 start.ps1 之前集成。
param(
    [string]$Repo = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$fail = 0

function Report($ok, $name, $detail) {
    if ($ok) { Write-Host ("  PASS " + $name) -ForegroundColor Green }
    else { Write-Host ("  FAIL " + $name + " -- " + $detail) -ForegroundColor Red; $script:fail++ }
}

Write-Host "=== 1) innerHTML：仅允许 dom.js 的 DOMPurify.sanitize 后赋值那一处 ==="
$ih = Get-ChildItem -Path (Join-Path $Repo 'web') -Filter *.js -Recurse |
      Where-Object { $_.FullName -notmatch '\\vendor\\' } |
      ForEach-Object { Select-String -Path $_.FullName -Pattern 'innerHTML' -AllMatches }
$bad = $ih | Where-Object { $_.Filename -ne 'dom.js' }
Report ($bad.Count -eq 0 -and $ih.Count -eq 1) "innerHTML 唯一且在 dom.js" ("found " + $ih.Count + " occurrences")

Write-Host "=== 2) 颜色字面量：仅 tokens.css ==="
$lit = Get-ChildItem -Path (Join-Path $Repo 'web\css') -Filter *.css |
       ForEach-Object { Select-String -Path $_.FullName -Pattern '#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(' -AllMatches }
$litBad = $lit | Where-Object { $_.Filename -ne 'tokens.css' }
Report ($litBad.Count -eq 0) "颜色字面量全部在 tokens.css" (($litBad | ForEach-Object { $_.Filename }) -join ', ')

Write-Host "=== 3) fetch：仅 api.js ==="
$fc = Get-ChildItem -Path (Join-Path $Repo 'web\js') -Filter *.js -Recurse |
      Where-Object { $_.FullName -notmatch '\\vendor\\' } |
      ForEach-Object { Select-String -Path $_.FullName -Pattern '\bfetch\s*\(' -AllMatches }
$fcBad = $fc | Where-Object { $_.Filename -ne 'api.js' }
Report ($fcBad.Count -eq 0 -and $fc.Count -eq 1) "fetch 唯一且在 api.js" ("found " + $fc.Count + " occurrences")

Write-Host "=== 4) 数据文件名：仅 Category.java ==="
$files = Get-ChildItem -Path (Join-Path $Repo 'server\src') -Filter *.java -Recurse |
         ForEach-Object { Select-String -Path $_.FullName -Pattern '"(inspirations|questions|knowledge|todos|wishlist)\.json"' -AllMatches }
$filesBad = $files | Where-Object { $_.Filename -ne 'Category.java' }
Report ($filesBad.Count -eq 0) "数据文件名字面量仅在 Category.java" (($filesBad | ForEach-Object { $_.Filename + ':' + $_.LineNumber }) -join ', ')

Write-Host "=== 5) CSS var() 全部有定义 ==="
$cssDir = Join-Path $Repo 'web\css'
$defined = @{}
Select-String -Path (Join-Path $cssDir 'tokens.css') -Pattern '^\s*(--[\w-]+)\s*:' |
    ForEach-Object { $defined[$_.Matches[0].Groups[1].Value] = $true }
$undef = @()
Get-ChildItem -Path $cssDir -Filter *.css | ForEach-Object {
    Select-String -Path $_.FullName -Pattern 'var\((--[\w-]+)\)' -AllMatches | ForEach-Object {
        foreach ($m in $_.Matches) { if (-not $defined.ContainsKey($m.Groups[1].Value)) { $undef += $m.Groups[1].Value } }
    }
}
Report ($undef.Count -eq 0) "无未定义 CSS 变量" (($undef | Sort-Object -Unique) -join ', ')

Write-Host ""
if ($fail -eq 0) { Write-Host "ALL CONSTRAINTS PASS" -ForegroundColor Green; exit 0 }
Write-Host ("$fail CHECK(S) FAILED") -ForegroundColor Red
exit 1
