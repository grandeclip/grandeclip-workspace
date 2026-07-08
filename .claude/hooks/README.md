# .claude/hooks — (선택) 결정적 보안 스캐너

## 기본값: 비활성 (그리고 그게 정상입니다)

이 워크스페이스의 **보안 인지는 훅이 아니라 `CLAUDE.md`의 지시문**으로 처리됩니다.
Claude가 매 대화에서 사용자 입력의 비밀정보·개인정보 패턴을 스스로 감지해 경고합니다 — **OS 무관, 추가 프로그램 불필요, 매 프롬프트 비용 없음.**

### 왜 훅을 기본으로 켜지 않았나?
훅 스크립트는 인터프리터가 필요합니다:
- `security-scan.sh` → bash + grep (macOS/Linux, 또는 Windows+Git Bash)
- `security-scan.ps1` → PowerShell (Windows)

그런데 **settings.json 훅은 OS별 분기가 안 되고**, 인터프리터가 없는 OS에선 **매 프롬프트마다 훅이 에러**를 냅니다. 비개발자·혼합 OS 환경에선 이게 오히려 방해가 됩니다.

---

## 규제형(deterministic) 스캐너를 꼭 켜고 싶다면 (opt-in)

정규식 기반의 확정적 경고가 필요한 팀(예: 전원 macOS/Linux)이라면, 아래를 `.claude/settings.json`에 추가하세요.

### macOS / Linux / Windows(Git Bash)
```json
"hooks": {
  "UserPromptSubmit": [
    { "hooks": [ { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/security-scan.sh" } ] }
  ]
}
```

### Windows (PowerShell)
```json
"hooks": {
  "UserPromptSubmit": [
    { "hooks": [ { "type": "command", "shell": "powershell", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/security-scan.ps1" } ] }
  ]
}
```

> ⚠️ 두 스크립트 모두 **비차단**입니다(항상 exit 0 — 작업을 막지 않고 경고만). 감지 패턴은 API 키·비밀번호·개인키(PEM)·주민등록번호 형식 등 고신호 패턴만 사용합니다.
> ⚠️ 위 두 블록을 동시에 넣지 마세요. 각 조직의 주 OS에 맞는 하나만 사용하세요(그 외 OS에선 매 프롬프트 에러 발생).
