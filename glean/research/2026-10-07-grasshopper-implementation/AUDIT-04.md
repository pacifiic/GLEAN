# Typed UI 통합·의존 타입·배치·정확한 Nat 감사

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

## 최신 요구사항 판정

| ID | 판정 | 확인된 근거 / 남은 핵심 근거 |
| --- | --- | --- |
| R01 | PARTIAL | v1/v2 Inspector·두 Watch 및 그룹 프록시는 확인. v3 실제 노드 타입·Watch·요구/제공 타입 통합을 기다림. |
| R02 | **PASS** | 실제 수학 입력·Lean 본문·출력 사용, 잘못된 항/미선언 변수/sorry 대조, 즉시 검증 무효화와 입력 내용 자동 저장·재로드를 확인. |
| R03 | PARTIAL | 실제 선언 조회 코드가 있음. Lean+mathlib 참조의 UI/커널 왕복 및 환경 변경 후 시그니처 갱신 근거 필요. |
| R04 | **PASS** | AUDIT-02의 실제 구조화된 분기·지역 문맥·남은 목표·탐색·버전 격리 근거 유지. |
| R05 | PARTIAL | 실제 분기·누락/범위 누출 음성 대조 통과. 분기 UI 편집·탐색·왕복 수락 필요. |
| R06 | PARTIAL | v1/v2 배치·드래그·그룹 포트·취소 확인. v3 호환/불일치/미확정 안내와 실제 와이어 타입 통합 필요. |
| R07 | PARTIAL | 실제 취소 및 분리된 미리보기 경로 확인. v3 자동 모드·연속 편집·버전 대조 최종 통합 확인 필요. |
| R08 | PARTIAL | 실제 Fin n 공유 호출·인덱스 변경 거부, 중첩 영향 호출 및 영속 안내 확인. 시그니처 편집·종속 포트 표시·undo/redo·왕복 수락 필요. |
| R09 | PARTIAL | 구조체/Subtype/Exists 핵심 수학 대조 통과. 다중 출력·분기 UI 왕복 수락 필요. |
| R10 | PARTIAL | 새 북마크 UI가 구현 중. 전후 실제 목표·원본 버전·탐색·왕복 근거 필요. |
| R11 | PARTIAL | 기존 선택 의존 범위 UI 확인. v3 범위·모듈 안의 표시 상태 보존 확인 필요. |
| R12 | PARTIAL | Map3·Zip3·Product6 실제 검사와 잘못된 항 위치, 길이 불일치 거부, 원본 ID 확인. 실행 전 길이/출력 수 및 UI 생성·왕복 확인 필요. |
| R13 | PARTIAL | 등식·부등식 및 잘못된 중간 단계 실제 대조 통과. 단계 UI 편집·오류 단계 탐색·왕복 필요. |
| R14 | PARTIAL | 새 A/B 및 출처 UI가 구현 중. 이름 있는 문서 전환·출처·변조된 녹색 무효화·왕복 근거 필요. |
| R15 | PARTIAL | 정확한 0/7/큰 Nat 및 큰 두 값 구별 실제 대조 통과. 슬라이더·입력·무효화·undo/redo·왕복 수락 필요. |

PASS는 해당 요구사항의 수락 근거를 뜻한다. 남아 있는 다른 요구사항을 완료했다고 확대하지 않는다.

## TUI-01 — 미적용 본문이 예전 값으로 검사되고 편집을 잃음: 수정 확인

독립 [audit_typed_ui.mjs](audit_typed_ui.mjs)는 제품의 실제 `initTypedEditor`를 최소 DOM 이벤트
환경에서 호출했다. 네트워크는 요청 본문을 관찰하는 모형이므로 이 실험을 커널 검증이나
실제 브라우저 렌더링 증거로 쓰지 않는다.

초기 이벤트 재현 결과:

```text
보이는 본문: by exact True.intro
current() 저장 본문: by rfl
check() 요청 본문: by rfl
onChange 호출: 0회
```

root의 실제 브라우저에서도 `by rfl` 검증 후 본문만 잘못 바꾸면 녹색 ‘수학 그래프 검증 완료’가
유지됐다. 또 검증 실행 중 `by sorry`로 편집하면 늦은 성공 응답이 본문을 `by rfl`로 되돌렸다.
이는 수락을 막는 실제 편집 손실·잘못된 검증 표시 결함이었다.

Agent 1은 입력 이벤트에서 문서·리비전·초안을 즉시 갱신하고 활성 폼을 검사 응답으로 다시
만들지 않도록 수정했다. 동일 이벤트 재검사는 보이는 값/저장 값/검사 요청이 모두
`by exact True.intro`, onChange 1회로 일치했다. root가 추가로 실제 브라우저에서 확인한 결과:

- `by rfl` 검사 도중 `by sorry` 입력 즉시 미검증 상태로 바뀜.
- 늦은 미리보기 응답에도 `by sorry` 본문 유지.
- ‘노드 적용’을 누르지 않아도 자동 저장되고 새로고침 후 같은 본문 복구, 검증 표시는 해제됨.
- 실제 `by exact True.intro` 검사는 `True`와 `x + 0 = x` 타입 불일치로 거부.
- 실제 `by sorry` 검사는 ‘미완성 증명’으로 표시됨.

이 근거와 AUDIT-03의 명시적 입력·미선언 지역 변수 대조를 합쳐 R02를 PASS로 갱신했다.

