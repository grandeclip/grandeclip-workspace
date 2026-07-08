# Prompt Engineering Best Practices Guide

> 2024-2025 프롬프트 엔지니어링 베스트 프랙티스 정리
> 출처: PromptHub, Prompt Engineering 2025, OpenAI Guidelines

---

## 핵심 원칙

### 1. Few-Shot Examples > 규칙 나열

규칙을 설명하는 것보다 좋은/나쁜 예시를 보여주는 것이 효과적

```
# Bad - 규칙 나열
"목표와 관련된 제안만 하세요"
"추상적인 표현을 피하세요"

# Good - 예시 기반
[GOOD EXAMPLES]
목표가 "체중 10kg 감량"일 때:
✓ "식단 관리" - 칼로리 조절과 영양 균형
✓ "운동 습관" - 규칙적인 신체 활동

[BAD EXAMPLES]
✗ "독서 습관" - 목표와 무관
✗ "열심히 하기" - 추상적, 측정 불가
```

### 2. Role-Task-Tone 구조

역할 → 작업 → 톤 순서로 구조화

```
[ROLE]
당신은 목표 달성 전략 설계자입니다.

[CONTEXT]
사용자 목표: "${goal}"
사용자 성향: "${vibeSummary}"

[TASK]
${count}개의 새로운 전략 영역을 제안하세요.

[OUTPUT FORMAT]
JSON 형식으로 응답:
{ "pillars": [...] }
```

### 3. Affirmative Directives (+75% 성능)

"하지 마세요" 대신 "하세요" 사용

```
# Bad - 부정형
"추상적인 표현을 사용하지 마세요"
"목표와 무관한 제안을 하지 마세요"

# Good - 긍정형
"구체적이고 측정 가능한 표현을 사용하세요"
"목표 달성에 직접 기여하는 제안을 하세요"
```

### 4. Delimiters로 섹션 구분

명확한 구분자로 프롬프트 구조화

```
[ROLE]
...

[CONTEXT]
...

[TASK]
...

[GOOD EXAMPLES]
...

[BAD EXAMPLES]
...

[OUTPUT FORMAT]
...
```

### 5. Chain-of-Thought

복잡한 작업에 단계별 사고 유도

```
"먼저 사용자의 목표를 분석하고,
그 다음 관련된 전략 영역을 도출하고,
마지막으로 실행 가능한 액션으로 분해하세요."
```

---

## 템플릿

### 기본 구조

```typescript
export const PROMPT_TEMPLATE = (params) => `
[ROLE]
당신은 {역할}입니다. {역할 설명}

[CONTEXT]
사용자 목표: "${params.goal}"
추가 컨텍스트: ${params.context}

[TASK]
{구체적인 작업 지시}

[GOOD EXAMPLES]
{좋은 예시 상황}일 때:
✓ "{좋은 예시 1}" - {왜 좋은지}
✓ "{좋은 예시 2}" - {왜 좋은지}

[BAD EXAMPLES]
{같은 상황}일 때 나쁜 제안:
✗ "{나쁜 예시 1}" - {왜 나쁜지}
✗ "{나쁜 예시 2}" - {왜 나쁜지}

[OUTPUT FORMAT]
JSON 형식으로 응답:
{
  "field": "value"
}
`;
```

### 재생성 프롬프트 패턴

이미 제안된 것을 피하면서 새로운 제안을 할 때:

```typescript
export const REGENERATION_PROMPT = (params) => `
[ROLE]
당신은 {역할}입니다.

[CONTEXT]
목표: "${params.goal}"
이미 선택된 항목: ${params.selected.join(', ') || '없음'}
거절된 항목: ${params.rejected.join(', ') || '없음'}

[TASK]
위 항목들과 중복되지 않는 ${params.count}개의 새로운 항목을 제안하세요.

[GOOD EXAMPLES]
...

[BAD EXAMPLES]
...

[OUTPUT FORMAT]
...
`;
```

---

## 적용 사례: AI Mandalart

### PILLAR_REGENERATION

```typescript
[ROLE]
당신은 목표 달성 전략 설계자입니다.

[CONTEXT]
사용자 목표: "체중 10kg 감량"
이미 선택된 영역: 식단 관리, 운동 습관
거절된 영역: 수면 개선

[TASK]
3개의 새로운 전략 영역을 제안하세요.

[GOOD EXAMPLES]
목표가 "체중 10kg 감량"일 때:
✓ "스트레스 관리" - 감정적 폭식 방지
✓ "환경 조성" - 건강한 선택을 쉽게 만드는 환경

[BAD EXAMPLES]
✗ "독서 습관" - 체중 감량과 무관
✗ "재테크" - 목표와 무관

[OUTPUT FORMAT]
{ "pillars": [...] }
```

### ACTION_REGENERATION

```typescript
[ROLE]
당신은 실천 계획 코치입니다.

[CONTEXT]
목표: "체중 10kg 감량"
현재 영역: "운동 습관"
이미 선택된 액션: 아침 스트레칭 10분, 주 3회 걷기

[TASK]
"운동 습관" 영역 내에서 3개의 새로운 액션을 제안하세요.

[GOOD EXAMPLES]
영역이 "운동 습관"일 때:
✓ "5km 러닝 도전" - 마일스톤
✓ "운동복 현관에 배치" - 환경 조성

[BAD EXAMPLES]
✗ "열심히 운동하기" - 추상적
✗ "책 읽기" - 영역과 무관

[OUTPUT FORMAT]
{ "actions": [...] }
```

---

## 참고 자료

- [PromptHub - Prompt Engineering Principles 2024](https://www.prompthub.us/blog/prompt-engineering-principles-for-2024)
- [Prompt Engineering 2025](https://www.news.aakashg.com/p/prompt-engineering)
- [OpenAI Best Practices](https://platform.openai.com/docs/guides/prompt-engineering)

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-12-28 | 초기 문서 작성 (AI Mandalart 프로젝트 적용) |
