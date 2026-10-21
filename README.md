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

> Claude Code·Codex에서 사용하는 업무·수업용 AI 워크스페이스

---

## 🚀 수업에서 시작하기

### 1. 워크스페이스 받기·열기

[워크스페이스 ZIP 받기](https://github.com/grandeclip/grandeclip-workspace/archive/refs/heads/main.zip)를 눌러 압축을 풀고, `grandeclip-workspace-main` 폴더를 **Claude Code 또는 Codex**에서 엽니다. ZIP을 받는 데 Git은 필요하지 않습니다. 위키에 필요한 Node.js도 초기 설정에서 자동으로 준비합니다.

### 2. 초기 설정 요청하기

두 도구에서 같은 요청을 보냅니다.

```text
README.md를 읽고 수업용 초기 설정을 진행해줘.
지금 사용하는 도구에 맞춰 필요한 스킬을 준비하고,
기존 파일과 개인 설정은 보존해줘.
마치면 새 대화에서 확인할 방법을 알려줘.
```

Claude Code에서는 `/setup-workspace`로 시작해도 됩니다. 수업용 설정은 포함된 스킬과 위키 실행 환경을 준비합니다. 회사용 플러그인 전체 설치·프로필 질문·Daily Note 생성·컴퓨터 전역 적용은 하지 않습니다.

### 3. 새 대화에서 확인하기

**같은 폴더에서 새 대화**를 열고 아래처럼 물어보세요.

```text
지금 이 워크스페이스에서 career-os, karpathy-llm-wiki, skill-creator를 사용할 수 있어?
실제 스킬 목록과 지침을 확인해, 준비된 기능만 알려줘.
```

`career-os`는 관심 회사 대화부터 회사·공고 조사, 내 경험 확인, 강점 정리까지 안내합니다. `karpathy-llm-wiki`는 내 자료를 개념별로 정리하고 위키에 근거해 답합니다. 준비를 확인하면 수업의 미션 요청으로 시작하세요.

<details>
<summary>초기 설정이 멈추거나 스킬이 보이지 않으면</summary>

- 설정이 알려준 누락·충돌 경로를 같은 대화에 보여주세요. 개인이 수정한 파일은 덮지 않습니다.
- 새 대화에서도 안 보이면 같은 폴더를 다시 열거나 앱을 재시작하세요. 파일 준비와 실제 스킬 인식은 따로 확인합니다.
- 스킬이나 위키 앱 파일이 빠졌다면 최신 ZIP을 별도 폴더에 받아 다시 진행하세요. 개인 자료가 있는 폴더를 새 ZIP으로 덮지 마세요.

</details>

### AI 초기 설정 절차

이 절은 **초기 설정을 요청받은 AI**가 실행할 절차입니다.

1. 현재 도구와 OS를 확인합니다. Claude Code 요청을 Codex로, Codex 요청을 Claude로 처리하지 않습니다. 알 수 없을 때만 어느 도구인지 한 번 묻습니다.
2. 아래 명령 중 현재 환경에 해당하는 하나를 워크스페이스 루트에서 실행하고 종료 코드를 확인합니다. 수업용 기본 설치에는 Git·외부 플러그인·추가 구독이 필요하지 않습니다.

   | 환경 | 수업용 준비 | 읽기 전용 재확인 |
   |---|---|---|
   | Claude Code · macOS/Linux | `bash install.sh --workshop --tool claude` | `bash install.sh --workshop --tool claude --check` |
   | Codex · macOS/Linux | `bash install.sh --workshop --tool codex` | `bash install.sh --workshop --tool codex --check` |
   | Claude Code · Windows | `powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -Workshop -Tool Claude` | 같은 명령에 `-Check` 추가 |
   | Codex · Windows | `powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -Workshop -Tool Codex` | 같은 명령에 `-Check` 추가 |

Windows 명령의 실행 정책 옵션은 해당 PowerShell 프로세스에만 적용되며 컴퓨터의 정책을 영구 변경하지 않습니다. 조직 정책으로 실행이 막히면 그 제한을 우회하지 않고 담당자에게 확인합니다.

3. Claude Code는 `.claude/skills/`의 `career-os`, `karpathy-llm-wiki`, `skill-creator`를 사용합니다. Codex는 `career-os`와 `karpathy-llm-wiki`의 전체 묶음을 이 작업 폴더의 `.agents/skills/`에 준비하고, `skill-creator`는 기본 내장 스킬을 사용합니다. Claude 플러그인·커맨드·에이전트가 Codex에 그대로 등록된다고 설명하지 않습니다.
4. Codex가 `.agents` 폴더 쓰기 승인을 요구하면 필요한 설치 명령에 한정해 도구의 승인 절차를 따릅니다. 권한 오류를 성공으로 처리하거나 전역 보안 설정을 바꾸지 않습니다. 승인받아 재시도할 수 없으면 사용자가 직접 실행할 수 있도록 해당 수업용 명령을 알려줍니다.
5. 성공한 뒤 같은 명령의 읽기 전용 확인을 한 번 실행합니다. 누락·충돌·읽기 실패가 남으면 해당 경로와 필요한 조치만 알리고 준비 완료로 표시하지 않습니다. 설치를 무한 반복하거나 개인 설정·원본 스킬을 덮지 않습니다.
6. 파일이 준비됐으면 “파일 준비를 마쳤어요. 같은 폴더에서 새 대화를 열고 스킬을 확인해 주세요.”라고 짧게 안내합니다. 새 대화의 확인 요청에는 실제 사용 가능한 스킬 목록의 경로와 지침을 읽고 답합니다. Codex 내장 `skill-creator`가 목록에 없다면 미확인으로 남기며 Claude용 사본으로 덮지 않습니다.

7. 위키 앱의 필수 파일과 실행 환경을 확인합니다. 설정 스크립트는 `ensure-wiki-runtime.sh` 또는 `ensure-wiki-runtime.ps1`로 Node.js를 자동 준비합니다. PATH에 Node.js 22 이상이 있으면 재사용하고, 없거나 버전이 낮으면 공식 Node.js 24.22.1 LTS를 받아 해시를 검사한 뒤 `.workshop-runtime/`에 둡니다. 처음 받아야 할 때는 인터넷이 필요합니다. 기존 Node.js·전역 PATH·시스템 설정은 바꾸지 않으며 관리자 권한을 요구하지 않습니다. 준비가 실패하면 해당 원인을 알리고 완료로 표시하지 않습니다. `--check` 또는 `-Check`는 다운로드나 파일 변경 없이 확인만 합니다. AI 도구 로그인은 위키를 열었을 때 실제 상태로 확인합니다.

이 과정에서 취업 준비 스킬을 실행하거나 회사·개인 자료를 조사하지 않습니다. 기존 `CLAUDE.md`, `AGENTS.md`, 개인 파일과 전역 설정은 보존합니다.

공식 기준: [Codex 스킬](https://learn.chatgpt.com/docs/build-skills), [Claude Code 스킬](https://code.claude.com/docs/en/skills).

---

## 내 위키 열기

초기 설정을 마친 뒤 AI에게 **“위키 열어줘”**라고 요청하세요. 개념 지도에서 문서를 탐색하고, 읽는 문서를 바탕으로 바로 질문할 수 있습니다. AI는 워크스페이스 루트에서 OS에 맞는 명령을 실행한 뒤 출력된 로컬 주소를 엽니다.

| 환경 | 위키 실행 |
|---|---|
| macOS/Linux | `bash 00-system/02-scripts/run-wiki.sh` |
| Windows | `powershell -NoProfile -ExecutionPolicy Bypass -File 00-system/02-scripts/run-wiki.ps1` |

이 명령도 Node.js가 준비돼 있는지 확인하고, 필요하면 워크스페이스 안에 자동으로 받습니다. 추가 Node 패키지를 설치할 필요는 없습니다. 기본 포트가 사용 중이면 `--port 3114`를 붙입니다.

**이미 Codex 또는 Claude Code에 로그인했다면 위키도 그 로그인을 그대로 사용합니다.** API 키나 위키용 회원가입, 매번 하는 로그인은 필요 없습니다. 화면에서 선택한 CLI가 없거나 로그인이 없거나 만료된 경우에만 설치·본인 로그인을 안내합니다. Claude 웹·데스크톱 앱의 로그인과 Claude Code 로그인은 별개입니다. 이 워크스페이스의 Node.js는 위키 서버를 실행하기 위한 것이며, Claude Code의 네이티브 설치에 필요한 것은 아닙니다. [Codex 인증 안내](https://learn.chatgpt.com/docs/auth), [Claude Code 인증 안내](https://code.claude.com/docs/en/authentication).

**자료 추가**에서 직접 선택한 파일만 가져옵니다. Markdown·TXT·HTML·CSV·JSON은 바로 읽으며, PDF는 `pdftotext`, DOCX는 Python 3이 있을 때 읽습니다. 지원하지 않는 형식이나 읽지 못한 파일은 화면에 이유를 보여줍니다.

원본 파일은 바꾸지 않습니다. 가져온 사본, 개념 노트와 대화는 `30-knowledge/36-personal-wiki/`에 저장됩니다. 이 개인 데이터 폴더는 Git에서 제외하며 공개 저장소에 푸시하지 않습니다. 이미 다른 폴더에 위키가 있다면 그 자료를 이동하지 않고 `.wiki-local.json`의 `root` 경로로 연결할 수 있습니다. 이 로컬 설정 파일도 Git에서 제외합니다. AI 답변을 만들 때는 선택한 도구의 온라인 모델을 사용합니다.

---

## 🧰 어떤 스킬이 들어있나요

수업에서는 **취업 준비 `career-os`**, **개인 위키 `karpathy-llm-wiki`**, **스킬 제작 `skill-creator`**를 사용합니다. Claude Code는 포함된 스킬을, Codex는 작업 폴더에 준비한 두 스킬과 기본 내장 skill-creator를 사용합니다.

폴더에는 확장 제작·브랜드·디자인·사내 커뮤니케이션용 스킬도 함께 있습니다. 자세한 목록은 `00-system/README.md`를 참고하세요.

<details>
<summary>회사 업무용 전체 설정</summary>

회사 업무용 플러그인과 프로필·Daily Note·커맨드가 필요할 때 **Claude Code**에서 `/setup-workspace --work`를 실행합니다. 기존 전체 설치는 별도로 유지됩니다.

- macOS/Linux: `bash install.sh --yes`, 확인만 하려면 `bash install.sh --check`
- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -Yes`, 확인만 하려면 같은 명령에 `-Check`

전체 설치는 `00-system/02-scripts/plugins.txt`의 공통·직무별 플러그인을 받으며 Git·네트워크·Claude Code가 필요합니다. `superpowers` 등 외부 플러그인은 이 경로에서 준비합니다. Codex에서 Superpowers가 필요하면 [유지관리자의 공식 설치 안내](https://github.com/obra/superpowers#installation)에 따라 Codex의 플러그인 메뉴에서 설치하세요.

전역 적용은 원할 때 별도로 진행하며, 수업용 초기 설정은 이를 실행하지 않습니다. 전체 설정은 기존 회사용 커맨드 `/daily-note`, `/todo`, `/todos`, `/idea`, `/thinking-partner`를 안내합니다.

</details>

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
