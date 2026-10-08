# Agent 2 — Batch 1 수정 재검사와 R04 수락

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

이 회차는 AUDIT-01의 수정 결과와 root의 실제 브라우저 관찰을 합친다. 제품 코드 변경 없이
새 검사 경로와 기존 실패 사례를 독립 실행했다. R04 외의 남은 UI/새 노드 통합을 완료로 간주하지 않는다.

## 최신 판정

| ID | 판정 | 근거와 남은 일 |
| --- | --- | --- |
| R01 | PARTIAL | root/모듈 내부 제외 노드, 복원 Watch, 미적용 폼의 의미 키 결함을 독립 재검사하여 수정 확인. root가 두 Watch의 서로 다른 타입·가정·소스 및 과거 관찰 표시를 브라우저에서 확인. 접힌 그룹의 출력 포트 검사와 전체 저장/복구 UI·새 노드 통합은 남음. |
| R04 | **PASS** | 실제 RPC 분기/지역 가정/남은 목표, 관찰 위치 이동, 재로드·버전 변경 시 ID 폐기, 0개 목표를 검증 완료로 오인하지 않는 동작을 모두 확인. |
| R06 | PARTIAL | 드래그·호환 안내 경로가 있지만 확대/이동한 캔버스, 그룹 경계의 실제 조작 및 취소 확인을 기다림. |
| R07 | PARTIAL | 실제 커널 작업 생성·완료·실행 중 프로세스 종료를 독립 확인. 미리보기 미검증 표시는 root 브라우저 확인. 자동 모드/수동 전환/늦은 응답의 완전한 UI 조합은 확인 대기. |
| R11 | PARTIAL | root가 보기 combobox가 실제 선택되는 것을 확인해 B1-06 해소. 의존 범위 모델은 통과. 그룹/모듈 선택과 전체 보기 복귀 UI를 확인 대기. |

## B1-01/02/04 재검사

`batch1-retest.json`에 다음 관찰을 보관했다.

```json
{
  "rootExcluded": {"verification": "unverified", "diagnostics": 1},
  "moduleExcluded": {"verification": "unverified", "diagnostics": 1},
  "restoredWatch": "historical",
  "unappliedFormChangesSemanticKey": true
}
```

- root 제외 노드는 AUDIT-01의 동일 실제 Lean 응답을 사용했다.
- 모듈 내부 제외 노드는 `modular_graph()`의 identity 본문에 잘못된 `left`를 추가하고
  **실제 `check_graph(..., "goal")`를 다시 실행**했다. 목표는 검증되고 분리된 내부 오류는
  남으며, Inspector가 이를 미검증으로 표시한다. 입력/결과는 `batch1-module-fixture.json`에 보존했다.
- 저장한 `verified-document` Watch를 `restoreWatches()`가 historical로 바꾸는지 확인했다.
- `reviewRevision()`은 현재 문서의 의미 키를 사용하도록 바뀌었다. 미적용 폼이 키를 바꾸는
  것을 실제 모델로 확인했다.
- root의 브라우저 관찰: apply1의 Q와 apply2의 R, 서로 다른 의존 가정 및 소스 L9/L10이
  두 고정 카드에 함께 보이고, 두 카드 모두 ‘저장된 관찰 · 현재 검증 아님’으로 표시된다.

## B1-05 실제 작업 취소 재검사

`GraphCheckService(SourceCheckService(timeout_seconds=30))`를 직접 생성해 다음을 수행했다.

1. 정상 합성 그래프를 제출하고 완료까지 polling.
2. `verified:true`, `kernelAccepted:true`, strict 공리 정책 통과와 빈 공리 목록 확인.
3. 두 번째 그래프 작업을 시작하고 실제 자식 프로세스가 생겨 `elaborating` 중인 것을 확인.
4. cancel 요청 후 `cancelled`, `verified:false`, 실제 자식 프로세스 종료를 확인.

원본 관찰은 `batch1-graph-jobs.json`에 있다. Mock이 아닌 실제 Lean 프로세스 실험이다.
따라서 B1-05의 서버 프로세스 미취소 결함은 해소됐다.

추가로 독립 실행한 관련 테스트:

```text
node --test glean/prototype/web/graph-runner.test.mjs \
  glean/prototype/web/compute-gate.test.mjs glean/prototype/web/proof-review.test.mjs
  10 passed, 0 failed
python3 -m unittest glean.tests.prototype.test_graph_jobs -q
  2 tests, OK
node --check glean/prototype/web/app.js
  exit 0
```

이 테스트의 `GraphJobTests`는 서비스 연결을 Mock으로 검사한다. 실제 프로세스 취소의
증거는 위 별도 실험이며, 테스트 이름만으로 실제 Lean 실행이라고 오인하지 않았다.

## R04 최종 수락 근거

독립 실행한 실제 Lean 입력:

```lean
theorem branches (P : Prop) : P → P := by
  intro hp
  by_cases h : P
  · exact h
  · exact hp
```

- `ActualLeanSessionTests.test_actual_structured_branches_track_local_scope_and_completion`:
  열린 목표 2개, 서로 다른 mvarId, 같은 표시 이름 `h`에 서로 다른 fvarId와 `P`/`¬P` 타입,
  이후 1개→0개, 수정 전 버전 요청의 빈 stale 응답을 독립 확인.
- `test_early_cursor_does_not_wait_for_a_later_long_running_command`:
  뒤에 10초 실행이 있어도 앞쪽 목표를 6초 내 반환하고 `diagnosticsComplete:false`를 표시하는
  실험을 독립 실행. 두 실제 테스트 합계 10.787초, OK.
