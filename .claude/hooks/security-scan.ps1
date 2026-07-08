# security-scan.ps1 — (opt-in) UserPromptSubmit 민감정보 스캐너 [Windows/PowerShell]
# 고신호 패턴 감지 시 "비차단 경고"만 출력. 작업은 절대 막지 않음(항상 exit 0).
# 사용법: .claude/hooks/README.md 참고 (기본 비활성)

$stdin = [Console]::In.ReadToEnd()
$pattern = 'sk-[A-Za-z0-9]{16,}|api[_-]?key|secret[_-]?key|access[_-]?token|비밀번호|passwd|password|-----BEGIN [A-Z ]*PRIVATE KEY|[0-9]{6}-[1-4][0-9]{6}'

if ($stdin -imatch $pattern) {
  $out = '{"systemMessage":"⚠️ 방금 입력에 민감정보로 보이는 패턴(API 키·비밀번호·개인키·주민번호 등)이 감지됐습니다. 외부 AI에 비밀·개인정보를 그대로 넣지 마세요. 원칙: 00-system/03-guides/AI-보안-가이드.md","hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"[보안 스캐너] 사용자 입력에서 민감정보 패턴이 감지됨. 작업은 계속하되, 비밀·개인정보를 그대로 다루지 말고 익명화·마스킹 등 안전한 대안을 먼저 안내할 것."}}'
  Write-Output $out
}

exit 0
