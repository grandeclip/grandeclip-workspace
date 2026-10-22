---
name: setup-workspace
description: 다운로드한 grandeclip-workspace에서 Codex 수업용 초기 설정을 요청할 때 사용한다. 포함된 스킬과 위키 실행 환경을 준비하고 확인한다.
---

# 워크스페이스 초기 설정

이 스킬은 Codex의 수업용 설정 진입점이다. 이 파일이 있는 폴더에서 세 단계 위가 수업 워크스페이스 루트다. [README.md](../../../README.md)의 **AI 초기 설정 절차**를 먼저 읽고 해당 루트에서 진행한다. README나 설치 파일이 없으면 폴더 위치·다운로드 누락을 알려주고 멈춘다.

1. 현재 OS에 맞는 명령 하나를 실행한다.
   - macOS/Linux: `bash install.sh --workshop --tool codex`
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -Workshop -Tool Codex`
2. 성공하면 같은 명령에 macOS/Linux는 `--check`, Windows는 `-Check`를 붙여 읽기 전용 확인을 한 번 실행한다. 실패하면 실제 원인과 필요한 조치를 알려주며 완료로 표시하지 않는다. 파일 충돌을 자동으로 덮거나 설치를 반복하지 않는다.
3. 파일 준비와 실행 환경 확인 결과를 짧게 알린다. 같은 수업 폴더의 새 대화에서 `career-os`, `karpathy-llm-wiki`, Codex 내장 `skill-creator`의 실제 목록·지침을 확인하도록 안내한다. 파일 복사만으로 새 대화의 인식·실행 성공을 주장하지 않는다.

수업용 설정은 프로젝트 스킬과 위키용 Node.js를 준비한다. 필요한 승인 절차는 해당 명령에 한정한다. 기존 개인 파일·공용 스킬·전역 설정은 보존한다. 회사용 플러그인 전체 설치·개인 프로필 질문·Daily Note 생성은 하지 않는다. 이 요청만으로 위키 서버·취업 준비 스킬·회사 조사·개인 자료 수집을 실행하거나 추가 로그인을 요구하지 않는다.
