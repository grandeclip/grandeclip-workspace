param([switch]$Check)
# stdout is a single absolute Node executable path. Notices use the host stream.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Version = 'v24.22.1'
$MinMajor = 22
$TemporaryDirectory = $null
$LockDirectory = $null

function Assert-SafePath([string]$Path) {
  $FullPath = [IO.Path]::GetFullPath($Path)
  $Current = $FullPath
  while ($Current) {
    $Item = Get-Item -LiteralPath $Current -Force -ErrorAction SilentlyContinue
    if ($Item) {
      if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "링크 또는 reparse point 경로에는 설치하지 않습니다: $Current"
      }
    }
    $Parent = [IO.Path]::GetDirectoryName($Current)
    if ($Parent -eq $Current) { break }
    $Current = $Parent
  }
}

function Get-UsableNodeVersion([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  try {
    $PreviousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $Output = & $Path --version 2>$null
    $ExitCode = $LASTEXITCODE
    $ErrorActionPreference = $PreviousPreference
    $Value = ([string]($Output -join '')).Trim()
    if ($ExitCode -ne 0) { return $null }
    if ($Value -match '^v([0-9]+)\.([0-9]+)\.([0-9]+)$' -and [int]$Matches[1] -ge $MinMajor) {
      return $Value
    }
  } catch { return $null }
  finally { $ErrorActionPreference = 'Stop' }
  return $null
}

try {
  $Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
  Assert-SafePath $Root
  $Command = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($Command) {
    $PathNode = [IO.Path]::GetFullPath($Command.Source)
    if (Get-UsableNodeVersion $PathNode) {
      Write-Output $PathNode
      exit 0
    }
  }

  if ($env:OS -ne 'Windows_NT') {
    throw '이 스크립트는 Windows용입니다. macOS와 Linux에서는 Bash 스크립트를 실행해주세요.'
  }
  $Machine = $env:PROCESSOR_ARCHITECTURE
  if ($env:PROCESSOR_ARCHITEW6432) { $Machine = $env:PROCESSOR_ARCHITEW6432 }
  switch ($Machine.ToUpperInvariant()) {
    'ARM64' { $Architecture = 'arm64' }
    'AMD64' { $Architecture = 'x64' }
    default { throw '이 CPU에서는 자동 준비를 지원하지 않습니다. Node.js 22 이상을 직접 설치해주세요.' }
  }
  $Bundle = "node-$Version-win-$Architecture"
  $Archive = "$Bundle.zip"
  $Cache = Join-Path $Root '.workshop-runtime'
  $Target = Join-Path $Cache $Bundle
  $Node = Join-Path $Target 'node.exe'
  Assert-SafePath $Cache
  Assert-SafePath $Target
  Assert-SafePath $Node
  if ((Test-Path -LiteralPath $Cache) -and -not (Test-Path -LiteralPath $Cache -PathType Container)) {
    throw "동일한 이름의 파일을 보존했습니다: $Cache"
  }
  if (Test-Path -LiteralPath $Target) {
    if ((Test-Path -LiteralPath $Target -PathType Container) -and (Get-UsableNodeVersion $Node) -eq $Version) {
      Write-Output $Node
      exit 0
    }
    throw "기존 런타임을 덮어쓰지 않았습니다. 폴더를 확인해주세요: $Target"
  }
  if ($Check) {
    throw 'Node.js 22 이상이 아직 준비되지 않았습니다. 초기 설정을 실행하면 워크스페이스 안에 자동으로 준비합니다.'
  }

  $Manifest = Join-Path $PSScriptRoot 'node-runtime-manifest.txt'
  Assert-SafePath $Manifest
  if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) { throw '고정 버전 체크섬 파일이 없습니다.' }
  $ManifestVersion = $null
  $Expected = $null
  foreach ($Line in (Get-Content -LiteralPath $Manifest)) {
    $Line = $Line.Trim()
    if (-not $Line -or $Line.StartsWith('#')) { continue }
    $Fields = $Line -split '\s+'
    if ($Fields[0] -eq 'version') {
      if ($ManifestVersion -or $Fields.Count -ne 2) { throw '체크섬 파일의 버전 형식이 올바르지 않습니다.' }
      $ManifestVersion = $Fields[1]
    } elseif ($Fields.Count -ge 2 -and $Fields[1] -eq $Archive) {
      if ($Expected -or $Fields.Count -ne 2) { throw '중복된 체크섬 행이 있습니다.' }
      $Expected = $Fields[0]
    }
  }
  if ($ManifestVersion -ne $Version) { throw '런타임 버전과 체크섬 파일의 버전이 다릅니다.' }
  if (-not $Expected -or $Expected -cnotmatch '^[a-f0-9]{64}$') { throw '이 운영체제의 고정 체크섬이 없습니다.' }

  Assert-SafePath $Cache
  if (-not (Test-Path -LiteralPath $Cache)) {
    # CreateDirectory does not modify an existing directory.
    [void][IO.Directory]::CreateDirectory($Cache)
  }
  Assert-SafePath $Cache
  $ProposedLock = Join-Path $Cache ".$Bundle.lock"
  if (Test-Path -LiteralPath $ProposedLock) { throw '다른 초기 설정이 실행 중이거나 이전 잠금 폴더가 남아 있습니다. 잠시 후 다시 실행해주세요.' }
  # FileMode.CreateNew provides exclusive ownership without overwriting a prior lock.
  $LockStream = [IO.File]::Open($ProposedLock, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $LockDirectory = $ProposedLock
  $LockStream.Dispose()
  Assert-SafePath $Target
  if (Test-Path -LiteralPath $Target) { throw '다른 초기 설정이 런타임을 준비했습니다. 다시 실행해주세요.' }
  $TemporaryDirectory = Join-Path $Cache ('.node-install.' + [Guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($TemporaryDirectory)
  Assert-SafePath $TemporaryDirectory
  $Download = Join-Path $TemporaryDirectory $Archive
  Write-Host "Node.js $Version 를 워크스페이스에 준비합니다. 첫 실행에는 인터넷 연결이 필요합니다."
  # HTTPS is fixed; redirects are refused and normal certificate validation stays enabled.
  $PreviousProtocol = [Net.ServicePointManager]::SecurityProtocol
  try {
    [Net.ServicePointManager]::SecurityProtocol = $PreviousProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$Version/$Archive" -OutFile $Download -MaximumRedirection 0 -TimeoutSec 300 | Out-Null
  } catch {
    throw 'Node.js를 내려받지 못했습니다. 인터넷 연결을 확인한 뒤 다시 실행해주세요.'
  } finally { [Net.ServicePointManager]::SecurityProtocol = $PreviousProtocol }
  $Actual = (Get-FileHash -LiteralPath $Download -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -cne $Expected) { throw '다운로드 파일의 SHA-256이 공식 값과 다릅니다. 설치하지 않았습니다.' }
  Expand-Archive -LiteralPath $Download -DestinationPath $TemporaryDirectory
  $Extracted = Join-Path $TemporaryDirectory $Bundle
  $ExtractedNode = Join-Path $Extracted 'node.exe'
  Assert-SafePath $ExtractedNode
  if ((Get-UsableNodeVersion $ExtractedNode) -ne $Version) { throw '준비한 Node.js를 실행하지 못했거나 버전이 다릅니다.' }
  Assert-SafePath $Target
  # Directory.Move fails when the destination already exists; it never merges files.
  [IO.Directory]::Move($Extracted, $Target)
  Assert-SafePath $Node
  if ((Get-UsableNodeVersion $Node) -ne $Version) { throw '저장한 Node.js를 실행하지 못했습니다.' }
  Write-Output $Node
  exit 0
} catch {
  Write-Error ("위키 Node 준비 실패: " + $_.Exception.Message) -ErrorAction Continue
  exit 1
} finally {
  if ($TemporaryDirectory -and (Test-Path -LiteralPath $TemporaryDirectory)) {
    try {
      Assert-SafePath $TemporaryDirectory
      Remove-Item -LiteralPath $TemporaryDirectory -Recurse -Force
    } catch { Write-Warning '임시 폴더의 경로가 바뀌어 보존했습니다. 직접 확인해주세요.' }
  }
  if ($LockDirectory -and (Test-Path -LiteralPath $LockDirectory -PathType Leaf)) {
    try {
      Assert-SafePath $LockDirectory
      Remove-Item -LiteralPath $LockDirectory -Force
    } catch { Write-Warning '잠금 파일을 보존했습니다. 직접 확인해주세요.' }
  }
}
