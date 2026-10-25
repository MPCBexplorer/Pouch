<#
.COPYRIGHT
    Copyright 2026 MPCBexplorer

.LICENSE
    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
#>
param(
    [string]$Data = '',        # 覆盖 --data=（PouchServer 的启动参数，不是脚本参数）
    [string]$Web  = '',
    [int]$Port    = 0
)
# start.ps1 — 一条命令起服务：检测源码变更则重编译 + 启动 PouchServer。
# 用法：powershell -ExecutionPolicy Bypass -File server\start.ps1 [-Data D:\xxx] [-Web D:\yyy] [-Port 9000]
# 不传参数时使用默认值（data=仓库根/data，web=仓库根/web，port=8787）。
$ErrorActionPreference = 'Stop'
$serverDir  = $PSScriptRoot
$repoRoot   = Split-Path $serverDir -Parent
$src        = Join-Path $serverDir 'src'
$out        = Join-Path $serverDir 'out'
$lib        = Join-Path $serverDir 'lib'

# ---- 找 JDK ----
$javac = $null
$java  = $null
if (Get-Command javac -ErrorAction SilentlyContinue) {
    $javac = (Get-Command javac).Source
    $java  = Join-Path (Split-Path $javac -Parent) 'java.exe'
}
$candidates = @('C:\Program Files\Microsoft\jdk-21.0.8.9-hotspot\bin\javac.exe',
                "$env:JAVA_HOME\bin\javac.exe")
foreach ($c in $candidates) {
    if (-not $javac -and (Test-Path $c)) { $javac = $c }
}
if (-not $javac) { Write-Error "[start] 找不到 javac，请安装 JDK 21 或添加 PATH" }
if (-not $java) { $java = Join-Path (Split-Path $javac -Parent) 'java.exe' }

# ---- 检测源码变更 ----
$stale = $false
if (-not (Test-Path $out)) {
    $stale = $true
} else {
    $newestSrc = (Get-ChildItem $src -Filter *.java -Recurse |
                    Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
    $newestCls = Get-ChildItem $out -Filter *.class -Recurse -ErrorAction SilentlyContinue
    $newestOut = if ($newestCls) { ($newestCls | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc } else { [DateTime]::MinValue }
    if ($newestSrc -gt $newestOut) { $stale = $true }
}

if ($stale) {
    Write-Host "[start] 源码有变更，重新编译…" -ForegroundColor Yellow
    & (Join-Path $serverDir 'build.ps1')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Host "[start] 无变更，跳过编译" -ForegroundColor DarkGray
}

# ---- 组装启动参数（透传给 PouchServer，缺省时用默认值兜底） ----
# 整个 -cp 为一个单参数传入：out 目录 + lib 下所有 jar（Java classpath 的 * 通配符）
# 单参数避免了 PowerShell 拆分/展开出分号或星号字符。
$cpEntries = @((Join-Path $serverDir 'out'))
$libs = Get-ChildItem $lib -Filter *.jar -ErrorAction SilentlyContinue
foreach ($j in $libs) { $cpEntries += $j.FullName }
$cp = $cpEntries -join ';'
$javaArgs = @('-cp', $cp, 'com.pouch.PouchServer')
if ($Data) { $javaArgs += "--data=$Data" }
if ($Web)  { $javaArgs += "--web=$Web" }
if ($Port -gt 0) { $javaArgs += "--port=$Port" }

Write-Host "[start] 启动服务…"
Write-Host "[start] javac: $javac"
Write-Host "[start] java : $java"
Write-Host "[start] cp   : $cp"
Write-Host "[start] args : $($javaArgs -join ' ')"
& $java @javaArgs
exit $LASTEXITCODE
