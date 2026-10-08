# Agent 2 — Batch 1 요구사항 감사

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

대상은 초기 Batch 1의 R01, R06, R07, R11과 root가 추가한 R04다. 검토 도중 구현자가
수정 중이므로 아래 결함은 **최초 재현 시점**의 기록이다. 수정 통보는 재검사 결과와
구분한다. 제품 파일은 수정하지 않았다. 브라우저는 root가 소유하고 있어 직접 조작하지 않았다.

## 독립 확인 결과

| ID | 판정 | 확인한 부분 | 남은 조건 또는 결함 |
| --- | --- | --- | --- |
| R01 | FAIL | 요구/제공 타입, 의존 가정, 소스 매핑, 두 Watch의 모델·UI 연결을 확인했다. | B1-01/02는 실제 검증 범위를 잘못 표시하는 결함. 그룹 포트와 미적용 폼도 누락. 수정 후 별도 재검사 필요. |
| R04 | PARTIAL | 실제 Lean RPC 분기·가정 ID, 목표 2→1→0, 문서 변경 후 이전 ID 폐기, 빠른 앞부분 문맥 조회와 UI 렌더링 모델을 독립 확인했다. | root 브라우저의 접기/펼치기·관찰 위치 이동 증거를 기다린다. 현재 커서의 모든 열린 목표 트리라는 범위는 명확하며 전체 파일의 추정 전술 계보라고 주장하지 않는다. |
| R06 | PARTIAL | 논리 팔레트 드래그와 포트 드래그의 코드 경로, 타입 후보 표시, 와이어 출처 안내가 있다. | 실제 확대/이동·그룹 프록시 배치/연결, 취소, 호환 강조를 root가 확인해야 한다. 현재 가정 팔레트는 드래그 대상에서 제외되어 있다. |
| R07 | PARTIAL | 미리보기는 `verified:false`이며 커널 없이 실행된다. 수동/자동 지연 실행 모델과 버전 응답 차단을 확인했다. | 초기 취소는 HTTP 응답 수신만 취소한다(B1-05). 실제 작업 취소 서비스로 변경 중이므로 그 구현을 별도로 검증해야 한다. |
| R11 | PARTIAL | 선택 노드의 조상 집합 계산, 순환 방어, 문서 비변경을 독립 테스트했다. 그룹은 원본 구성 노드로 계산한다. | 보기 선택 UI의 pointerdown 처리(B1-06), 실제 그룹/모듈 탐색 및 전체 보기 복귀를 확인해야 한다. |

다른 ID는 이번 배치에서 완료로 제출되지 않았으므로 이전 상태를 유지한다.

## 실행한 검사

```text
node --test glean/prototype/web/proof-review.test.mjs glean/prototype/web/compute-gate.test.mjs
  7 passed, 0 failed

python3 -m unittest glean.tests.prototype.test_graph glean.tests.prototype.test_graph_scope \
  glean.tests.prototype.test_modules glean.tests.prototype.test_server -q
  64 tests, OK

node --check glean/prototype/web/app.js
  exit 0 (최초 배치 시점)

node --test glean/prototype/web/lean-editor.test.mjs
  13 passed, 0 failed

python3 -m unittest \
  glean.tests.prototype.test_lean_lsp.ActualLeanSessionTests.test_actual_structured_branches_track_local_scope_and_completion \
  glean.tests.prototype.test_lean_lsp.ActualLeanSessionTests.test_early_cursor_does_not_wait_for_a_later_long_running_command -q
  2 tests, OK; 10.787 seconds
```

Node 실행 파일은 `/Users/moonone/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`다.
π 전체 검사는 root의 동시 작업과 중복하지 않았다. 따라서 이 회차에서 π 전체를 재실행했다고 주장하지 않는다.

별도 독립 실험은 `composition()`에 분리된 잘못된 `left` 노드를 추가하고 실제
`check_graph(graph, "goal")` 및 `preview_graph(graph, "goal")`를 실행했다.
실제 커널은 목표를 검증했고, 분리 노드는 `workspaceDiagnostics`에 오류를 남겼다.
이 응답을 그대로 프런트엔드 `inspectNode()`와 저장 문서 검증에 넣어 아래 표시 오류를 재현했다.

- 원본 입력·실제 Lean 응답: `batch1-fixture.json`
- 프런트엔드 모델 관찰 결과: `batch1-probe.json`
- 기록된 핵심 결과: 목표 `verified:true`, 분리 오류 1개, 미리보기 `verified:false`.

## 수정 요청

### B1-01 — 목표 밖 오류 노드를 검증된 것으로 표시함

**요구사항:** R01, 기존 목표 검사 범위 보존. **중요도:** P1.

1. 정상 합성 그래프에서 목표와 무관한 `unused_bad : left`를 추가한다.
2. 이 노드의 입력에 `P`의 증명을 연결하여 실제 conjunction 타입 오류를 만든다.
3. 목표 범위로 검사한다. 실제 응답은 목표 성공과 작업 노드 오류를 구별한다.
4. `inspectNode(graph, "unused_bad", result)`를 조회한다.

