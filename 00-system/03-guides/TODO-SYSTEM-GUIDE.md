# 🎯 Todo Management System - Quick Start Guide

> Claude Code 기반 통합 Todo 관리 시스템이 완성되었습니다!

---

## ⚡ 빠른 시작 (2분 안에)

### 1. Todo 추가하기
```bash
/todo 클라이언트 보고서 마감 확인
/todo [urgent] 외부 업체 견적 확인
/todo [my-project] 19기 결과 확인
```

### 2. Todo 확인하기
```bash
/todos              # 전체 보기
/todos today        # 오늘 할 일만
/todos project      # 프로젝트별
/todos overdue      # 오래된 것들
```

### 3. 매일 아침 루틴
```bash
/daily-review       # Todo 상태 + 프로젝트 분석
```

---

## 🎨 시스템 구조

```
Claude Code Workspace
├── /todo          → 빠른 Todo 추가 (2초)
├── /todos         → Todo 조회 (다양한 뷰)
└── /daily-review  → 매일 아침 Todo 체크 + 제안

저장 위치:
pkm/40-personal/43-todos/
├── active-todos.md        # 중앙 저장소 ⭐
├── completed-todos.md     # 완료 아카이브
└── README.md              # 상세 가이드
```

---

## 💡 핵심 기능

### ✅ 해결된 문제
1. **"어디에 뒀는지 기억 못함"**
   → 단일 저장소 (`active-todos.md`)

2. **"장기 프로젝트 생각없이 넘어감"**
   → `/todos overdue`로 자동 감지

3. **"주기적인 알림 없음"**
   → `/daily-review`에서 매일 체크

### 🚀 자동 저장되는 정보
- **추가 시각**: 언제 추가했는지
- **컨텍스트**: 어디서 작업하다 추가했는지
- **우선순위**: urgent/high/normal/low
- **프로젝트**: 어떤 프로젝트와 연결됐는지

---

## 📊 실전 시나리오

### 시나리오 1: 작업 중 Todo 생각남
```
마케팅 프로젝트 작업 중
→ "아 보고서 마감 확인해야지"
→ /todo 클라이언트 보고서 마감 확인
→ ✅ 2초 만에 저장 완료
→ 계속 작업
```

### 시나리오 2: 매일 아침 체크
```
9:00 AM - VS Code 열고
→ /daily-review 실행
→ 📋 Todo 상태:
   - 미처리: 7개
   - 오늘 할 일: 3개
   - 지연: 2개 ⚠️
→ 오늘 할 것 선택
→ 실행
```

### 시나리오 3: 프로젝트별 정리
```
/todos project
→ operations 관련 4개 발견
→ 현장 방문할 때 한 번에 처리 계획
```

---

## 🎯 사용 예시

### Todo 추가 (다양한 방식)

```bash
# 기본
/todo 사무실 장비 점검

# 우선순위 지정
/todo [urgent] 회계 자료 제출
/todo [high] 온라인 커리큘럼 작성
/todo [low] 인테리어 아이디어 수집

# 프로젝트 지정
/todo [ops] 회의실 프로젝터 수리
/todo [my-project] 스터디 템플릿 업데이트
/todo [online-course] 3주차 강의 자료

# 복합
/todo [urgent] [ops] 서버실 에어컨 수리
```

### Todo 조회 (다양한 뷰)

```bash
# 전체 보기 (섹션별)
/todos
→ 📥 Inbox (7개)
→ 🎯 Today (3개)
→ ⚠️ Overdue (2개)

# 오늘 할 일만
/todos today
→ 우선순위별로 정렬된 오늘 할 일

# 프로젝트별 그룹화
/todos project
→ operations (4개)
→ my-project (3개)
→ online-course (2개)

# 오래된 것들
/todos overdue
→ 14일 지남: 장비 업그레이드
→ 10일 지남: 회계 자료 정리

# 통계
/todos stats
→ 총 15개
→ High: 3개, Normal: 10개, Low: 2개
→ 완료율: 68%
```

---

## 📈 Daily Review 통합

`/daily-review` 실행 시 자동으로 포함되는 내용:

```markdown
### 📊 어제 진행 상황
- my-project: 제안서 작성 완료
- pkm: Vault 최적화 완료

### 📋 Todo 상태 체크
- **미처리 Todo**: 7개
- **오늘 할 일**: 3개
- **지연 중**: 2개 (⚠️ 1주일 이상)

**오늘 처리 제안:**
1. 클라이언트 보고서 마감 확인 (high priority)
2. 프로젝트 중간 점검 (high priority)
3. 장비 업그레이드 견적 (14일 지남)

### 🎯 오늘 우선순위 제안
1. Todo 처리 (3개 제안됨) ← NEW!
2. 프로젝트 연속성 유지
3. 장기 프로젝트 체크

### 💡 인사이트
- operations 관련 Todo 4개 → 현장 방문 시 한 번에 처리
- 2주 동안 업데이트 없는 프로젝트: online-course-bath-lecture
```

