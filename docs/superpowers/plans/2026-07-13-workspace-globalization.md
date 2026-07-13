# 워크스페이스 전역 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/setup-workspace` 마지막에 한 번의 동의로, 스킬·에이전트·커맨드와 회사 보안 지침을 사용자 컴퓨터 전역(`~/.claude`)에 멱등적으로 적용한다.

**Architecture:** 버전관리되는 `globalize.sh`(mac/Linux, 심볼릭 링크) + `globalize.ps1`(Windows, 복사)를 두고, `setup-workspace.md`가 OS를 감지해 호출한다. 보안 지침은 단일 원천 파일(`global-security-block.md`)에서 전역 `~/.claude/CLAUDE.md`의 관리 블록으로 주입된다. 출처 매니페스트로 "우리가 만든 항목"을 추적해 재실행 시 충돌 오판을 막는다.

**Tech Stack:** Bash(외부 의존성 없음 — jq/bats 미사용), PowerShell(Windows), Markdown 슬래시 커맨드 프롬프트.

## Global Constraints

- Bash 스크립트는 `set -euo pipefail`로 시작한다.
- 외부 도구 의존 금지: `jq`, `bats` 등 사용 안 함. POSIX 도구(awk/grep/sed)만.
- 대상 전역 디렉터리는 `CLAUDE_GLOBAL_DIR` 환경변수로 오버라이드 가능해야 한다(기본값 `$HOME/.claude`). 테스트가 실제 홈을 건드리지 않게 하기 위함.
- 매니페스트 경로: `$CLAUDE_GLOBAL_DIR/.grandeclip-managed.json`. 항목은 `"category/name"` 형식(예: `"skills/brand-guidelines"`).
- 전역 CLAUDE.md 관리 블록 마커: `<!-- GRANDECLIP:START -->` … `<!-- GRANDECLIP:END -->`. 마커 밖 개인 내용은 절대 수정하지 않는다.
- 멱등: 스크립트를 몇 번 실행해도 결과가 같아야 한다.
- 이름이 겹치고 "우리 것"이 아닌 항목은 덮지 않고 충돌로 보고한다.
- 사용자 대면 문구는 한국어.
- 스크립트 위치: `00-system/02-scripts/`. 보안 원천: `00-system/03-guides/global-security-block.md`.

---

### Task 1: 보안 지침 단일 원천(SSOT) 파일

**Files:**
- Create: `00-system/03-guides/global-security-block.md`
- Test: `00-system/02-scripts/test-globalize.sh` (Task 2에서 생성; 여기선 존재 검증만 수동)

**Interfaces:**
- Consumes: 없음
- Produces: `global-security-block.md` — 마커 없이 보안 지침 본문만. 후속 스크립트가 `cat`으로 읽어 관리 블록에 주입한다.

- [ ] **Step 1: 원천 파일 작성**

`00-system/03-guides/global-security-block.md` 생성 (내용은 `.claude/commands/setup-workspace.md`의 보안 섹션과 동일한 회사 정책):

```markdown
## 🔒 보안 원칙 (필독 · OS·경로 무관 적용)

생성형 AI 활용은 적극 권장합니다. 단, 아래는 반드시 지켜주세요.
Claude는 작업을 막지 말되, 아래에 어긋나는 요청에는 **거부가 아니라 경고 + 안전한 대안**을 먼저 제시하세요.

> **Claude 지시(능동 감지)**: 사용자의 메시지에 비밀정보(API 키·비밀번호·토큰·`BEGIN ... PRIVATE KEY`)나 개인정보(주민등록번호 형식, 고객 개인정보)로 보이는 내용이 포함되면, **작업은 계속하되** 먼저 한 줄로 부드럽게 경고하고(예: "⚠️ 방금 API 키로 보이는 값이 있어요 — 외부로 나가면 위험합니다") 마스킹·익명화 같은 안전한 대안을 제안하세요. 이 감지는 OS·경로와 무관하게 매 대화에서 적용됩니다.

- **입력 금지**: 고객 개인정보, 미공개 실적·재무, 비밀번호·API 키·토큰, 계약/NDA 원문, 인사정보, 소스코드 내 비밀값
- **입력 전 자문**: "이 내용이 내일 뉴스에 나가도 괜찮은가?" → No면 입력하지 않기
- **민감정보는 익명화**: 고객명 → "고객 A", 매출 → "약 XX억 수준"
- **AI 결과물은 사람이 검증** 후 활용
- 사고 의심·문의 → **#gc-ai-라운지**
```

