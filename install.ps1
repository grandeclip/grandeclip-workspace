# grandeclip 워크스페이스 설치 (Windows)
#
#   powershell -ExecutionPolicy Bypass -File install.ps1            대화형 (권장)
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Yes       확인 없이 전부 진행
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Check     설치 없이 진단만
#
# 여러 번 실행해도 안전합니다. 이미 설치된 항목은 건너뜁니다.
#
# [설계 메모] 이 스크립트는 Windows 실기 검증 인력이 없는 상태에서 작성되었습니다.
# 그래서 Windows 고유 로직을 의도적으로 최소화했습니다 —
#   · JSON 파싱을 하지 않습니다 (문자열 포함 검사만)
#   · 심볼릭 링크·파일 복사를 하지 않습니다
#   · PowerShell 5.1(윈도우 기본 탑재) 문법만 사용합니다
#   · 이모지 대신 ASCII 기호를 씁니다 (구형 콘솔 깨짐 방지)
# 실제 작업은 전부 OS 중립인 claude CLI 가 수행하고,
# 이 스크립트는 마지막에 "정말 설치됐는지"를 스스로 확인해 결과를 보고합니다.

param(
  [switch]$Yes,
  [switch]$Check
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginList = Join-Path $ScriptDir "00-system\02-scripts\plugins.txt"

function Say  { param($m) Write-Host $m }
function Step { param($m) Write-Host ""; Write-Host $m -ForegroundColor White }
function Ok   { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn { param($m) Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Bad  { param($m) Write-Host "  [X]  $m" -ForegroundColor Red }

function Confirm-Step {
  param($Question)
  if ($Yes) { return $true }
  # 비대화형(예: Claude Code 가 /setup-workspace 에서 대신 실행)이면 묻지 않고 진행한다.
  # bash 쪽 confirm() 의 `[ -t 0 ] || return 0` 과 대칭을 맞춘 것.
  # PowerShell 7 은 이 처리가 없어도 즉시 빠져나오지만, 실제 배포 대상인 5.1 은
  # 검증할 수 없으므로 우연에 기대지 않고 명시한다.
  try { if ([Console]::IsInputRedirected) { return $true } } catch { }
  $reply = Read-Host "$Question [Y/n]"
  if ($reply -match '^[nN]') { return $false }
  return $true
}

# claude 를 찾는다. 방금 설치한 경우 PATH 에 아직 없을 수 있으므로 기본 위치도 본다.
function Find-Claude {
  if (Get-Command claude -ErrorAction SilentlyContinue) { return $true }
  $local = Join-Path $env:USERPROFILE ".local\bin"
  if (Test-Path (Join-Path $local "claude.exe")) {
    $env:PATH = "$local;$env:PATH"
    return $true
  }
  return $false
}

Say ""
Say "  grandeclip 워크스페이스 설치를 시작합니다."
Say "  -----------------------------------------"

# --- 1단계: 시스템 준비 확인 ---
# 스킬 저장소를 내려받으려면 git 이 필요합니다. Windows 에는 git 이 기본 탑재되어 있지 않습니다.
Step "1/4  시스템 준비 확인"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Warn "먼저 Git 을 설치해야 합니다."
  Say ""
  Say "     스킬을 내려받는 데 쓰이는 git 이 아직 없습니다."
  Say "     새 컴퓨터에서는 정상이며, 한 번만 설치하면 됩니다."
  Say ""
  if ($Check) {
    Say "     설치하려면: winget install --id Git.Git -e"
    exit 1
  }
  if (Confirm-Step "  지금 설치할까요?") {
    Say ""
    $installed = $false
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      try {
        & winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
        $installed = $true
      } catch { }
    }
    if ($installed) {
      Say ""
      Say "  -----------------------------------------"
      Say "  Git 설치가 끝났습니다."
      Say "  PowerShell 창을 새로 열고 이 명령을 다시 실행해 주세요:"
      Say ""
      Say "      powershell -ExecutionPolicy Bypass -File install.ps1"
      Say "  -----------------------------------------"
      Say ""
      exit 1
    }
    else {
      Bad "자동 설치에 실패했습니다."
      Say ""
      Say "     아래 주소에서 직접 내려받아 설치해 주세요(기본 설정 그대로 두시면 됩니다):"
      Say "         https://git-scm.com/download/win"
      Say ""
      Say "     설치 후 PowerShell 창을 새로 열고 다시 실행해 주세요."
      exit 1
    }
  }
  else {
    Say ""
    Say "  설치를 건너뛰었습니다. Git 없이는 스킬을 받을 수 없습니다."
    exit 1
  }
}

# 폴더 무결성 — .claude 는 점으로 시작하는 숨김 폴더라 압축·드라이브 업로드·
# 다운로드 과정에서 통째로 빠지는 사고가 잦습니다. 없으면 스킬은 정상적으로
# 받아지지만 /setup-workspace 를 비롯한 워크스페이스 커맨드가 전부 사라집니다.
# 설치 자체는 막지 않습니다 — 플러그인은 사용자 전역에 설치되므로 폴더를 다시
# 받아도 그대로 남고, 여기서 멈추면 기다린 시간만 버리게 됩니다.
$missingCommands = $false
if (-not (Test-Path (Join-Path $ScriptDir ".claude\commands\setup-workspace.md"))) {
  $missingCommands = $true
  Warn "워크스페이스 커맨드가 보이지 않습니다."
  Say ""
  Say "     .claude 폴더가 빠진 것 같습니다. 점으로 시작하는 폴더는 숨김 처리라"
  Say "     복사·압축·다운로드 과정에서 누락되는 일이 잦습니다."
  Say ""
  Say "     스킬 설치는 그대로 진행합니다(설치한 스킬은 이 폴더와 무관하게 남습니다)."
  Say "     다만 /setup-workspace 를 쓰려면 폴더를 다시 받아야 합니다."
}
else {
  Ok "준비 완료"
}

# --- 2단계: Claude Code 설치 확인 ---
Step "2/4  Claude Code 확인"

if (Find-Claude) {
  $ver = (& claude --version 2>$null | Select-Object -First 1)
  Ok "이미 설치되어 있습니다 ($ver)"
}
elseif ($Check) {
  Bad "Claude Code 가 설치되어 있지 않습니다."
  Say ""
  Say "  설치하려면: powershell -ExecutionPolicy Bypass -File install.ps1"
  exit 1
}
else {
  Say "  Claude Code 가 아직 없습니다."
  Say "  Anthropic 공식 설치 스크립트를 내려받아 실행합니다:"
  Say "    https://claude.ai/install.ps1"
  if (-not (Confirm-Step "  설치할까요?")) {
    Say ""
    Say "  설치를 건너뛰었습니다. Claude Code 없이는 진행할 수 없습니다."
    exit 1
  }
  Say ""
  try {
    Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression
  } catch {
    Bad "설치에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 실행해 주세요."
    Say "     $($_.Exception.Message)"
    exit 1
  }
  if (Find-Claude) {
    $ver = (& claude --version 2>$null | Select-Object -First 1)
    Ok "설치 완료 ($ver)"
  } else {
    Bad "설치는 끝났지만 claude 명령을 찾지 못했습니다."
    Say "     PowerShell 창을 새로 열고 install.ps1 을 다시 실행해 주세요."
    exit 1
  }
}

# --- 목록 읽기 ---
if (-not (Test-Path $PluginList)) {
  Bad "설치 목록을 찾을 수 없습니다: $PluginList"
  Say "     워크스페이스 폴더가 통째로 복사되었는지 확인해 주세요."
  exit 1
}

$markets = New-Object System.Collections.Generic.List[string]
$plugins = New-Object System.Collections.Generic.List[string]

foreach ($raw in (Get-Content $PluginList -Encoding UTF8)) {
  $line = $raw
  $hash = $line.IndexOf("#")
  if ($hash -ge 0) { $line = $line.Substring(0, $hash) }
  $line = $line.Trim()
  if ($line.Length -eq 0) { continue }
  $parts = $line -split '\s+', 2
  if ($parts.Count -lt 2) { continue }
  switch ($parts[0]) {
    "marketplace" { $markets.Add($parts[1].Trim()) }
    "plugin"      { $plugins.Add($parts[1].Trim()) }
  }
}

# --- 3단계: 마켓플레이스 + 플러그인 설치 ---
if ($Check) {
  Step "3/4  설치 (진단 모드이므로 건너뜀)"
}
else {
  Step "3/4  스킬 설치"
  Say "  잠시 걸립니다. 네트워크 연결이 필요합니다."
  Say ""

  foreach ($repo in $markets) {
    # 이미 등록된 저장소는 오류를 낼 수 있다.
    # 여기서는 무시하고 3단계에서 "실제 설치 상태"로 판정한다.
    try { & claude plugin marketplace add $repo --scope user 2>&1 | Out-Null } catch { }
    Say "  - 저장소 등록: $repo"
  }

  Say ""
  foreach ($id in $plugins) {
    try { & claude plugin install $id --scope user --yes 2>&1 | Out-Null } catch { }
    Say "  - 설치 시도: $($id.Split('@')[0])"
  }
}

# --- 4단계: 검증 (명령의 성공 여부가 아니라 실제 상태를 본다) ---
Step "4/4  설치 확인"

$installed = ""
try { $installed = (& claude plugin list --json 2>$null) -join "`n" } catch { }

if ([string]::IsNullOrWhiteSpace($installed)) {
  Bad "설치 목록을 읽지 못했습니다. Claude Code 가 정상인지 확인해 주세요."
  exit 1
}

$missing = New-Object System.Collections.Generic.List[string]
$foundN = 0

foreach ($id in $plugins) {
  # JSON 을 파싱하지 않는다. id 필드 문자열이 그대로 있는지만 본다.
  if ($installed.Contains('"id": "' + $id + '"')) { $foundN++ }
  else { $missing.Add($id) }
}

Say ""
if ($missing.Count -eq 0) {
  Ok "스킬 $foundN 개가 모두 설치되었습니다."
  Say ""
  Say "  -----------------------------------------"
  Say "  아직 Claude Code 를 열지 않았다면:"
  Say ""
  Say "    1. 이 폴더에서 claude 를 실행하세요"
  Say "    2. /setup-workspace 를 입력하세요"
  Say ""
  Say "  claude 명령을 못 찾으면 PowerShell 창을 새로 열어 주세요."
  Say ""
  if ($missingCommands) {
    Warn "다만 .claude 폴더가 빠져 있어 /setup-workspace 는 쓸 수 없습니다."
    Say "     공유받은 폴더를 다시 받아 주세요. 스킬은 이미 설치되어 그대로 남습니다."
    Say ""
  }
  exit 0
}
else {
  Warn "설치됨 $foundN 개 · 누락 $($missing.Count) 개"
  Say ""
  Say "  설치되지 않은 항목:"
  foreach ($m in $missing) { Say "  - $m" }
  Say ""
  Say "  대부분 네트워크 문제입니다. 아래를 순서대로 시도해 보세요."
  Say ""
  Say "    1) install.ps1 을 한 번 더 실행"
  Say "    2) 그래도 남으면 위 내용을 그대로 #gc-ai-라운지 에 올려주세요"
  Say ""
  exit 1
}
