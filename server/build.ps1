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
# build.ps1 — 编译 server/src 到 server/out，并可选打包分发包。
# 用法：
#   powershell -ExecutionPolicy Bypass -File build.ps1
#   powershell -ExecutionPolicy Bypass -File build.ps1 -Version 1.2.3
#
# 参数：
#   -Version  可选版本号字符串。传入后会替换 README.md 与 settings.html 中的版本徽章，
#             并打包为解压即用的分发 zip。
#   例：build.ps1 -Version 1.2.3+beta      
#
# 不传入 -Version 时只做编译，不打包。
param(
    [string]$Version = ""
)

$ErrorActionPreference = 'Stop'

# 设置控制台编码为 UTF-8，避免 javac 中文输出在 Windows 中文环境下乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path $PSScriptRoot -Parent   # 仓库根目录
$src  = Join-Path $PSScriptRoot 'src'
$out  = Join-Path $PSScriptRoot 'out'
$lib  = Join-Path $PSScriptRoot 'lib'
$web  = Join-Path $root 'web'

Write-Host "[build] root : $root" -ForegroundColor DarkGray
Write-Host "[build] src  : $src" -ForegroundColor DarkGray
Write-Host "[build] out  : $out" -ForegroundColor DarkGray
Write-Host "[build] lib  : $lib" -ForegroundColor DarkGray

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
# javac 的 stderr 使用系统默认编码（Windows 中文环境为 GBK），与 PowerShell UTF-8 控制台不兼容，导致乱码。
# 通过 JAVA_TOOL_OPTIONS 让 JVM 使用 GBK 输出 javac 错误消息，与控制台编码一致，避免乱码。
# 编译成功时只有警告，不影响使用；编译失败时 $LASTEXITCODE 非零，脚本会停止。
$origJavaToolOptions = $env:JAVA_TOOL_OPTIONS
$env:JAVA_TOOL_OPTIONS = "-Dfile.encoding=GBK"
& $javac -encoding UTF-8 -cp $cp -d $out $files
$env:JAVA_TOOL_OPTIONS = $origJavaToolOptions
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[build] 编译成功 -> $out"

# ---- 版本替换（如传入 -Version） ----
if ($Version) {
    Write-Host "[build] 替换版本徽章为：$Version" -ForegroundColor Cyan

    # README.md：替换 ![Version](https://img.shields.io/badge/Version-...)
    $readme = Join-Path $root 'README.md'
    if (Test-Path $readme) {
        $content = Get-Content $readme -Raw -Encoding UTF8
        $content = $content -replace 'Version-.*?-success', "Version-$Version-success"
        Set-Content $readme -Value $content -Encoding UTF8
        Write-Host "[build] 已更新 README.md 版本徽章" -ForegroundColor DarkGray
    }

    # settings.html：替换 <img src="...Version-...">
    $settings = Join-Path $web 'settings.html'
    if (Test-Path $settings) {
        $content = Get-Content $settings -Raw -Encoding UTF8
        $content = $content -replace 'Version-.*?-success', "Version-$Version-success"
        Set-Content $settings -Value $content -Encoding UTF8
        Write-Host "[build] 已更新 settings.html 版本徽章" -ForegroundColor DarkGray
    }

    # README.en.md：替换 ![Version](https://img.shields.io/badge/Version-...)
    $readmeEn = Join-Path $root 'README.zh_cn.md'
    if (Test-Path $readmeEn) {
        $content = Get-Content $readmeEn -Raw -Encoding UTF8
        $content = $content -replace 'Version-.*?-success', "Version-$Version-success"
        Set-Content $readmeEn -Value $content -Encoding UTF8
        Write-Host "[build] 已更新 README.zh_cn.md 版本徽章" -ForegroundColor DarkGray
    }

    # settings.js：替换 CURRENT_VERSION 常量
    $settingsJs = Join-Path $web 'js\settings.js'
    if (Test-Path $settingsJs) {
        $content = Get-Content $settingsJs -Raw -Encoding UTF8
        $content = $content -replace "const CURRENT_VERSION = '[^']*';", "const CURRENT_VERSION = '$Version';"
        Set-Content $settingsJs -Value $content -Encoding UTF8
        Write-Host "[build] 已更新 settings.js 版本号：$Version" -ForegroundColor DarkGray
    }

    # index.js：替换 CURRENT_VERSION 常量
    $indexJs = Join-Path $web 'js\index.js'
    if (Test-Path $indexJs) {
        $content = Get-Content $indexJs -Raw -Encoding UTF8
        $content = $content -replace "const CURRENT_VERSION = '[^']*';", "const CURRENT_VERSION = '$Version';"
        Set-Content $indexJs -Value $content -Encoding UTF8
        Write-Host "[build] 已更新 index.js 版本号：$Version" -ForegroundColor DarkGray
    }
}