- [ ] **Step 2: 존재·내용 검증**

Run: `grep -c "보안 원칙" 00-system/03-guides/global-security-block.md`
Expected: `1` 이상 출력

- [ ] **Step 3: Commit**

```bash
git add 00-system/03-guides/global-security-block.md
git commit -m "feat: 회사 보안 지침 단일 원천 파일 추가"
```

---

### Task 2: globalize.sh — 링크·매니페스트·충돌 처리

**Files:**
- Create: `00-system/02-scripts/globalize.sh`
- Create: `00-system/02-scripts/test-globalize.sh`

**Interfaces:**
- Consumes: `$REPO/.claude/{skills,agents,commands}` (반영 대상), `CLAUDE_GLOBAL_DIR`(기본 `$HOME/.claude`)
- Produces: `globalize.sh` — 실행 시 skills/agents/commands를 전역에 링크하고 `$CLAUDE_GLOBAL_DIR/.grandeclip-managed.json`을 갱신. 요약을 stdout에 출력. Task 3이 같은 파일에 CLAUDE.md 주입 로직을 덧붙인다.

- [ ] **Step 1: 실패하는 테스트 작성**

`00-system/02-scripts/test-globalize.sh` 생성:

```bash
#!/usr/bin/env bash
# globalize.sh 테스트 — 임시 CLAUDE_GLOBAL_DIR 대상, 실제 홈 미변경
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GLOBALIZE="$SCRIPT_DIR/globalize.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
pass=0; fail=0
ok()   { echo "  ok: $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL: $1"; fail=$((fail+1)); }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (기대=$2 실제=$1)"; fi; }

newhome() { mktemp -d "${TMPDIR:-/tmp}/ggtest.XXXXXX"; }

echo "T2-a: 첫 실행 — skills 링크 생성"
H="$(newhome)"; CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
[ -L "$H/skills/brand-guidelines" ]; check "$?" "0" "brand-guidelines 링크 생성됨"
[ -f "$H/.grandeclip-managed.json" ]; check "$?" "0" "매니페스트 생성됨"
grep -q "skills/brand-guidelines" "$H/.grandeclip-managed.json"; check "$?" "0" "매니페스트에 항목 기록됨"
rm -rf "$H"

echo "T2-b: 재실행 멱등 — 링크 중복/오류 없음"
H="$(newhome)"; CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1; rc=$?
check "$rc" "0" "재실행 종료코드 0"
[ -L "$H/skills/brand-guidelines" ]; check "$?" "0" "재실행 후에도 링크 유효"
rm -rf "$H"

echo "T2-c: 충돌 — 우리 것이 아닌 동명 항목은 보존"
H="$(newhome)"; mkdir -p "$H/skills/brand-guidelines"
echo "user-own" > "$H/skills/brand-guidelines/marker.txt"
out="$(CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" 2>&1)"
[ -f "$H/skills/brand-guidelines/marker.txt" ]; check "$?" "0" "사용자 항목 덮이지 않음"
echo "$out" | grep -qi "충돌"; check "$?" "0" "충돌로 보고됨"
rm -rf "$H"

echo "결과: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `bash 00-system/02-scripts/test-globalize.sh`
Expected: FAIL — `globalize.sh` 없음(`No such file`)으로 대부분 FAIL

- [ ] **Step 3: globalize.sh 최소 구현**

`00-system/02-scripts/globalize.sh` 생성:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="$REPO_ROOT/.claude"
DEST="${CLAUDE_GLOBAL_DIR:-$HOME/.claude}"
MANIFEST="$DEST/.grandeclip-managed.json"

linked=0; skipped=0; conflicts=0
conflict_list=""
managed_now=""   # 이번 실행에서 관리하는 "cat/name" 목록(개행 구분)

mkdir -p "$DEST/skills" "$DEST/agents" "$DEST/commands"

# 기존 매니페스트 로드(따옴표로 감싼 "cat/name" 추출)
managed_prev=""
if [ -f "$MANIFEST" ]; then
  managed_prev="$(grep -o '"[^"]*"' "$MANIFEST" | tr -d '"' || true)"
fi

was_managed() { printf '%s\n' "$managed_prev" | grep -qxF "$1"; }

# "우리 것" 판별: 매니페스트에 있거나, repo .claude 안을 가리키는 심볼릭 링크
is_ours() {  # $1=key(cat/name)  $2=destpath
  was_managed "$1" && return 0
  if [ -L "$2" ]; then
    local t; t="$(readlink "$2")"
    case "$t" in "$SRC"/*) return 0;; esac
  fi
  return 1
}

process_category() {  # $1 = skills|agents|commands
  local cat="$1"
  [ -d "$SRC/$cat" ] || return 0
  local path name key dest
  for path in "$SRC/$cat"/*; do
    [ -e "$path" ] || continue
    name="$(basename "$path")"
    key="$cat/$name"
    dest="$DEST/$cat/$name"
    if is_ours "$key" "$dest"; then
      ln -sfn "$path" "$dest"
      managed_now="$managed_now$key"$'\n'
      skipped=$((skipped+1))
    elif [ -e "$dest" ]; then
      conflicts=$((conflicts+1))
      conflict_list="$conflict_list  - $key (이미 다른 내용이 있어 건너뜀)"$'\n'
    else
      ln -sfn "$path" "$dest"
      managed_now="$managed_now$key"$'\n'
      linked=$((linked+1))
    fi
  done
}

process_category skills
process_category agents
process_category commands

# 매니페스트 저장(JSON 배열)
{
  echo "["
  printf '%s' "$managed_now" | sed '/^$/d' | sort -u | \
    awk 'NR>1{printf ",\n"} {printf "  \"%s\"", $0} END{if(NR>0)printf "\n"}'
  echo "]"
} > "$MANIFEST"

echo "전역 적용 요약: 링크 $linked · 유지 $skipped · 충돌 $conflicts"
if [ "$conflicts" -gt 0 ]; then
  echo "충돌(덮지 않음):"
  printf '%s' "$conflict_list"
fi
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `bash 00-system/02-scripts/test-globalize.sh`
Expected: `결과: pass=7 fail=0`, 종료코드 0

- [ ] **Step 5: Commit**

```bash
git add 00-system/02-scripts/globalize.sh 00-system/02-scripts/test-globalize.sh
git commit -m "feat: globalize.sh — 스킬/에이전트/커맨드 전역 링크 + 멱등 매니페스트"
```

---

### Task 3: globalize.sh — 전역 CLAUDE.md 관리 블록 주입

**Files:**
- Modify: `00-system/02-scripts/globalize.sh` (끝에 CLAUDE.md 주입 로직 추가)
- Modify: `00-system/02-scripts/test-globalize.sh` (CLAUDE.md 테스트 추가)

**Interfaces:**
- Consumes: `00-system/03-guides/global-security-block.md`(Task 1), `$DEST/CLAUDE.md`
- Produces: 전역 `CLAUDE.md`에 `GRANDECLIP` 관리 블록 삽입/교체. 마커 밖 개인 내용 보존.

- [ ] **Step 1: 실패하는 테스트 추가**

`test-globalize.sh`의 `echo "결과..."` 줄 **앞에** 다음 블록 삽입:

```bash
echo "T3-a: CLAUDE.md 없을 때 — 관리 블록과 함께 생성"
H="$(newhome)"; CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
[ -f "$H/CLAUDE.md" ]; check "$?" "0" "CLAUDE.md 생성됨"
grep -q "GRANDECLIP:START" "$H/CLAUDE.md"; check "$?" "0" "시작 마커 존재"
grep -q "보안 원칙" "$H/CLAUDE.md"; check "$?" "0" "보안 지침 주입됨"
rm -rf "$H"

