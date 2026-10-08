# 블록 계층 두 번째 감사 — 실제 편집 이벤트·격리 파일

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

이 회차는 순수 presentation API의 다음 단계로 실제 typed editor 이벤트 callback을
독립 호출한다. 작은 DOM 모델과 controlled fetch 응답을 사용하며 native UI 또는
Lean 커널 실행이라고 주장하지 않는다. root가 따로 기록한 실제 화면/파일 근거를
공통 37개 [REQUIREMENTS.md](REQUIREMENTS.md)에 연결한다. 제품 코드는 수정하지 않았다.

## 정상 삭제가 손상된 표현을 만드는 결함

[audit_visibility_events.mjs](audit_visibility_events.mjs)를 실제 제품 모듈에 대해 실행했다.
본문과 최종 목표에 쓰이지 않는 Nat `spare`를 추가한 v3 대조에서 다음 두 동작을 직접
실행했다.

| ID | 실제 동작 | 실제 실패 | 요구되는 수리 |
| --- | --- | --- | --- |
| E01 | spare 선택 → 수동 숨김 → 위치 찾기 → 노드 삭제 | 저장 presentation.hidden에 `n:spare`가 남음. 정상 재열기를 `없는 숨김 항목` 손상으로 진단 | 의미 삭제와 함께 해당 saved hidden/occurrence ID 정리, Undo 복원 |
| E02 | spare 선택 → 그룹으로 묶기 → 내부 위치 찾기 → 노드 삭제 | container.children에 `n:spare`가 남음. 정상 재열기를 `존재하지 않거나 중복된 소속` 손상으로 진단 | 해당 container child ID를 원자적으로 정리, Undo 복원 |

명령 exit 1, [visibility-events-initial-results.json](visibility-events-initial-results.json)에
실제 오류와 typed editor/presentation/visibility tools hash를 기록했다. 구현자/root에
수정을 요청했다. 구현자가 의미 삭제 때 공통 saved presentation pruning을 추가한 뒤
같은 다섯 입력을 다시 실행하여 exit 0을 확인했다. [visibility-events-retest-results.json](visibility-events-retest-results.json).
E01/E02 모두 hidden/container child ID가 사라지고 정상 재열기에 warning이 없다.

이후 실제 DocumentHistory callback을 연결하여 두 삭제의 Undo/Redo를 별도 대조했다.
Undo는 삭제 전 node와 hidden/membership를 함께 정확히 복원하며 Redo는 삭제 후
정리된 상태와 일치한다. actual typed open의 onWarning callback과 exact original 복구도
확인했다. 확장 여덟 입력 모두 exit 0, [visibility-events-expanded-retest-results.json](visibility-events-expanded-retest-results.json).

같은 실행의 세 독립 대조는 통과했다. 마지막 격리 대상 삭제는 프레임을 안전하게 끝내고
다른 카드를 다시 보였다. 격리 중 새 Nat 생성은 즉시 현재 대상에 추가되어 나타났다.
Hide는 표현 commit 1회를, 격리 진입/종료는 문서 commit 0회를 만들었고 기존 controlled
valid 결과를 유지하며 추가 check 요청을 보내지 않았다. 이 결과는 V06/S03의 일부 이벤트
연결 근거다. 실제 kernel valid 상태와 화면 키보드/Undo 수락은 root의 별도 근거가 필요하다.

## 격리 중 실제 내보낸 파일의 독립 검사

root는 실제 격리 화면에서 상단 그래프 저장을 클릭했다. IAB download 이벤트는 timeout
이었지만 Downloads에 실제 파일이 생겼으며 [ui-isolation-export.glean.json](ui-isolation-export.glean.json)에
복사했다. 따라서 이벤트 timeout을 제품 파일 생성 실패로 취급하지 않는다.

감사자는 그 실제 파일을 제품 `parseDocument`로 열고 원래 mixed-3-level fixture와
`semanticKey`를 직접 비교했다. 5개 root node/4개 edge와 증명 의미가 정확히 동일하며
active sessionView/isolationStack은 없다. 파일은 5730bytes, SHA-256
`ffd89d8f5727f874ba08c03f137452ca7df67d6093d185fac6e18dc1df37e3ee`다.
[isolation-export-independent-results.json](isolation-export-independent-results.json),
root [ui-isolation-export-observation.json](ui-isolation-export-observation.json).

