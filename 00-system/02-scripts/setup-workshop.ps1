# 수업용 파일 준비는 오프라인으로 수행한다. PowerShell 5.1 이상.
[CmdletBinding()]
param(
  [ValidateSet('Claude', 'Codex')][string]$Tool,
  [switch]$Check,
  [switch]$Yes,
  [switch]$Help
)
$ErrorActionPreference = 'Stop'
if ($Help) {
  Write-Host '사용법: powershell -NoProfile -ExecutionPolicy Bypass -File 00-system\02-scripts\setup-workshop.ps1 -Tool Claude|Codex [-Check] [-Yes]'
  exit 0
}
if ([string]::IsNullOrWhiteSpace($Tool)) { Write-Host '오류: -Tool Claude 또는 -Tool Codex를 지정해 주세요.'; exit 2 }
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Bundles = @('career-os', 'karpathy-llm-wiki')
$Required = @{
  'career-os' = @('SKILL.md', 'skills/company-research/SKILL.md', 'skills/job-scout/SKILL.md', 'skills/experience-extract/SKILL.md', 'skills/application-build/SKILL.md', 'agents/research.md', 'agents/experience.md', 'agents/writing.md', 'references/runtime-contract.md')
  'karpathy-llm-wiki' = @('SKILL.md', 'LICENSE', 'references/raw-template.md', 'references/article-template.md', 'references/index-template.md', 'references/archive-template.md', 'references/workshop.md', 'scripts/check_evidence.py')
}
$CreatorRequired = @('SKILL.md', 'LICENSE.txt', 'agents/analyzer.md', 'agents/comparator.md', 'agents/grader.md', 'assets/eval_review.html', 'eval-viewer/generate_review.py', 'eval-viewer/viewer.html', 'references/schemas.md', 'scripts/__init__.py', 'scripts/aggregate_benchmark.py', 'scripts/generate_report.py', 'scripts/improve_description.py', 'scripts/package_skill.py', 'scripts/quick_validate.py', 'scripts/run_eval.py', 'scripts/run_loop.py', 'scripts/utils.py')
$AppRequired = @('server.mjs', 'lib/application.mjs', 'lib/providers.mjs', 'lib/store.mjs', 'public/index.html', 'public/app.js', 'public/style.css', 'package.json')
$SourceFiles = New-Object 'System.Collections.Generic.List[string]'
$SourceDirs = New-Object 'System.Collections.Generic.List[string]'
$Source = ''
$Stage = $null
$CreatedAgents = $false
$CreatedSkills = $false
$Success = $false
$Moved = New-Object 'System.Collections.Generic.List[string]'
$Agents = Join-Path $Root '.agents'
$Skills = Join-Path $Agents 'skills'
function Get-Entry([string]$Path) { Get-Item -Force -LiteralPath $Path -ErrorAction SilentlyContinue }
function Assert-Directory([string]$Path) {
  $entry = Get-Entry $Path
  if ($null -ne $entry) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "충돌: 링크 경로에는 쓰지 않습니다: $Path" }
    if (-not $entry.PSIsContainer) { throw "충돌: 디렉터리가 아닙니다: $Path" }
  }
}
function Read-Bundle([string]$Directory, [string]$Base, [bool]$Record) {
  $entry = Get-Entry $Directory
  if ($null -eq $entry -or -not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "번들 디렉터리를 읽을 수 없습니다: $Directory" }
  foreach ($item in (Get-ChildItem -Force -LiteralPath $Directory -ErrorAction Stop)) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "번들에 링크가 있습니다: $($item.FullName)" }
    $relative = $item.FullName.Substring($Base.Length + 1)
    if ($item.PSIsContainer) {
      if ($Record) { $SourceDirs.Add($relative) }
      Read-Bundle $item.FullName $Base $Record
    } else {
      $null = Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256 -ErrorAction Stop
      if ($Record) { $SourceFiles.Add($relative) }
    }
  }
}
function Set-Bundle([string]$Name) {
  $script:Source = Join-Path $Root ('.claude/skills/' + $Name)
  $script:SourceFiles = New-Object 'System.Collections.Generic.List[string]'
  $script:SourceDirs = New-Object 'System.Collections.Generic.List[string]'
  $SourceDirs.Add('')
  Read-Bundle $Source $Source $true
}
function Compare-Bundle([string]$Target) {
  foreach ($relative in $SourceDirs) {
    $path = $Target
    if ($relative.Length -gt 0) { $path = Join-Path $Target $relative }
    $entry = Get-Entry $path
    if ($null -eq $entry -or -not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "충돌 또는 누락: $path" }
  }
  foreach ($relative in $SourceFiles) {
    $path = Join-Path $Target $relative
    $entry = Get-Entry $path
    if ($null -eq $entry -or $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "충돌 또는 누락: $path" }
    $original = Get-Item -LiteralPath (Join-Path $Source $relative)
    if ($entry.Length -ne $original.Length -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $original.FullName -Algorithm SHA256).Hash) { throw "충돌: 번들과 내용이 다릅니다: $path" }
  }
}
function Write-RuntimeStatus {
  $major = 0
  if (Get-Command node -ErrorAction SilentlyContinue) {
    try { $version = & node -p 'Number(process.versions.node.split(".")[0])' 2>$null; if ($LASTEXITCODE -eq 0) { $null = [int]::TryParse(($version | Select-Object -First 1), [ref]$major) } } catch { $major = 0 }
  }
  if ($major -ge 20) { Write-Host "위키 실행 환경: Node.js $major 확인. AI 도구 로그인은 위키를 열 때 확인합니다." }
  elseif ($major -gt 0) { Write-Host "위키 실행 환경 미준비: Node.js $major 입니다. 20 이상을 설치해 주세요." }
  else { Write-Host '위키 실행 환경 미확인: Node.js 20 이상이 필요합니다. 초기 설정 AI에게 공식 Node.js 설치 안내를 요청해 주세요.' }
  Write-Host '위키 열기: node 00-system/wiki-app/server.mjs (현재 사용할 Claude Code 또는 Codex CLI에 로그인이 필요합니다.)'
}
function Write-Ready {
  if ($Tool -eq 'Claude') { Write-Host '파일 준비 확인: .claude/skills/career-os, .claude/skills/karpathy-llm-wiki, .claude/skills/skill-creator' }
  else { Write-Host '파일 준비 확인: .agents/skills/career-os, .agents/skills/karpathy-llm-wiki' }
  Write-Host '위키 앱 파일 준비 확인: 00-system/wiki-app/'
  Write-Host "다음: 같은 폴더의 새 $Tool 대화에서 career-os, karpathy-llm-wiki, skill-creator의 실제 인식을 확인해 주세요."
  Write-RuntimeStatus
}
try {
  Write-Host "현재 도구: $Tool"
  $missing = $false
  foreach ($bundle in $Bundles) {
    foreach ($relative in $Required[$bundle]) {
      $path = Join-Path (Join-Path $Root ('.claude/skills/' + $bundle)) $relative
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "누락: $path"; $missing = $true }
    }
  }
  foreach ($relative in $AppRequired) {
    $path = Join-Path (Join-Path $Root '00-system/wiki-app') $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "누락: $path"; $missing = $true }
  }
  $creator = Join-Path $Root '.claude/skills/skill-creator'
  if ($Tool -eq 'Claude') {
    foreach ($relative in $CreatorRequired) {
      $path = Join-Path $creator $relative
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "누락: $path"; $missing = $true }
    }
  }
  if ($missing) { throw '필수 번들 파일을 확인해 주세요.' }
  foreach ($bundle in $Bundles) { Set-Bundle $bundle }
  $app = Join-Path $Root '00-system/wiki-app'
  Read-Bundle $app $app $false
  if ($Tool -eq 'Claude') { Read-Bundle $creator $creator $false; Write-Ready; exit 0 }
  Assert-Directory $Agents
  Assert-Directory $Skills
  $pending = New-Object 'System.Collections.Generic.List[string]'
  foreach ($bundle in $Bundles) {
    Set-Bundle $bundle
    $dest = Join-Path $Skills $bundle
    Assert-Directory $dest
    if (Test-Path -LiteralPath $dest -PathType Container) { Compare-Bundle $dest }
    elseif ($Check) { throw "준비 파일 누락: $dest (-Check 없이 같은 명령을 실행해 주세요.)" }
    else { $pending.Add($bundle) }
  }
  if ($pending.Count -eq 0) { Write-Ready; exit 0 }
  $Stage = Join-Path $Root ('.workshop-skills.' + [Guid]::NewGuid().ToString('N'))
  $null = New-Item -ItemType Directory -Path $Stage
  foreach ($bundle in $pending) {
    Set-Bundle $bundle
    $stageBundle = Join-Path $Stage $bundle
    Copy-Item -LiteralPath $Source -Destination $stageBundle -Recurse -Force
    Compare-Bundle $stageBundle
  }
  Assert-Directory $Agents
  Assert-Directory $Skills
  foreach ($bundle in $pending) {
    $dest = Join-Path $Skills $bundle
    Assert-Directory $dest
    if ($null -ne (Get-Entry $dest)) { throw "충돌: 복사 중 대상이 생겼습니다: $dest" }
  }
  if (-not (Test-Path -LiteralPath $Agents)) { $null = New-Item -ItemType Directory -Path $Agents; $CreatedAgents = $true }
  if (-not (Test-Path -LiteralPath $Skills)) { $null = New-Item -ItemType Directory -Path $Skills; $CreatedSkills = $true }
  foreach ($bundle in $pending) {
    [IO.Directory]::Move((Join-Path $Stage $bundle), (Join-Path $Skills $bundle))
    $Moved.Add($bundle)
  }
  $Success = $true
  Write-Ready
  exit 0
} catch {
  Write-Host "오류: $($_.Exception.Message)"
  Write-Host '파일 준비가 완료되지 않았습니다. 기존 개인 파일은 덮어쓰지 않습니다.'
  exit 1
} finally {
  if (-not $Success) {
    foreach ($bundle in $Moved) {
      try { Set-Bundle $bundle; $dest = Join-Path $Skills $bundle; Compare-Bundle $dest; Remove-Item -LiteralPath $dest -Recurse -Force } catch { }
    }
  }
  if ($Stage -and (Test-Path -LiteralPath $Stage)) { Remove-Item -LiteralPath $Stage -Recurse -Force }
  if ($CreatedSkills -and (Test-Path -LiteralPath $Skills)) { try { [IO.Directory]::Delete($Skills, $false) } catch { } }
  if ($CreatedAgents -and (Test-Path -LiteralPath $Agents)) { try { [IO.Directory]::Delete($Agents, $false) } catch { } }
}