echo "T3-b: 기존 개인 내용 보존 + 블록 추가"
H="$(newhome)"; printf '# 내 개인 설정\n항상 존댓말.\n' > "$H/CLAUDE.md"
CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
grep -q "항상 존댓말" "$H/CLAUDE.md"; check "$?" "0" "개인 내용 보존됨"
grep -q "GRANDECLIP:START" "$H/CLAUDE.md"; check "$?" "0" "관리 블록 추가됨"
rm -rf "$H"

echo "T3-c: 재실행 시 블록 중복 없이 교체"
H="$(newhome)"; printf '# 개인\n메모.\n' > "$H/CLAUDE.md"
CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
CLAUDE_GLOBAL_DIR="$H" bash "$GLOBALIZE" >/dev/null 2>&1
cnt="$(grep -c "GRANDECLIP:START" "$H/CLAUDE.md")"
check "$cnt" "1" "시작 마커가 정확히 1개"
grep -q "메모." "$H/CLAUDE.md"; check "$?" "0" "재실행 후에도 개인 내용 보존"
rm -rf "$H"
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `bash 00-system/02-scripts/test-globalize.sh`
Expected: FAIL — CLAUDE.md 생성 안 됨(T3-a/b/c FAIL)

- [ ] **Step 3: globalize.sh에 주입 로직 추가**