V09의 일반 파일 export 부분이 실제 경로로 확인됐다. 별도 세션 자동 복구에 유효한
대상·범위를 확인하고 `이전 격리 복원`을 명시적으로 제공하는 계획 gate와 실제 Ctrl+Z
행동은 아직 남아 있다. 현재 ordinary export가 격리를 뺀 사실만으로 V09 전체를 PASS
주지 않는다.

## 사용자에게 보이는 손상 진단

S02에서 typed editor가 repaired presentation warning을 onStatus로 내보내도록 바뀌었다.
그러나 실제 app `loadDocument`는 바로 다음에 일반 `타입 그래프 검사 대기` 상태로
덮어쓴다. 진단·원본 복구가 model에만 남고 사용자에게 보이지 않을 수 있으므로 구현자에게
지속되는 toast/diagnostic summary를 요청했다. 구현자가 일차로 warning toast를 연결했지만
file-input 성공 toast가 다시 덮는 경로도 알려 persistent warning banner로 수정했다.

[audit_import_warning.mjs](audit_import_warning.mjs)는 실제 app의 typed callback 등록,
file-input change, loadDocument, warning renderer를 추출해 동일 import 경로를 호출한다.
editor 측 응답만 controlled normalization으로 주며 actual typed open callback은 앞의
독립 이벤트 실험에서 확인했다. 수정 뒤 일반 검사 대기 상태와 성공 toast가 있어도
warning panel.hidden=false와 exact original recovery를 유지했다. exit 0,
[import-warning-route-retest-results.json](import-warning-route-retest-results.json).
첫 status overwrite 실패는 [import-warning-initial-results.json](import-warning-initial-results.json)에
보존했다. 중간 `renderPresentationWarning` 미정의 오류는 새 helper를 하네스에 추가하기
전 감사 harness 오류이며 제품 실패로 세지 않는다.

S02 실제 native import에서 warning의 접근성과 원문 복구 확인은 root 수락을 기다린다.

## 호출 A/B의 실제 전달 인자 표시

root는 실제 native UI에서 A 내부 n_in 수동 Hide → 부모 복귀 → B 내부 열기의 보기
분리를 확인했다. 동일 정의의 세 단계를 내려가고 코드 `by rfl`을 `by exact True.intro`로
고쳤을 때 실제 Lean이 `True`와 `n+0=n` 타입 불일치로 거부했다. 오류 코드를 숨겨도 전역
오류가 유지되며 진단 L29가 hidden proof를 임시로 100% 배율에서 드러냈다. 이것은
실제 의미 편집/보기 분리 근거지만 B03의 정확한 editor 내부 행·열 이동은 아직 아니다.

감사자는 호출 이름에 수동으로 적힌 `n=3/n=5`를 실제 전달 인자 표시로 잘못 세지 않도록
대조를 강화했다. 같은 양성 fixture의 callA/callB 이름만 모두 `same display name`으로
바꿨다. 실제 n=3/n=5 wires는 그대로다. actual editor `내부 열기` callback에서 occurrence
trail은 A/B로 올바르게 갈리지만 화면의 모든 text/value가 동일해졌다. 호출 ID와 실제
`n ← three.out`/`n ← five.out` binding은 없고 일반 정의 계약만 표시한다.

[call-arguments-initial-results.json](call-arguments-initial-results.json) exit 1, 제품 hash와
양쪽 표시 목록을 보존했다. 최초 원래 이름의 표시 차이 관찰은
[call-context-initial-results.json](call-context-initial-results.json)에 남겼으며 이를 실제
binding의 통과로 쓰지 않는다. PLAN L178은 호출별 내부 타입 계산을 유보할 수 있지만
일반 정의와 실제 인자를 따로 표시하도록 요구한다. E03/H05로 구현자/root에 전달했고
수정을 기다린다. 치환된 타입을 추정해서 표시하도록 요구하지 않았다.