---

## 🔧 커스터마이징

### active-todos.md 직접 편집

파일 위치: `pkm/40-personal/43-todos/active-todos.md`

```markdown
## 📥 Inbox (처리 안 한 것들)
- [ ] 클라이언트 보고서 마감 확인
  - added: 2025-10-11 15:23
  - context: my-project-ai-branding-study/README.md
  - priority: high
  - project: operations

## 🎯 Today (오늘 할 일)
← 매일 아침 여기로 이동

## ⚠️ Overdue (오래된 것들)
← 자동 감지 (1주일 이상)
```

### 체크박스 사용

```markdown
- [x] 완료된 Todo  ← 완료 시 x 입력
  → 자동으로 completed-todos.md로 아카이빙 (향후 기능)
```

---

## 💪 활용 팁

### 1. 컨텍스트 추적
```
"이 Todo를 왜 추가했지?"
→ context 필드 확인
→ my-project-ai-branding-study/README.md
→ 아 맞다, 그때 작업하다가 생각났지!
```

### 2. 프로젝트 묶음 처리
```
/todos project
→ operations 관련 4개 발견
→ 현장 방문할 때 한 번에 처리하면 효율적
```

### 3. 우선순위 관리
```
/todos today
→ High priority 2개 먼저
→ Normal priority 그 다음
→ Low priority는 시간 나면
```

### 4. Overdue 주기적 체크
```
주 1회 금요일:
/todos overdue
→ 방치된 Todo 확인
→ 삭제 또는 재우선순위화
```

---

## 🎓 학습 곡선

### Day 1: 기본 사용
```bash
/todo [내용]        # 추가만 해도 충분
/todos              # 확인
```

### Week 1: 우선순위 추가
```bash
/todo [urgent] [내용]
/todo [my-project] [내용]
```

### Week 2: Daily Review 습관화
```bash
매일 아침: /daily-review
→ Todo 체크 + 오늘 할 일 선택
```

### Month 1: 프로젝트별 관리
```bash
/todos project
→ 프로젝트별로 정리하며 작업
```

---

## 📚 상세 문서

더 자세한 내용은:
- [pkm/40-personal/43-todos/README.md](pkm/40-personal/43-todos/README.md)

커맨드 도움말:
- `~/.claude/commands/todo.md`
- `~/.claude/commands/todos.md`
- `~/.claude/commands/daily-review.md`

---

## 🚀 다음 단계 (선택사항)

### 1. n8n 알림 시스템 (고급)
```
n8n Workflow:
- 매일 오전 9시 Telegram 알림
- 오래된 Todo 주간 리포트
- 프로젝트 방치 경고
```

### 2. 반복 작업 시스템
```markdown
- [ ] 월간 정산 처리
  - recurring: monthly
  - next: 2025-11-10
```

### 3. Projects 폴더 통합
```
각 프로젝트 README에 Todo 섹션
→ /todos project 실행 시 자동 집계
```

---

## ✅ 성공 체크리스트

**시스템이 잘 작동하는 신호:**
- [ ] Todo를 추가할 때 2초 이내에 완료
- [ ] 매일 아침 `/daily-review` 실행
- [ ] "어디에 뒀더라?" 생각 안 남
- [ ] 장기 프로젝트를 놓치지 않음
- [ ] Overdue가 5개 이하 유지

**개선이 필요한 신호:**
- [ ] Todo가 여러 곳에 분산됨
- [ ] 1주일 이상 `/todos` 안 봄
- [ ] Overdue가 10개 이상
- [ ] Todo 추가가 귀찮음

---

## 🎉 완성!

**이제 할 수 있는 것:**
1. ✅ 작업 중 Todo 빠르게 추가 (2초)
2. ✅ 다양한 방식으로 조회
3. ✅ 매일 아침 자동 체크 + 제안
4. ✅ 장기 프로젝트 놓치지 않기
5. ✅ 컨텍스트 추적

**시작해보세요!**
```bash
/todo 이 Todo 시스템 테스트해보기
/todos
```

---

*"어디에 뒀는지 기억 못하는" 문제를 해결하는 단일 Todo 시스템*

*Created: 2025-10-11*
*Version: 1.0*