- `lean-editor.test.mjs`: 13개 독립 통과. 구조화된 목표를 렌더링하고 복제한 관찰 자료를
  외부에서 바꿔도 내부 상태가 바뀌지 않으며, 편집·취소 후 이전 목표 ID를 표시하지 않는다.
- root 브라우저 관찰: L4:3에서 pos/neg 두 분기와 `h:P`/`h:¬P`, 공통 `hp`/`P`;
  L5:3에서 neg 한 분기; 관찰 위치 버튼이 L5:3으로 이동; L6:1에서 목표 0개.
- 같은 브라우저에서 0개 목표여도 상태는 ‘Lean 소스 검사 대기’를 유지했다.
- 재로드 후 미검증이며 목표 ID 트리는 새 조회 전 비어 있었고, 새 RPC 세션의 v1 자료를 조회했다.
- root는 추가 전체 LSP 테스트 17개 통과 및 실제 π 56.059초 검사를 보고했다. 이는 root의
  통합 증거이며 이 감사자가 π 전체를 다시 실행했다고 기록하지 않는다.

현재 구현은 **커서 위치에서 Lean이 보고한 모든 열린 목표와 각 지역 문맥**의 트리다.
소스 문자열에서 전역 전술 계보를 추정해 만든 것이 아니며, 전체 파일의 자동 증명 그래프를
완성했다고 주장하지 않는다. 요구된 실제 분기·남은 목표·문맥·탐색을 충족하므로 R04를 PASS로 판정한다.

## 후속 검토 요청

- 그룹 입력 Inspector는 원본 노드로 향하도록 수정됐다. 그룹 **출력** click도 원본 socket.nodeId를
  검사하도록 요청했다. 문서/범위 이동 시 Inspector 선택 상태도 초기화해야 한다.
- Watch 형식이 잘못된 입력(배열에 null, sourceRange 없이 source)을 허용하는 위험을 Agent 3에게
  전달했다. Agent 3은 현재 수정본에서 모두 거부됨을 독립 확인했다고 보고했다. 영구 회귀 테스트는
  구현자에게 요청 중이다.
- 새 v3 기능이 합쳐지면 R01/R06/R07/R11의 기존 판정을 새 노드에서도 재검사한다.

## 추가 R06/R11 회귀 확인

- root 브라우저: 65% 확대에서 사이드바 Apply를 화면 `(635, 615)`에 드롭하여 7번째 노드의 중심이 x=635.2에 생성됨. 한 번 Undo로 6개, Redo로 7개 복원.
- 같은 노드에 `f` 출력→`fn`, `hp` 출력→`arg` 실제 포트 드래그 연결 후 출력 `Q`, Inspector의 `fn←f`·`arg←hp`·요구/제공 `P`·의존 가정 `hp,f`·생성 소스 L10 확인. 리본에서도 서로 다른 두 위치로 드래그하여 8·9번째 노드 생성.
- root는 의존 범위 선택기가 실제로 열리고 Q/R 노드 선택에 따라 다른 범위를 표시함을 확인했다.
- 감사자는 갱신된 `app.js`에서 그룹 출력 클릭이 `inspectedId=socket.nodeId`로 실제 원본 노드를 가리키고 문서/범위 전환 시 해당 상태를 초기화함을 확인했다. Esc와 포인터 취소는 임시 와이어 상태를 버리며, 그 후 pointerup은 연결을 확정하지 않는 코드 경로다. 이 사항은 코드 확인이며 별도 브라우저 제스처를 실행했다고 주장하지 않는다.
- 독립 실행: `node --test glean/prototype/web/module-model.test.mjs glean/prototype/web/document.test.mjs glean/prototype/web/entrypoint.test.mjs` — 28개 통과, 종료 코드 0. 그룹 간 프록시 배선·접은 그룹 이동·거부 시 기존 배선 보존·문서 왕복·엔트리 모듈 구문 검사를 포함한다.
- 남은 근거: 그룹 경계의 실제 포트 드래그, Esc/범위 밖 드롭의 브라우저 확인 또는 이벤트 회귀 테스트, 새 v3 노드 통합. R06/R11 판정은 이 단계에서 PARTIAL을 유지한다.

## 그룹 경계와 취소의 브라우저 재검사

root가 함수 모듈 예제로 다음을 실제 확인했다.

- 그룹을 접은 뒤 출력 `pair` 클릭: Inspector는 가상 그룹이 아닌 실제 `pair`·`R ∧ R`와 생성 소스 L20을 표시했다.
- 접힌 그룹의 `first` P 입력 클릭: 실제 `first` 모듈과 의존 입력 `hp1,f,g`, 소스 L18을 표시했다.
- `hp2` 출력에서 접힌 그룹 `first` P 입력으로 드래그: 실제 Inspector의 연결이 `hp1`에서 `hp2`로 변경되고 한 번 Undo로 `hp1`이 복원됐다.
- `hp2` 출력에서 빈 캔버스로 드롭: 기존 `hp1` 연결을 유지했다.
- `hp2` 출력 클릭→Escape→`first` 입력 클릭: 기존 `hp1` 연결을 유지했다. 마우스를 누른 채 Escape를 보내는 제스처는 도구 제약으로 실행하지 않았으며, 앞서 확인한 공유 취소 상태 코드 경로와 함께 평가한다.

B1-03의 그룹 입력/출력 Inspector 회귀와 기존 v1/v2 그룹 경계의 R06 배치·연결·취소 근거가 충족됐다. 새 typed graph UI 통합을 아직 검사하지 않았으므로 전체 R01/R06/R11 완료 판정은 유보한다.
