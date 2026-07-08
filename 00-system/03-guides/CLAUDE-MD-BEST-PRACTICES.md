# CLAUDE.md Best Practices Guide

> Source: https://www.humanlayer.dev/blog/writing-a-good-claude-md

## Core Principle

LLM은 stateless - 매 세션마다 CLAUDE.md가 유일한 컨텍스트로 자동 포함됨.

## 3가지 필수 요소

| 요소 | 설명 |
|------|------|
| **WHAT** | 기술 스택, 프로젝트 구조, 코드베이스 지도 |
| **WHY** | 프로젝트와 각 부분의 목적 |
| **HOW** | 실제 작업 방법 (빌드, 테스트, 타입체크) |

## Best Practices

### 1. 지시사항 최소화
- 프론티어 LLM도 **150-200개 지시사항**만 일관성 있게 따름
- 작은 모델은 지수적으로 성능 저하
- Claude Code 시스템 프롬프트가 이미 ~50개 지시사항 포함
- **핵심만 남기고 나머지는 별도 파일로**

### 2. 파일 길이 관리
- **권장: 300줄 미만**
- HumanLayer 사례: 60줄 이하
- 길어질수록 Claude가 무시할 확률 증가

### 3. Progressive Disclosure
상세 가이드는 별도 파일로 분리하고, CLAUDE.md에서는 목록과 설명만 제공:

```
agent_docs/
  |- building_the_project.md
  |- running_tests.md
  |- code_conventions.md
  |- service_architecture.md
```

CLAUDE.md에서: "빌드 방법은 `agent_docs/building_the_project.md` 참조"

### 4. 코드 스타일 가이드 제외
> "Never send an LLM to do a linter's job"

- 스타일 검사는 ESLint, Prettier 등 자동화 도구에 맡기기
- CLAUDE.md에 코드 스타일 규칙 나열하지 않기

### 5. 자동 생성 피하기
- CLAUDE.md는 "the highest leverage point"
- 수동으로 신중히 작성
- `claude /init`으로 자동 생성된 내용은 검토 후 정리

## Claude가 CLAUDE.md를 무시하는 이유

Claude Code는 이 메시지를 삽입:
> "this context may or may not be relevant to your tasks"

결과적으로 "universally applicable" 하지 않은 내용은 무시됨.

**해결책**: 모든 작업에 적용되는 핵심 규칙만 CLAUDE.md에 포함

## 추가 권장사항

- **코드 참조**: `file:line` 포맷 사용 (예: `src/utils.ts:42`)
- **포인터 선호**: 전체 내용보다 파일 경로/위치 참조
- **Hooks & Slash Commands**: 반복 작업은 자동화로 분리

## Checklist

CLAUDE.md 작성/검토 시 확인:

- [ ] 300줄 미만인가?
- [ ] WHAT, WHY, HOW가 명확한가?
- [ ] 불필요한 지시사항이 없는가?
- [ ] 상세 가이드는 별도 파일로 분리했는가?
- [ ] 코드 스타일 규칙이 포함되어 있지 않은가?
- [ ] 모든 작업에 적용되는 핵심 규칙만 있는가?

---

*Updated: 2025-12-01*
