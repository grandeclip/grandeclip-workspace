<p align="center">
  <img src="assets/grandeclip.png" alt="grande clip" width="440">
</p>

<h1 align="center">세계인의 일상에 한국을~</h1>

<p align="center">
  <b>K to Global</b> &nbsp;·&nbsp; BEAUTY &nbsp;|&nbsp; F&amp;B &nbsp;|&nbsp; SOUVENIR
</p>

<p align="center"><i>사소한 것을 위대하게</i></p>

---

# grandeclip 워크스페이스

> 전 임직원을 위한 AI 기반 업무 워크스페이스

---

## 🚀 시작하기 (5분)

### 1. Claude Code 설치
아직 없다면 먼저 설치합니다. 공식 안내를 그대로 따라가면 됩니다.

👉 **https://claude.com/claude-code**

> **Git 도 함께 필요합니다.** Claude Code에서 폴더를 열 때 쓰입니다.
> 새 컴퓨터에는 없는 게 정상이며, 딱 한 번만 설치하면 됩니다.
>
> - **맥**: 터미널에 `git --version` 을 입력하면 설치 창이 뜹니다. [설치] 를 누르고 기다리세요.
> - **윈도우**: https://git-scm.com/download/win 에서 받아 기본 설정 그대로 설치하세요.

### 2. 폴더 복사
공유받은 `grandeclip-workspace` 폴더를 본인 컴퓨터의 원하는 위치에 복사합니다.
> git을 몰라도 됩니다. 폴더를 복사하는 것으로 충분합니다.
> 압축을 풀었다면 폴더 안에 `install.sh` 와 `README.md` 가 보이는지 확인해 주세요.
> 없다면 복사가 덜 된 것입니다. (`.claude` 처럼 점으로 시작하는 폴더는 숨겨져 있어 보이지 않지만, 함께 복사되어야 합니다.)

### 3. Claude Code에서 그 폴더 열기
복사한 폴더를 Claude Code에서 엽니다.
처음 실행하면 **로그인 창(브라우저)** 이 뜹니다. 회사 계정으로 로그인해 주세요.

### 4. 초기 설정 — 이것만 입력하면 끝

```
/setup-workspace
```

나머지는 Claude가 알아서 합니다.

1. 필요한 **플러그인을 확인하고 없으면 설치**합니다 (몇 분 걸리고, 네트워크가 필요합니다). 폴더에 포함된 `career-os`도 함께 확인합니다.
2. 이름·직무·용도를 물어봅니다
3. **당신만의 CLAUDE.md**(보안 원칙 포함)와 첫 Daily Note를 만들어 줍니다

> 중간에 끊겼다면 `/setup-workspace` 를 다시 입력하면 됩니다. 여러 번 해도 안전합니다.

### 5. 보안 가이드 확인 (필독)
`00-system/03-guides/AI-보안-가이드.md`를 반드시 한 번 읽어주세요.

---

## 🧰 어떤 스킬이 들어있나요

설치가 끝나면 아래가 준비됩니다. 따로 외울 필요는 없고, 필요할 때 Claude에게 물어보면 됩니다.

**업무 스킬** — 기획·마케팅·세일즈·고객지원·디자인·데이터·개발·생산성 8종
직무에 맞는 것이 자동으로 동작합니다.

**작업 보조** — 복잡한 일을 단계로 나눠 진행하기(`superpowers`), 보안 점검(`security-guidance`),
AI 티 나는 한국어 다듬기(`humanize-korean`) 등

**문서·디자인** — 사내 공지 작성, 브랜드 가이드 적용, 포스터·이미지 제작

**폴더에 포함된 스킬 8종**: 확장 제작·브랜드·디자인·사내 커뮤니케이션용 7종과 취업 준비 `career-os`가 들어 있습니다.

`/setup-workspace`를 마치고 `/career-os`를 입력하면 관심 회사 대화부터 회사·공고 조사, 내 경험 확인, 강점 정리까지 이어갑니다. 명령이 보이지 않으면 새 대화를 열거나 Claude Code를 재시작하세요.

**워크스페이스 커맨드** — `/daily-note` `/todo` `/todos` `/idea` `/thinking-partner`

> 전체 목록과 구성 근거는 `00-system/README.md` 의 "스킬 구성" 항목에 있습니다.

---

## 🔧 스킬이 안 보일 때

`superpowers` 같은 스킬이 보이지 않는다면 설치가 덜 끝난 것입니다.
Claude Code에서 `/setup-workspace` 를 다시 실행하면 빠진 것만 채워 넣습니다.

`career-os` 파일이 빠졌다는 안내가 나오면 `.claude` 폴더를 포함한 워크스페이스를 다시 받아 주세요. 아래 설치 명령은 외부 플러그인만 확인합니다.

그래도 안 되면 **터미널에서 직접** 확인할 수 있습니다.
아래를 실행하면 **무엇이 빠졌는지 이름까지** 알려줍니다.

**macOS**

```bash
bash install.sh --check
```

**Windows** (시작 메뉴 → PowerShell)

```bash
powershell -ExecutionPolicy Bypass -File install.ps1 -Check
```

누락된 항목이 나오면 `--check` 를 뺀 명령으로 설치할 수 있습니다.
그래도 남으면 **출력 내용을 그대로 복사해 #gc-ai-라운지** 에 올려주시면 됩니다.

> 설치되는 스킬 목록은 `00-system/02-scripts/plugins.txt` 에 있습니다.
> 이 목록을 고치면 다음 설치부터 반영됩니다.

---

## 🔒 보안 안내

우리 회사는 생성형 AI 활용을 **적극 권장**합니다. 다만 몇 가지 원칙은 꼭 지켜주세요.

- **입력 금지**: 고객 개인정보, 미공개 실적·재무, 비밀번호·API 키, 계약/NDA 원문, 인사정보
- **입력 전 자문**: "이 내용이 내일 뉴스에 나가도 괜찮은가?"
- AI 결과물은 **사람이 검증 후** 활용
- 전문: `00-system/03-guides/AI-보안-가이드.md` / 문의·신고: **#gc-ai-라운지**

> 루트 `CLAUDE.md`에 보안 원칙이 담겨 있어 Claude가 매 대화에서 이를 인지하고, 민감정보(API 키·개인정보 등) 입력 시 **작업을 막지 않고 경고 + 안전한 대안**을 제시합니다. (OS 무관) 단, 다른 도구(ChatGPT 웹 등)에 직접 붙여넣는 것까지는 막지 못하니 각자 주의가 필요합니다.
> 정규식 기반 확정 스캐너가 필요한 팀은 `.claude/hooks/README.md`로 opt-in 할 수 있습니다.

---

## 📌 참고

- 일부 스킬(오피스 파일 생성, 데이터 분석 등)은 실행에 Python 등 별도 환경이 필요할 수 있습니다. 필요 시 Claude에게 물어보세요.
- 실습은 `00-system/claude-code-practice-guide.md`부터 시작하세요.
- CLAUDE.md 작성법: `00-system/03-guides/CLAUDE-MD-BEST-PRACTICES.md`
