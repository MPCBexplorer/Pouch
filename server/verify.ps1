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
# verify.ps1 — HTTP acceptance tests (PowerShell 5.1 compatible)
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8787'

function Get-Code([string]$url) {
    try {
        $h = [System.Net.HttpWebRequest]::Create($url)
        $h.Method = 'GET'
        $h.Timeout = 5000
        $resp = $h.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        return $code
    } catch [System.Net.WebException] {
        $r = $_.Exception.Response
        if ($r) { return [int]$r.StatusCode } else { return -1 }
    }
}

$checks = @(
    , @('/',               200, 'home (/)')
    , @('/index.html',     200, 'home explicit .html')
    , @('/list.html',      200, 'list page')
    , @('/detail.html',    200, 'detail page')
    , @('/wishlist.html',  200, 'wishlist page')
    , @('/api/health',     200, 'health check')
)

$pass = 0
$fails = 0
foreach ($c in $checks) {
    $u = $c[0]; $expect = $c[1]; $name = $c[2]
    $actual = Get-Code "$base$u"
    if ($actual -eq $expect) {
        $pass++
        Write-Host ("  PASS " + $u + "  ->  " + $actual + "   (" + $name + ")")
    } else {
        $fails++
        Write-Host ("  FAIL " + $u + "  expected " + $expect + " got " + $actual + "   (" + $name + ")")
    }
}

function Get-RawCode([string]$hostName, [int]$port, [string]$requestLine) {
    try {
        $sock = New-Object System.Net.Sockets.TcpClient($hostName, $port)
        $stream = $sock.GetStream()
        $writer = New-Object System.IO.StreamWriter($stream)
        $writer.WriteLine($requestLine)
        $writer.WriteLine("Host: ${hostName}:${port}")
        $writer.WriteLine("Connection: close")
        $writer.WriteLine()
        $writer.Flush()
        $reader = New-Object System.IO.StreamReader($stream)
        $statusLine = $reader.ReadLine()
        $sock.Close()
        if ($statusLine -match 'HTTP/\d\.\d (\d+)') { return [int]$matches[1] }
        return -1
    } catch { return -1 }
}

# Path traversal: raw socket sends literal .. segments, no normalization.
$travActual = Get-RawCode '127.0.0.1' 8787 'GET /../../data/todos.json HTTP/1.1'
if (($travActual -eq 403) -or ($travActual -eq 404)) {
    $pass++
    Write-Host ("  PASS /../../data/todos.json -> " + $travActual + "   (path traversal blocked)")
} else {
    $fails++
    Write-Host ("  FAIL /../../data/todos.json  expected 403/404 got " + $travActual)
}

# Unknown non-/api path falls back to index.html (200, not 404)
$fbActual = Get-Code ($base + '/not-exist-abc')
if ($fbActual -eq 200) {
    $pass++
    Write-Host ("  PASS /not-exist-abc -> " + $fbActual + "   (unknown path falls back to index.html)")
} else {
    $fails++
    Write-Host ("  FAIL /not-exist-abc  expected 200 got " + $fbActual)
}

Write-Host ""
Write-Host ("Result: PASS {0} / FAIL {1}" -f $pass, $fails)
if ($fails -gt 0) {
    Write-Host 'FAILURES present, check above.' -ForegroundColor Red
    exit 1
}
Write-Host 'All passed' -ForegroundColor Green