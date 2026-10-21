# 준비된 Node.js로 위키를 실행하며 서버 인자를 그대로 전달한다.
$ErrorActionPreference = 'Stop'
$serverArguments = @($args)
$previousPath = $env:PATH
try {
  $workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $nodeExecutable = & (Join-Path $PSScriptRoot 'ensure-wiki-runtime.ps1')
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$nodeExecutable)) { throw '위키 실행 환경을 준비하지 못했습니다.' }
  $env:PATH = (Split-Path -Parent $nodeExecutable) + [IO.Path]::PathSeparator + $previousPath
  & $nodeExecutable (Join-Path $workspaceRoot '00-system/wiki-app/server.mjs') @serverArguments
  exit $LASTEXITCODE
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally {
  $env:PATH = $previousPath
}