`globalize.sh`에서 `process_category commands` **뒤, 매니페스트 저장 앞**에 삽입:

```bash
# 전역 CLAUDE.md 관리 블록 주입
SECURITY_BLOCK="$REPO_ROOT/00-system/03-guides/global-security-block.md"
CLAUDE_MD="$DEST/CLAUDE.md"
START="<!-- GRANDECLIP:START -->"
END="<!-- GRANDECLIP:END -->"
if [ -f "$SECURITY_BLOCK" ]; then
  tmp="$(mktemp)"
  if [ -f "$CLAUDE_MD" ] && grep -qF "$START" "$CLAUDE_MD"; then
    # 마커 사이 내용 교체
    awk -v s="$START" -v e="$END" -v bf="$SECURITY_BLOCK" '
      $0==s { print s; while ((getline line < bf) > 0) print line; close(bf); print e; skip=1; next }
      $0==e { skip=0; next }
      !skip { print }
    ' "$CLAUDE_MD" > "$tmp"
  else
    # 마커 없음 → 개인 내용 뒤에 추가(파일 없으면 새로 생성)
    { [ -f "$CLAUDE_MD" ] && cat "$CLAUDE_MD" && echo; echo "$START"; cat "$SECURITY_BLOCK"; echo "$END"; } > "$tmp"
  fi
  mv "$tmp" "$CLAUDE_MD"
  echo "전역 보안 지침(CLAUDE.md) 갱신 완료"
fi
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `bash 00-system/02-scripts/test-globalize.sh`
Expected: `결과: pass=14 fail=0`, 종료코드 0

- [ ] **Step 5: Commit**

```bash
git add 00-system/02-scripts/globalize.sh 00-system/02-scripts/test-globalize.sh
git commit -m "feat: globalize.sh — 전역 CLAUDE.md 관리 블록 멱등 주입"
```

---

### Task 4: globalize.ps1 — Windows 미러 (복사, 미검증)

**Files:**
- Create: `00-system/02-scripts/globalize.ps1`

**Interfaces:**
- Consumes: `$REPO/.claude/{skills,agents,commands}`, `global-security-block.md`, `$env:CLAUDE_GLOBAL_DIR`(기본 `$env:USERPROFILE\.claude`)
- Produces: `.sh`와 동등한 동작을 복사 기반으로 수행(심볼릭 링크 대신 `Copy-Item`). Windows 실기 테스트 불가 → "미검증" 주석.

- [ ] **Step 1: PowerShell 미러 작성**

`00-system/02-scripts/globalize.ps1` 생성:

```powershell
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
```

- [ ] **Step 2: 구문 점검(가능 시)**

macOS에 `pwsh`가 있으면: `pwsh -NoProfile -Command "$null = [ScriptBlock]::Create((Get-Content -Raw 00-system/02-scripts/globalize.ps1))"`
Expected: 오류 없음(파싱 성공). `pwsh` 미설치면 이 단계는 건너뛰고, 리뷰어가 `.sh`와 로직 일치를 눈으로 확인.

- [ ] **Step 3: Commit**

```bash
git add 00-system/02-scripts/globalize.ps1
git commit -m "feat: globalize.ps1 — Windows 복사 기반 전역 적용(미검증 미러)"
```

---

### Task 5: setup-workspace 연동 + SSOT 정렬

**Files:**
- Modify: `.claude/commands/setup-workspace.md`

**Interfaces:**
- Consumes: `00-system/02-scripts/globalize.sh` / `.ps1`, `global-security-block.md`
- Produces: 온보딩 마지막에 동의 → OS 감지 → 스크립트 실행 → 친근한 요약. workspace CLAUDE.md의 보안 섹션도 SSOT를 참조하도록 정렬.

- [ ] **Step 1: Step 3 보안 섹션을 SSOT 참조로 정렬**

`setup-workspace.md`의 "Step 3: CLAUDE.md 자동 생성" 하단 **중요** 목록에 다음 항목 추가:

```markdown
- **보안 섹션은 반드시 `00-system/03-guides/global-security-block.md`의 내용을 그대로 사용**할 것(회사 정책 단일 원천). 임의로 문구를 바꾸지 말 것.
```

- [ ] **Step 2: Step 6(전역 적용) 추가**

`setup-workspace.md`의 "### Step 5: 완료 안내" 블록 **뒤, `## 주의사항` 앞**에 삽입:

