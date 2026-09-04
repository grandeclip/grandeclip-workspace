# grandeclip 전역 적용 (Windows) — 심볼릭 링크는 권한이 필요해 복사 사용.
# 주의: 이 스크립트는 Windows 실기에서 아직 검증되지 않았습니다(.sh 로직 미러).
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
$Src  = Join-Path $RepoRoot ".claude"
$Dest = if ($env:CLAUDE_GLOBAL_DIR) { $env:CLAUDE_GLOBAL_DIR } else { Join-Path $env:USERPROFILE ".claude" }
$Manifest = Join-Path $Dest ".grandeclip-managed.json"

foreach ($c in @("skills","agents","commands")) { New-Item -ItemType Directory -Force -Path (Join-Path $Dest $c) | Out-Null }

$prev = @()
if (Test-Path $Manifest) { try { $prev = Get-Content $Manifest -Raw | ConvertFrom-Json } catch { $prev = @() } }

$now = New-Object System.Collections.Generic.List[string]
$linked = 0; $skipped = 0; $conflicts = 0; $conflictList = @()

foreach ($cat in @("skills","agents","commands")) {
  $catDir = Join-Path $Src $cat
  if (-not (Test-Path $catDir)) { continue }
  foreach ($item in Get-ChildItem $catDir) {
    $key = "$cat/$($item.Name)"
    $target = Join-Path (Join-Path $Dest $cat) $item.Name
    $ours = ($prev -contains $key)
    if ($ours) {
      if (Test-Path $target) { Remove-Item $target -Recurse -Force }
      Copy-Item $item.FullName $target -Recurse -Force
      $now.Add($key); $skipped++
    } elseif (Test-Path $target) {
      $conflicts++; $conflictList += "  - $key (이미 다른 내용이 있어 건너뜀)"
    } else {
      Copy-Item $item.FullName $target -Recurse -Force
      $now.Add($key); $linked++
    }
  }
}

# 매니페스트 저장(PS 5.1 호환 — 수동 JSON 배열)
$uniq = $now | Sort-Object -Unique
$json = "[`n" + (($uniq | ForEach-Object { '  "' + $_ + '"' }) -join ",`n") + "`n]"
Set-Content -Path $Manifest -Value $json -Encoding UTF8

# 전역 CLAUDE.md 관리 블록 주입
$SecurityBlock = Join-Path $RepoRoot "00-system/03-guides/global-security-block.md"
$ClaudeMd = Join-Path $Dest "CLAUDE.md"
$Start = "<!-- GRANDECLIP:START -->"; $End = "<!-- GRANDECLIP:END -->"
if (Test-Path $SecurityBlock) {
  $block = Get-Content $SecurityBlock -Raw
  $wrapped = "$Start`n$block`n$End"
  if ((Test-Path $ClaudeMd) -and (Select-String -Path $ClaudeMd -SimpleMatch $Start -Quiet)) {
    # 마커 사이 내용 교체(치환 콜백으로 $wrapped를 그대로 삽입 — 이스케이프 이슈 없음)
    $content = Get-Content $ClaudeMd -Raw
    $pattern = [regex]::Escape($Start) + "(?s).*?" + [regex]::Escape($End)
    $new = [regex]::Replace($content, $pattern, { param($m) $wrapped })
    Set-Content -Path $ClaudeMd -Value $new -Encoding UTF8
  } else {
    $prefix = ""
    if (Test-Path $ClaudeMd) { $prefix = (Get-Content $ClaudeMd -Raw) + "`n" }
    Set-Content -Path $ClaudeMd -Value ($prefix + $wrapped) -Encoding UTF8
  }
}

Write-Output "전역 적용 요약: 복사 $linked · 유지 $skipped · 충돌 $conflicts"
if ($conflicts -gt 0) { Write-Output "충돌(덮지 않음):"; $conflictList | ForEach-Object { Write-Output $_ } }