# ---- 打包分发包（如传入 -Version） ----
if ($Version) {
    $distRoot = Join-Path $root 'dist'
    $pkgRoot  = Join-Path $distRoot 'pouch'
    if (Test-Path $pkgRoot) { Remove-Item $pkgRoot -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $pkgRoot | Out-Null

    # 1) 编译产物：server/out -> pouch/server/out
    $dstOut = Join-Path (Join-Path $pkgRoot 'server') 'out'
    Copy-Item $out $dstOut -Recurse -Force
    Write-Host "[build] 复制 server/out -> $dstOut" -ForegroundColor DarkGray

    # 2) 库文件：server/lib -> pouch/server/lib
    $dstLib = Join-Path (Join-Path $pkgRoot 'server') 'lib'
    Copy-Item $lib $dstLib -Recurse -Force
    Write-Host "[build] 复制 server/lib -> $dstLib" -ForegroundColor DarkGray

    # 3) 启动脚本：server/start.ps1 -> pouch/server/
    Copy-Item (Join-Path $PSScriptRoot 'start.ps1') (Join-Path (Join-Path $pkgRoot 'server') 'start.ps1') -Force
    Write-Host "[build] 复制脚本 start.ps1" -ForegroundColor DarkGray
    Copy-Item (Join-Path $root 'start.bat') (Join-Path $pkgRoot 'start.bat') -Force
    Write-Host "[build] 复制脚本 start.bat" -ForegroundColor DarkGray

    # 4) 前端：web/ -> pouch/web/
    $dstWeb = Join-Path $pkgRoot 'web'
    Copy-Item $web $dstWeb -Recurse -Force
    Write-Host "[build] 复制 web/ -> $dstWeb" -ForegroundColor DarkGray

    # 5) README.md -> pouch/README.md
    Copy-Item $readme (Join-Path $pkgRoot 'README.md') -Force
    Write-Host "[build] 复制 README.md" -ForegroundColor DarkGray

    # 6) README.zh_cn.md -> pouch/README.zh_cn.md
    $readmeZh = Join-Path $root 'README.zh_cn.md'
    if (Test-Path $readmeZh) {
        Copy-Item $readmeZh (Join-Path $pkgRoot 'README.zh_cn.md') -Force
        Write-Host "[build] 复制 README.zh_cn.md" -ForegroundColor DarkGray
    }

    # 7) NOTICE -> pouch/NOTICE
    $notice = Join-Path $root 'NOTICE'
    if (Test-Path $notice) {
        Copy-Item $notice (Join-Path $pkgRoot 'NOTICE') -Force
        Write-Host "[build] 复制 NOTICE" -ForegroundColor DarkGray
    }

    # 8) LICENSE -> pouch/LICENSE
    $license = Join-Path $root 'LICENSE'
    if (Test-Path $license) {
        Copy-Item $license (Join-Path $pkgRoot 'LICENSE') -Force
        Write-Host "[build] 复制 LICENSE" -ForegroundColor DarkGray
    }

    # 9) CONTRIBUTING.md -> pouch/CONTRIBUTING.md
    $contributing = Join-Path $root 'CONTRIBUTING.md'
    if (Test-Path $contributing) {
        Copy-Item $contributing (Join-Path $pkgRoot 'CONTRIBUTING.md') -Force
        Write-Host "[build] 复制 CONTRIBUTING.md" -ForegroundColor DarkGray
    }

    # 10) 打包 zip：pouch-<version>.zip
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipName = "pouch-$Version.zip"
    $zipPath = Join-Path $distRoot $zipName
    if (Test-Path $zipPath) {
        try { Remove-Item $zipPath -Force -ErrorAction Stop } catch {}
    }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($pkgRoot, $zipPath)

    # 只保留 zip，删除中间目录
    Remove-Item $pkgRoot -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "[build] 分发包已生成：$zipPath" -ForegroundColor Green
    Write-Host "[build] 可直接解压使用，运行：pouch/server/start.ps1" -ForegroundColor Green
}

Write-Host "[build] 完成" -ForegroundColor Green