```markdown
---

### Step 6: 전역 적용 (선택)

완료 안내 후, 아래 문구로 **딱 한 번** 물어봅니다:

\```
마지막으로 — 방금 만든 설정(편리한 커맨드 + 회사 보안 지침)을
이 컴퓨터 어디서든 쓸 수 있게 해드릴까요? 추천해요 🙂  [예 / 아니오]
\```

**"예"인 경우:**
1. OS를 감지한다.
   - macOS/Linux → `bash 00-system/02-scripts/globalize.sh` 실행
   - Windows → `powershell -ExecutionPolicy Bypass -File 00-system/02-scripts/globalize.ps1` 실행
2. 스크립트의 요약 출력(링크/복사·유지·충돌 수)을 확인하고, 사용자에게는
   **친근한 한국어로** 전달한다. 예:
   \```
   ✅ 커맨드와 회사 보안 지침을 이 컴퓨터 전체에 적용했어요.
   이제 어느 폴더에서 Claude를 열어도 그대로 동작합니다.
   \```
3. 충돌이 보고되면, 덮지 않았음을 알리고 항목명을 그대로 전달한다.

**"아니오"인 경우:**
\```
알겠어요! 이 설정은 지금 워크스페이스 폴더 안에서만 동작합니다.
나중에 /setup-workspace를 다시 실행하면 언제든 전역 적용할 수 있어요.
\```

**주의:**
- 이 단계는 사용자의 개인 컴퓨터 전역 설정(`~/.claude`)을 바꿉니다. 반드시
  동의를 받은 뒤에만 스크립트를 실행하세요.
- Windows 복사 방식은 repo가 업데이트되면 재실행이 필요함을 함께 안내하세요.
```

- [ ] **Step 3: 문서 정합성 검증**

Run: `grep -n "Step 6" .claude/commands/setup-workspace.md && grep -n "global-security-block" .claude/commands/setup-workspace.md`
Expected: 두 grep 모두 매칭 라인 출력

- [ ] **Step 4: 전체 흐름 스모크 테스트(임시 홈)**

Run: `CLAUDE_GLOBAL_DIR="$(mktemp -d)" bash 00-system/02-scripts/globalize.sh`
Expected: `전역 적용 요약: ...`과 `전역 보안 지침(CLAUDE.md) 갱신 완료` 출력, 종료코드 0

- [ ] **Step 5: Commit**

```bash
git add .claude/commands/setup-workspace.md
git commit -m "feat: setup-workspace에 전역 적용(Step 6) + 보안 SSOT 정렬"
```

---

## 최종 검증 (전체 완료 후)

- [ ] `bash 00-system/02-scripts/test-globalize.sh` → `fail=0`
- [ ] 실제 `~/.claude`에 대해 1회 실행 → 앞서 수동 생성한 링크/CLAUDE.md가 멱등적으로 흡수되는지(중복·충돌 없이) 확인
- [ ] 전역 `~/.claude/CLAUDE.md`에 관리 블록이 정확히 1쌍이고 개인 내용이 보존됐는지 확인
