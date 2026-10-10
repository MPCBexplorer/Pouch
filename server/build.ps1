# build.ps1 — 编译 server/src 到 server/out（阶段 0 骨架）。
# 用法：powershell -ExecutionPolicy Bypass -File build.ps1
# 不传入任何脚本参数端口/路径；这些是启动参数，忽略。
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent   # 仓库根目录
$src  = Join-Path $PSScriptRoot 'src'
$out  = Join-Path $PSScriptRoot 'out'
$lib  = Join-Path $PSScriptRoot 'lib'

Write-Host "[build] src  : $src" -ForegroundColor DarkGray
Write-Host "[build] out  : $out" -ForegroundColor DarkGray

# 找 javac / java（同一 JDK 的 bin 目录下）
$javac = (Get-Command javac -ErrorAction Stop).Source
$javaBin = Split-Path $javac -Parent
$java = Join-Path $javaBin 'java.exe'

# 清空旧产物
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $out | Out-Null

# 收集全部 .java
$files = Get-ChildItem $src -Filter *.java -Recurse | ForEach-Object { $_.FullName }
if (-not $files) { Write-Error "[build] 找不到源文件：$src" }
Write-Host "[build] 源文件 $($files.Count) 个" -ForegroundColor DarkGray

$cp = (Get-ChildItem $lib -Filter *.jar -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }) -join ';'
& $javac -encoding UTF-8 -cp $cp -d $out $files
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[build] 编译成功 → $out"
Write-Host "[build] 运行：powershell -ExecutionPolicy Bypass -File $PSScriptRoot\start.ps1"
