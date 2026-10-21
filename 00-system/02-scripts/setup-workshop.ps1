# 수업용 번들 파일 준비. PowerShell 5.1 이상, 네트워크/CLI/전역 설정 불필요.
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
if ([string]::IsNullOrWhiteSpace($Tool)) {
  Write-Host '오류: -Tool Claude 또는 -Tool Codex를 지정해 주세요.'
  exit 2
}
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Source = Join-Path $Root '.claude/skills/career-os'
$Required = @(
  'SKILL.md', 'skills/company-research/SKILL.md', 'skills/job-scout/SKILL.md',
  'skills/experience-extract/SKILL.md', 'skills/application-build/SKILL.md',
  'agents/research.md', 'agents/experience.md', 'agents/writing.md', 'references/runtime-contract.md'
)
$SourceFiles = New-Object 'System.Collections.Generic.List[string]'
$SourceDirs = New-Object 'System.Collections.Generic.List[string]'
$SourceDirs.Add('')
$Stage = $null
$CreatedAgents = $false
$CreatedSkills = $false
$Agents = Join-Path $Root '.agents'
$Skills = Join-Path $Agents 'skills'
$Dest = Join-Path $Skills 'career-os'
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
  if ($null -eq $entry -or -not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "번들 디렉터리를 읽을 수 없습니다: $Directory"
  }
  foreach ($item in (Get-ChildItem -Force -LiteralPath $Directory -ErrorAction Stop)) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "번들에 링크가 있습니다: $($item.FullName)" }
    $relative = $item.FullName.Substring($Base.Length + 1)
    if ($item.PSIsContainer) {
      if ($Record) { $SourceDirs.Add($relative) }
      Read-Bundle $item.FullName $Base $Record
    } else {
      # 해시 계산으로 실제 읽기를 확인한다.
      $null = Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256 -ErrorAction Stop
      if ($Record) { $SourceFiles.Add($relative) }
    }
  }
}
function Compare-Bundle([string]$Target) {
  foreach ($relative in $SourceDirs) {
    $path = $Target
    if ($relative.Length -gt 0) { $path = Join-Path $Target $relative }
    $entry = Get-Entry $path
    if ($null -eq $entry -or -not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "충돌 또는 누락: $path"
    }
  }
  foreach ($relative in $SourceFiles) {
    $path = Join-Path $Target $relative
    $entry = Get-Entry $path
    if ($null -eq $entry -or $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "충돌 또는 누락: $path" }
    $original = Get-Item -LiteralPath (Join-Path $Source $relative)
    if ($entry.Length -ne $original.Length -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $original.FullName -Algorithm SHA256).Hash) {
      throw "충돌: 번들과 내용이 다릅니다: $path"
    }
  }
}
function Write-Ready {
  Write-Host "파일 준비 확인: .agents/skills/career-os (필수 9개, 전체 $($SourceFiles.Count)개 파일)"
  Write-Host '다음: 이 워크스페이스의 새 Codex 대화에서 career-os와 기본 내장 skill-creator가 스킬 목록에 보이는지 확인해 주세요.'
}
try {
  Write-Host "현재 도구: $Tool"
  $missing = $false
  foreach ($relative in $Required) {
    $path = Join-Path $Source $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "누락: $path"; $missing = $true }
  }
  if ($Tool -eq 'Claude') {
    $creator = Join-Path $Root '.claude/skills/skill-creator'
    $creatorRequired = @(
      'SKILL.md',
      'LICENSE.txt',
      'agents/analyzer.md',
      'agents/comparator.md',
      'agents/grader.md',
      'assets/eval_review.html',
      'eval-viewer/generate_review.py',
      'eval-viewer/viewer.html',
      'references/schemas.md',
      'scripts/__init__.py',
      'scripts/aggregate_benchmark.py',
      'scripts/generate_report.py',
      'scripts/improve_description.py',
      'scripts/package_skill.py',
      'scripts/quick_validate.py',
      'scripts/run_eval.py',
      'scripts/run_loop.py',
      'scripts/utils.py'
    )
    foreach ($relative in $creatorRequired) {
      $path = Join-Path $creator $relative
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Host "누락: $path"; $missing = $true }
    }
  }
  if ($missing) { throw '필수 번들 파일을 확인해 주세요.' }
  Read-Bundle $Source $Source $true
  if ($Tool -eq 'Claude') {
    Read-Bundle $creator $creator $false
    Write-Host "파일 준비 확인: .claude/skills/career-os (필수 9개, 전체 $($SourceFiles.Count)개 파일), .claude/skills/skill-creator"
    Write-Host '다음: 이 워크스페이스의 새 Claude 대화에서 career-os와 skill-creator가 스킬 목록에 보이는지 확인해 주세요.'
    exit 0
  }
  Assert-Directory $Agents
  Assert-Directory $Skills
  Assert-Directory $Dest
  if (Test-Path -LiteralPath $Dest -PathType Container) {
    Compare-Bundle $Dest
    Write-Ready
    exit 0
  }
  if ($Check) { throw "준비 파일 누락: $Dest (-Check 없이 같은 명령을 실행해 주세요.)" }
  $Stage = Join-Path $Root ('.workshop-skills.' + [Guid]::NewGuid().ToString('N'))
  $null = New-Item -ItemType Directory -Path $Stage
  $stageCareer = Join-Path $Stage 'career-os'
  Copy-Item -LiteralPath $Source -Destination $stageCareer -Recurse -Force
  Compare-Bundle $stageCareer
  Assert-Directory $Agents
  Assert-Directory $Skills
  Assert-Directory $Dest
  if ($null -ne (Get-Entry $Dest)) { throw "충돌: 복사 중 대상이 생겼습니다: $Dest" }
  if (-not (Test-Path -LiteralPath $Agents)) { $null = New-Item -ItemType Directory -Path $Agents; $CreatedAgents = $true }
  if (-not (Test-Path -LiteralPath $Skills)) { $null = New-Item -ItemType Directory -Path $Skills; $CreatedSkills = $true }
  # Directory.Move는 기존 대상에 중첩하거나 덮지 않고 실패한다.
  [IO.Directory]::Move($stageCareer, $Dest)
  Write-Ready
  exit 0
} catch {
  Write-Host "오류: $($_.Exception.Message)"
  Write-Host '파일 준비가 완료되지 않았습니다. 기존 개인 파일은 덮어쓰지 않습니다.'
  exit 1
} finally {
  if ($Stage -and (Test-Path -LiteralPath $Stage)) { Remove-Item -LiteralPath $Stage -Recurse -Force }
  if ($CreatedSkills -and (Test-Path -LiteralPath $Skills)) { try { [IO.Directory]::Delete($Skills, $false) } catch { } }
  if ($CreatedAgents -and (Test-Path -LiteralPath $Agents)) { try { [IO.Directory]::Delete($Agents, $false) } catch { } }
}
