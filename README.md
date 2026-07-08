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
