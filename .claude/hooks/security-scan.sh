#!/bin/bash
# UserPromptSubmit 훅: 사용자 입력에서 고신호 민감정보 패턴을 감지하면
# "비차단 경고"만 띄운다. 작업은 절대 막지 않는다. (항상 exit 0, deny 미사용)
# jq 등 외부 도구에 의존하지 않도록 stdin 전체를 grep으로 스캔한다.

INPUT=$(cat)

# 고신호 패턴만 (오탐 최소화):
#  - API 키류: sk-xxxx / api_key / access token
#  - 비밀번호/시크릿 키워드
#  - 개인키(PEM) 헤더
#  - 한국 주민등록번호 형식 (YYMMDD-Gxxxxxx)
PATTERN='(sk-[A-Za-z0-9]{16,}|api[_-]?key|secret[_-]?key|access[_-]?token|비밀번호|passwd|password|-----BEGIN [A-Z ]*PRIVATE KEY|[0-9]{6}-[1-4][0-9]{6})'

if printf '%s' "$INPUT" | grep -qiE "$PATTERN"; then
  # systemMessage = 사용자에게 보이는 경고 배너 / additionalContext = 모델 안내 (둘 다 비차단)
  printf '%s' '{"systemMessage":"⚠️ 방금 입력에 민감정보로 보이는 패턴(API 키·비밀번호·개인키·주민번호 등)이 감지됐습니다. 외부 AI에 비밀·개인정보를 그대로 넣지 마세요. 원칙: 00-system/03-guides/AI-보안-가이드.md","hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"[보안 스캐너] 사용자 입력에서 민감정보 패턴이 감지됨. 작업은 계속하되, 비밀·개인정보를 그대로 다루지 말고 익명화·마스킹 등 안전한 대안을 먼저 안내할 것."}}'
fi

exit 0