최초 결과는 `verification:"verified-document"`, `diagnostics:[]`였다. 실제로는 이 노드가
`includedNodes`에 없고 `workspaceDiagnostics`에 오류 1개가 있다. Inspector는 포함 범위와
작업 노드 진단을 반영하고 이 노드를 미검증/오류로 표시해야 한다.

**추가 재검사:** 사용된 모듈 내부의 분리 노드도 동일하게 다룬다. `includedModules`에
모듈이 있다는 사실만으로 그 모듈의 모든 내부 노드를 검증된 것으로 표시하면 안 된다.
모듈별 포함 노드 또는 실제 생성 소스 매핑을 확인해야 한다. 이 추가 사항도 구현자에게 전달했다.

### B1-02 — 저장된 Watch에서 현재 커널 검증 표시가 복원됨

**요구사항:** R01, R14의 공통 신뢰 경계. **중요도:** P1.

검증된 항을 Watch에 고정한 문서를 JSON으로 저장·파싱했다. `validateDocument()`는 이를
허용하고, 복원된 documentId와 semantic fingerprint가 일치하여 초기 UI의 stale 판정은
false였다. snapshot의 `verification:"verified-document"`가 그대로 남아 현재 문서의
커널 검증이라는 문구가 다시 표시될 수 있었다. 새 문서를 실제 검사한 결과는 아니다.

고정 관찰과 현재 검증을 구분하고 외부/복구 snapshot은 과거 관찰로 강등해야 한다.
구현자는 `restoreWatches()`와 historical 표시를 추가했다고 통보했다. **통보만 받았으며
이 회차의 원래 결함을 PASS로 변경하지 않는다.**

### B1-03 — 접힌 그룹의 프록시 포트 Inspector가 비어 있음

**요구사항:** R01, 기존 그룹 지원 보존. **중요도:** P2.

그룹 입력 포트를 누르면 선택 ID가 `group:g1` 같은 가상 노드인데, `inspectNode()`는
실제 `graph.nodes`만 검색해 null을 반환했다. 선택 캡슐과 실제 검사 대상 포트를 분리하고
프록시가 가리키는 원래 노드·포트를 검사해야 한다. Watch에도 그 원본 식별자가 들어가야 한다.

### B1-04 — 아직 적용하지 않은 문맥 입력 변경을 Watch가 감지하지 않음

**요구사항:** R01. **중요도:** P2.

초기 `reviewRevision()`은 rootGraph만 해시했다. 목표 입력칸을 바꾸고 설정을 아직 적용하지
않은 경우 문서는 미검증 상태지만 이전 Watch는 현재 문서와 같은 관찰로 남는다.
폼의 미적용 상태까지 포함한 문서 의미 키 또는 명시적 pending 상태가 필요하다.

### B1-05 — 실행 취소가 실제 Lean 프로세스를 취소하지 않음

**요구사항:** R07. **중요도:** P2.

초기 버튼은 AbortController로 fetch만 취소한다. `/api/check` 서버는 동기 `subprocess.run()`으로
계속 검사하며 취소 요청·작업 ID가 없다. 자동 모드에서 새 요청을 내면서 이전 서버 작업은
슬롯을 계속 점유할 수 있다. 구현자는 취소 가능한 GraphCheckService와 start/poll/cancel
경로를 연결 중이라고 통보했다. 작업 취소·늦은 시작 응답·모드 전환 회귀를 다시 확인해야 한다.

### B1-06 — 보기 선택 UI가 캔버스 팬 이벤트에 잡힐 가능성

**요구사항:** R11. **중요도:** P2, 브라우저 재현 대기.

초기 canvas pointerdown 제외 선택자에는 `.preview-control`이 없다. 선택 메뉴를 누르면
캔버스 팬 시작과 `preventDefault()`를 실행하여 기본 select 동작을 막을 수 있다.
이 항목은 코드에서 확인한 위험이며 실제 브라우저 실패를 재현했다고 주장하지 않는다.
root에게 보기 선택 메뉴를 우선 조작해 확인하도록 요청했다.

## 다음 감사 조건

1. B1-01의 root와 모듈 내부 사례, B1-02 저장 왕복을 새 구현에 다시 실행한다.
2. 실제 graph 작업 취소 및 늦은 응답 폐기 테스트 내용을 읽고 독립 실행한다.
3. root 브라우저 결과로 R04·R06·R11의 UI 미확인을 해소한다.
4. 새 v3 노드가 들어오면 Inspector·Watch·Data Dam·의존 범위의 동일 기준을 v3에도 적용한다.
5. 새로운 검사 이후 REQUIREMENTS.md의 최신 판정만 갱신하고 최초 실패 기록은 보존한다.
