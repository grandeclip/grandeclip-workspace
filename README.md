# grandeclip 워크스페이스

> 전 임직원을 위한 AI 기반 업무 워크스페이스
> Claude Code + Johnny Decimal 파일 체계

이 워크스페이스는 신입/전임직원이 Claude Code로 업무를 정리하고 실습하기 위한 **시작 템플릿**입니다. 각자 자신의 로컬에 복사해 개인 워크스페이스로 사용하세요.

---

## 🚀 시작하기 (5분)

### 1. 폴더 복사
공유받은 `grandeclip-workspace` 폴더를 본인 컴퓨터의 원하는 위치에 복사합니다.
> git을 몰라도 됩니다. 폴더를 복사하는 것으로 충분합니다.

### 2. Claude Code에서 열기
복사한 폴더에서 Claude Code를 실행합니다. (VS Code 또는 터미널)

### 3. 플러그인 설치 승인 (최초 1회)
처음 열면 Claude Code가 **마켓플레이스 신뢰 / 플러그인 설치** 확인을 물어봅니다.
→ 이 워크스페이스에 설정된 플러그인들이니 **승인(설치)** 해주세요. 이후에는 다시 묻지 않습니다.
> 네트워크 연결이 필요하며, 최초 1회만 승인하면 됩니다.

### 4. 초기 설정
```
/setup-workspace
```
이름·직무·용도를 물어본 뒤 **당신만의 CLAUDE.md**(보안 원칙 포함)와 첫 Daily Note를 자동 생성합니다.

### 5. 보안 가이드 확인 (필독)
`00-system/03-guides/AI-보안-가이드.md`를 반드시 한 번 읽어주세요.

---

## 📁 폴더 구조 (Johnny Decimal)

```
00-inbox/       - 빠른 캡처 (임시 보관, 주기적으로 비우기)
00-system/      - 템플릿, 가이드, 시스템 문서
10-projects/    - 활성 프로젝트 (시한부, 완료 시 90-archive로)
20-operations/  - 지속적 운영 업무
30-knowledge/   - 검증된 지식 아카이브
40-personal/    - Daily Note, Weekly Review, 아이디어, Todos
50-resources/   - 참고 자료 (PDF, 데이터 등)
90-archive/     - 완료/중단 항목
```

**네이밍 규칙**: `[숫자]-[설명적-이름]` (예: `11-website-redesign`)

---

## ⌨️ 커맨드

| 커맨드 | 용도 |
|--------|------|
| `/setup-workspace` | 대화형 개인 CLAUDE.md 생성 + 초기 설정 |
| `/daily-note` | 오늘 Daily Note 생성/열기 |
| `/todo`, `/todos` | 할 일 추가 / 목록 관리 |
| `/thinking-partner` | 생각 정리 파트너 (소크라테스식 질문) |
| `/idea` | 대화에서 아이디어 추출·저장 |
| `/create-command` | 나만의 커스텀 커맨드 생성 |

---

## 🧩 스킬 & 에이전트 (내장, 바로 사용)

`.claude/skills/`, `.claude/agents/`에 다음이 포함되어 있습니다:

- **skill-creator / subagent-creator / slash-command-creator / hook-creator** — 나만의 스킬·에이전트·커맨드·훅을 직접 제작
- **brand-guidelines / canvas-design / internal-comms** — 브랜드 일관성, 디자인, 사내 커뮤니케이션 문서
- **zettelkasten-linker** (에이전트) — 쌓인 노트를 정리·연결하고 볼트 건강 리포트 생성

---

## 🔌 플러그인 (설치 승인 후 사용)

`.claude/settings.json`에 사전 연결되어 있어, 최초 승인만 하면 활성화됩니다:

- **superpowers** — 기획(brainstorming)·계획·TDD·디버깅 등 작업 워크플로우
- **harness** — 도메인 설명만으로 에이전트 팀·스킬을 자동 생성
- **humanize-korean** — AI가 쓴 한글 티를 자연스럽게 다듬는 윤문
- **security-guidance** — 코드 보안 자동 리뷰 (개발 작업 시)
- **업무 번들(Cowork)** — product-management · marketing · sales · customer-support · design · data · engineering · productivity
  - Notion·Slack·Figma 등 커넥터를 연결하면 실제 데이터까지 활용할 수 있습니다.

### "언제 뭘 쓰나?" 빠른 가이드
- **에이전트/스킬을 정밀하게 하나씩 만들 때** → `skill-creator` / `subagent-creator`
- **여러 에이전트로 이뤄진 팀을 도메인 설명만으로 한 번에 만들 때** → `harness`
- **글을 기획·설계할 때** → superpowers `brainstorming` / **한글 AI 티를 없앨 때** → `humanize-korean`

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
