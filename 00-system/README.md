# 00-system

grandeclip 워크스페이스의 시스템 폴더입니다. 템플릿, 가이드, 참고 문서가 들어 있습니다.

---

## Structure

```
00-system/
├── README.md                        (this file)
├── claude-code-practice-guide.md    Claude Code 실습 가이드 (폴더 정리 등)
├── 01-templates/                    노트 템플릿 (3개)
├── 02-scripts/                      설치·전역적용 스크립트
├── 03-guides/                       사용법·모범사례 가이드 (4개)
└── 04-docs/                         시스템 문서
```

---

## 01-templates/ (3 templates)

| File | Purpose |
|------|---------|
| `daily-note-template.md` | 데일리 노트 구조 |
| `weekly-review-template.md` | 주간 회고 포맷 |
| `Project Template.md` | 프로젝트 노트 구조 |

---

## 02-scripts/

| File | Purpose |
|------|---------|
| `plugins.txt` | 설치할 플러그인·마켓플레이스 목록 (**단일 원천**) |
| `globalize.sh` / `globalize.ps1` | 워크스페이스의 커맨드·스킬·보안지침을 `~/.claude` 에 전역 적용 |
| `test-globalize.sh` | globalize 동작 테스트 |
| `setup-workshop.sh` / `setup-workshop.ps1` | Claude Code·Codex 수업용 파일 준비·읽기 전용 검사 |
| `test-workshop-setup.sh` | 개인 설정을 보존하는 수업용 준비 회귀 검사 |

설치 진입점인 `install.sh` / `install.ps1` 은 **워크스페이스 루트**에 있습니다.
사용자가 폴더를 열자마자 보이도록 일부러 루트에 두었습니다.

---

## 수업용 준비 검증

`test-workshop-setup.sh`의 12개 회귀 그룹과 Bash 구문 검사를 통과했다. Codex는 GitHub ZIP 형태의 임시 폴더에서 파일 준비 후 별도 새 대화의 실제 스킬 목록·지침 읽기를 확인했다. 이는 취업 조사 실행 검증과 구분한다. Claude는 번들 읽기 검사를 확인했으며 Windows PowerShell 실행과 Claude 계정의 실제 대화는 이번에 수행하지 않았다.

## 스킬 구성

수업용 설정은 포함된 career-os와 스킬 제작 기능만 준비합니다. Claude Code는 번들 스킬을 확인하고 Codex는 `.agents/skills/career-os/` 사본과 기본 내장 skill-creator를 사용합니다. 회사 업무용 전체 설정에서 세팅되는 스킬은 **두 경로**로 나뉩니다. 헷갈리기 쉬우니 여기 정리해 둡니다.

### ① 플러그인 12종 — `install.sh` 가 받아옴

`plugins.txt` 에 목록이 있고, 사용자 전역(`--scope user`)으로 설치되어
**어느 폴더에서 Claude 를 열어도** 동작합니다.

| 구분 | 플러그인 |
|------|---------|
| 공통 | `superpowers`, `security-guidance`, `harness`, `humanize-korean` |
| 직무별 | `product-management`, `marketing`, `sales`, `customer-support`, `design`, `data`, `engineering`, `productivity` |

### ② 포함 스킬 8종: `.claude/skills/`에 폴더째 포함

| 스킬 | 용도 |
|------|------|
| `skill-creator`, `subagent-creator`, `slash-command-creator`, `hook-creator` | Claude Code 확장 제작 |
| `brand-guidelines`, `canvas-design`, `internal-comms` | 브랜드·디자인·사내 커뮤니케이션 |
| `career-os` | 관심 회사 대화 → 회사·공고 조사 → 내 경험 확인 → 강점 정리 |

**왜 저장소에 넣어 두는가** — 이 워크스페이스는 공개 GitHub ZIP으로 배포하며 `git clone` 을
전제하지 않습니다. 네트워크가 없거나 플러그인 설치가 실패해도 이 8종은 폴더에
들어 있으므로 바로 쓸 수 있습니다. **의도된 안전망이며, 마켓플레이스에 같은
이름이 보인다고 지우면 안 됩니다.**

실제로 확인한 결과(2026-09-04) `brand-guidelines`·`canvas-design`·`internal-comms`
세 종은 마켓플레이스에서 받을 수 없고, `skill-creator` 는 동명 플러그인이 있으나
출처가 다른 제3자 저장소였습니다. 기존 외부 스킬 7종은 Apache-2.0입니다. 이 라이선스 설명에 워크스페이스에서 추가한 `career-os`는 포함하지 않습니다.

`career-os`는 총괄 스킬 안에 하위 스킬 4개·담당 지침 3개·공통 실행 계약을 함께 넣었습니다. `/setup-workspace`가 필수 파일 9개를 확인하며, 별도 다운로드 없이 `/career-os`로 시작합니다. 전역 적용에 동의한 경우 이 묶음도 함께 연결됩니다. 명령이 보이지 않으면 새 대화를 열거나 Claude Code를 재시작하세요.

---

## 03-guides/ (4 guides)

| File | Purpose |
|------|---------|
| `CLAUDE-MD-BEST-PRACTICES.md` | CLAUDE.md 작성 모범 사례 |
| `PROMPT-ENGINEERING-GUIDE.md` | 프롬프트 작성 가이드 |
| `TODO-SYSTEM-GUIDE.md` | 할 일·TODO 관리 가이드 |
| `AI-보안-가이드.md` | 전사 AI 활용 보안 가이드 (필독) |

---

## 04-docs/

| File | Purpose |
|------|---------|
| `johnny-decimal-guide.md` | Johnny Decimal 폴더 체계 설명 |

---

**Last Updated**: 2026-10-21
