# run-bg.ps1 — 后台启动 PouchServer（用于验证）。把 PID 写到 server\server.pid。
# 用法：powershell -ExecutionPolicy Bypass -File server\run-bg.ps1 [-Data D:\xxx] [-Port 9000]
param(
    [string]$Data = '',
    [string]$Web  = '',
    [int]$Port    = 0
)
$ErrorActionPreference = 'Stop'
$wd       = Split-Path $PSScriptRoot -Parent
$script   = Join-Path $PSScriptRoot 'start.ps1'
$logOut   = Join-Path $PSScriptRoot 'run.log'
$logErr   = Join-Path $PSScriptRoot 'run.err.log'
if (Test-Path $logOut) { Remove-Item $logOut -Force }
if (Test-Path $logErr) { Remove-Item $logErr -Force }

$scriptArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$script)
if ($Data) { $scriptArgs += "-Data=$Data" }
if ($Web)  { $scriptArgs += "-Web=$Web" }
if ($Port) { $scriptArgs += "-Port=$Port" }

# cwd 必须是 server/（与 PouchServer.java 中 user.dir→repoRoot 的假设一致）
$serverDir = Split-Path $PSScriptRoot -Parent
# $PSScriptRoot = 本脚本所在目录 = server/
$p = Start-Process -FilePath 'powershell.exe' -ArgumentList $scriptArgs `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $logOut `
    -RedirectStandardError  $logErr `
    -WindowStyle Hidden -PassThru
$p.Id | Out-File (Join-Path $PSScriptRoot 'server.pid') -Encoding ascii
Write-Host ("BG PID " + $p.Id)