원본: [typed-ui-initial-probe.json](typed-ui-initial-probe.json),
수정 재검사: [typed-ui-probe.json](typed-ui-probe.json).

## TUI-02 — 시그니처 영향 안내가 즉시 사라짐: 수정 확인

초기 이벤트 결과에서 `영향 호출: root/call` 안내를 곧바로 `dirty()`의 일반 문구가 덮었다.
수정 후 영향 호출을 상태줄이 아닌 영속 카드에 표시하며 동일 이벤트 재현에서
`이번 변경의 영향 호출 / root/call`을 확인했다. 호출 수집 함수의 중첩 범위 수정은 AUDIT-03에 있다.

## TUI-03 — 모듈/분기 안 모듈 배치 생성 실패: 수정 확인

초기 `batchCalls(body, ...)`는 현재 body를 모듈 정의 환경으로도 사용하여
`Cannot read properties of undefined (reading 'find')`로 실패했다. 실패 시 그래프 자체는
원자적으로 보존됐다. 수정본은 별도 rootGraph 인자를 받고 UI가 이를 전달한다.
독립 재검사에서 분기 body의 `a,b`를 입력으로 하는 모듈 호출 2개와 원본 ID를 확인했다.

## 실제 의존 타입과 정확한 Nat

다음 6개를 [audit_typed_core.py](audit_typed_core.py)로 실제 소스 검사·별도 예상 타입 대조·
커널 재검사·strict 공리 정책 경로에서 실행했다. 6개 모두 기대 결과 일치, 종료 코드 0.

| 입력 | 결과 |
| --- | --- |
| `(n : Nat) (i : Fin n)` 공유 모듈 두 호출, n=3, i=`⟨2, by decide⟩ : Fin 3` | valid, verified=true |
| 같은 그래프에서 n만 2로 변경 | invalid, 두 호출 모두 Fin 타입 불일치 |
| Nat 0 | valid |
| Nat 7 | valid |
| Nat 문자열 `9007199254740993` | valid |
| 마지막 그래프의 값만 `9007199254740992`로 변경하고 기존 목표 유지 | invalid |

두 큰 숫자는 생성 Lean 소스에서도 서로 다른 정확한 숫자다. 숫자를 바꾼 뒤 기존 목표에 대한
증명이 거부되어 JavaScript Number 반올림으로 두 값이 합쳐지지 않았음을 확인했다.

원본 입력/소스/진단: [typed-dependent-nat-results.json](typed-dependent-nat-results.json).

## 실제 Map / Zip / Product

[audit_batch_fixtures.mjs](audit_batch_fixtures.mjs)는 제품의 `batchCalls`로 다음을 생성했다.

- Map: 입력 3개 → 호출 3개.
- Zip: 왼쪽 3개 + 오른쪽 3개 → 호출 3개.
- Product: 왼쪽 2개 × 오른쪽 3개 → 호출 6개.
- 각 호출의 operation ID와 원본 node/output 항목을 유지함.
- Zip 3 대 2는 명시적 오류이며 원본 그래프를 변경하지 않음.

초기 실제 검사에서 정상 세 개가 생성 소스 elaboration을 통과한 뒤, 새로 수정 중인 검사기의
`variable` 예약어 사용 때문에 별도 감사기에서 문법 오류로 실패했다. 즉시 전달했고 Agent 1이
이를 `localValue`로 고쳤다. 이 실패는 생성된 수학 자체가 틀렸다는 뜻이 아니다.

수정 후 **제품 API와 같은 GraphCheckService 경로**로 Map/Zip/Product, 잘못된 Map 항, 앞의
Fin 인덱스 변경 사례 총 5개를 재검사했다. 5개 모두 기대 결과 일치, 종료 코드 0.

- Map/Zip/Product 모두 verified=true, kernelAccepted=true.
- Map 가운데 원본 `left1`을 Bool로 바꾸면 실제 Lean이 Nat 입력 불일치로 거부.
- 해당 오류의 `graphLocation`은 `root/map_1/out`으로 정확히 대응.
- Fin 인덱스 변경의 두 오류는 `root/callA/out`, `root/callB/out`으로 각각 대응.

초기에는 생성된 함수 정의 범위만 있고 실제 호출 let 줄의 소스 범위가 없었다. 수정 후
`sourceLocations`와 `graphLocation`이 추가되어 이 두 재현의 진단 데이터는 해결됐다.
이 기록을 브라우저에서 특정 항목으로 실제 이동했다는 증거로 확대하지 않는다.

원본 자료:
[typed-batch-fixtures.json](typed-batch-fixtures.json),
[typed-batch-initial-results.json](typed-batch-initial-results.json),
[typed-batch-retest-results.json](typed-batch-retest-results.json).

## 아직 남은 실제 타입 관찰 결함

마지막 정상 Map/Zip/Product 응답에서 `typedNodeTypes`가 모두 빈 객체였다. Map의
`bindingTypes`에는 생성된 함수 매개변수 x의 Nat 타입 4개만 있고, `nodeBindings`가 가리키는
루트의 실제 let 노드 타입이 없었다. 이 응답을 Agent 1에게 전달했다. 따라서 새 메타데이터
키가 존재한다는 이유만으로 R01의 실제 출력 타입·Watch를 통과 판정하지 않는다.
