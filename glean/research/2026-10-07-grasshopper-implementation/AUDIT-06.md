# 마지막 통합 감사 — 실제 선언, 시그니처, 타입 메타데이터와 UI

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

이 회차는 재개 시점의 실제 파일과 독립 실행 결과를 확인한다. 제품 파일 수정·커밋·push는
하지 않았다. 실제 양성/음성 커널 대조, 제품 콜백·저장 왕복과 root의 실제 UI 수락을 합쳐
**R01–R15 모두 PASS**로 판정한다. 발견한 결함의 동일 재현을 고친 뒤 마지막 제품 변경
이후 Python 159개·JS 143개 전체 관련 검사 및 GLEAN Lake 빌드/Lean smoke가 모두
통과했다. 열린 요구사항·확인된 설계 결함은 없다. native OS 다운로드 이벤트 등 증거의
한계는 아래에서 별도로 구분한다.

## 현재 15개 요구사항 판정

| ID | 판정 | 실제 근거 및 아직 확인할 부분 |
| --- | --- | --- |
| R01 | **PASS** | 실제 타입·사용 가정 및 두 이름 있는 출력 Watch/source UI, 즉시 편집 무효화·정확한 output 이동·사용되지 않은 sorry 컴포넌트 상태 구분 재검사. |
| R02 | **PASS** | AUDIT-04의 실제 수학 노드·틀린 항·미선언 변수·sorry 및 즉시 편집/복구 근거. 최신 정상/틀린 항·미완성 독립 공통 검사기 재검사 통과. |
| R03 | **PASS** | 실제 Lean/mathlib·암묵/의존/타입클래스 참조 커널, 이름/환경/프로젝트 변경 대조, 안전 별칭과 실제 출처/source 이동 UI 확인. |
| R04 | **PASS** | 실제 LSP 분기 2→1→0, 지역 변수 ID/타입·관찰 위치 이동·버전/세션 격리 근거 유지. |
| R05 | **PASS** | 실제 분기 누락/범위/틀린 항 대조와 분기 UI 편집·오류 위치 자동 탐색·복구, 최신 분기 타입/사용 가정·형제 누출 재검사. |
| R06 | **PASS** | 실제 v3 native 연결/범위 밖 취소·undo/redo·20% 확대 배치, Nat→Nat 호환·Nat→Prop 불일치·Nat→P 미확정 후보 UI와 그룹/와이어 정보·출처 대응. |
| R07 | **PASS** | 실제 프로세스 취소와 자동 편집 뒤 실제 커널 완료 UI, 독립 manual/auto 병합·모드 전환·늦은 응답 제어기 대조. |
| R08 | **PASS** | 공유/중첩 영향 호출, 실제 Fin 인덱스 대조와 UI 시그니처 전파·wire 보존·undo/redo/reload, 정상 이름/종속 타입 변경 실제 커널 재검사 통과. |
| R09 | **PASS** | 실제 Prod/Subtype/Exists 양성·음성 대조, 이름 있는 출력 재배선/복구, 출력 삭제 문서 갱신·검증 무효화·정확한 output/source 이동. |
| R10 | **PASS** | 실제 두 단계 LSP 목표·이름/설명/위치 이동·복구·과거 표시 UI와 Cases/Fin scoped graph→source→bookmark 콜백/저장 왕복, 실제 Cases-left 탐색/기록 버튼 접근 확인. |
| R11 | **PASS** | v3 callA/B 서로 다른 cone·모듈 내부 입력과 현재 검증을 유지하는 의존/전체 보기 전환 실제 UI 확인. |
| R12 | **PASS** | 실제 Map3/Zip3/Product6·원본 ID·길이/항목별 오류와 root의 실행 전 수/세 방식 생성/Zip 거부/재로드, 전역 크기 한도의 원자적 거부 재검사. |
| R13 | **PASS** | 실제 등식/부등식·틀린 단계 및 UI 편집/복구, 정확한 first 행 강조/포커스·오류 이동, 복구한 정상 Calc 최신 커널 통과. |
| R14 | **PASS** | 실제 verified A/B UI·본문/Lean diff·출처·복원/재로드, 실제 export Blob/import/load 콜백과 변조 녹색 강등 대조. IAB native 다운로드 이벤트는 미확인으로 구분. |
| R15 | **PASS** | 정확한 0/7/큰 두 Nat 구별과 Fin 인덱스 실제 대조, 슬라이더/음수·소수 거부/즉시 무효화/undo·redo·복구. |

## R03 — 실제 선언 경로와 환경 변경 대조

독립 [audit_declarations.py](audit_declarations.py)를 실제 프로젝트/Lean 프로세스에서 실행했다.
최초 8개 항목 중 7개 기대 결과 일치, 종료 코드 1. 실패한 한 항목은 정상 선언
`Nat.le_trans`의 hygienic 별칭 문제이며 아래에 기록한다.

- 기본 Lean `Nat.add_zero` 실제 시그니처→참조 그래프: valid, verified=true, kernelAccepted=true.
- mathlib `Real.pi_pos`, import `Mathlib.Analysis.SpecialFunctions.Trigonometric.Basic`: valid,
  verified=true, kernelAccepted=true. 조회한 모듈과 실제 mathlib git commit
  `d13f23b723b8a846827a245b89c10fc7d3f11612`를 출처에서 확인했다.
- 존재하지 않는 이름 및 이름에 삽입한 줄바꿈/#eval은 거부.
- 감사 전용 임시 `glean/RequirementAuditEnvironmentChange.lean`을 추가해 실제 프로젝트의
  source/environment 식별자가 바뀌면 기존 조회 reference가 ‘선언 참조의 Lean 환경이
  변경되었습니다’로 거부된다.
- 같은 새 환경에서 시그니처를 다시 조회하면 valid/verified=true가 된다.
  감사가 끝난 뒤 그 임시 파일을 제거했다. 기존 사용자 파일은 덮어쓰지 않았다.

원본은 [declaration-results.json](declaration-results.json)이다. 최초 wrong-argument fixture는
공유 배열로 인해 참조 시그니처 불일치 guard까지만 도달했다. 그 실험을 실제 Lean 타입
불일치 증거로 쓰지 않는다. 배열을 분리한 뒤 해당 항목만 다시 실행했다:

```text
python3 .../audit_declarations.py R03-wrong-argument
  invalid, expected invalid, exit 0
```

현재 실제 Lean은 Bool 입력 n에 Nat 입력을 요구하는 `glean_component_1 n`을 거부했고,
graphLocation은 `root/reference/out`이다. 원본은
[declaration-retest-results.json](declaration-retest-results.json)이다.

### DREQ-01 — hygienic 중복 이름: 수정 확인

`Nat.le_trans`는 실제 입력 `n,m,k : Nat`와 두 지역 증명 입력을 가진다. 조회된 두 증명
입력의 이름이 모두 `a._@._internal._hyg.0`이라 정상 참조 그래프를 만들 수 없었다.
재개 직후 declaration.py에는 아직 안전/고유 별칭 처리가 없어 수정 요청을 유지했다.
구현자는 실제 Lean LocalContext에 안전하고 고유한 지역 이름을 설정한 뒤 그 문맥에서
타입/결과를 pretty-print했다. 동일 Nat.le_trans 재검사에서 두 증명 입력은 arg3/arg4로
바뀌고 원래 표시 이름도 별도로 보존됐다. 의존 타입 n≤m/m≤k도 대응한다. 실제 참조
GraphCheckService는 valid/verified=true이며 음성 Bool 입력도 거부했다. 원본은
[declaration-retest-results.json](declaration-retest-results.json), 두 대조 모두 기대 결과 일치/종료 코드 0.

추가로 실제 monomorphic 선언 `of_decide_eq_true`를 조회하여 implicit p:Prop,
instance inst:Decidable p, proof arg2:Decidable.decide p=Bool.true를 모두 명시적 포트로 연결했다.
실제 Lean은 참조 그래프와 최종 p 목표를 valid/verified=true로 검사했다. 실제 조회/소스 위치는
[declaration-instance-signature.json](declaration-instance-signature.json), 생성 소스와 검사 결과는
[declaration-instance-results.json](declaration-instance-results.json)이다.

### DREQ-02 — 조회한 flag가 UI에서 사라짐: 수정 확인

[audit_reference_ui.mjs](audit_reference_ui.mjs)는 실제 조회 자료를 제품 initTypedEditor의
조회 버튼→check 이벤트로 전달했다. 네트워크는 모형이며 이 이벤트 실험을 실제 커널
검증 또는 브라우저 렌더링 증거로 쓰지 않는다.

최초에는 `implicit:false, instance:false`가 commitForm에서 삭제되어 node.inputs와
node.reference.inputs가 달랐다. 수정 후 같은 재현은 두 입력 배열을 정확히 유지했다:
`exactSignatureRetained:true`, 종료 코드 0. 원본은
[reference-ui-results.json](reference-ui-results.json)이다.

### R03 출처·원본 이동·프로젝트 변경 수락

root가 실제 Nat.le_trans 조회 UI에서 implicit n/m/k와 고유 proof arg3/arg4, 원래 hygienic
표시 이름을 함께 확인했다. 완전한 선언 이름·Init.Prelude·glean·실제 Lean 버전·환경/
시그니처 hash·설치된 source path/L1949가 표시됐다. 원본 소스 이동을 누르면 실제
`protected theorem Nat.le_trans` 코드와 원래 L1948–1952, L1949–1951 강조가 나타났다.

감사자도 declaration_source로 Nat.add_zero와 of_decide_eq_true의 설치된 원본을 조회해
선언 이름·범위·본문 대응을 직접 확인했다. [declaration-source-results.json](declaration-source-results.json).
제품 initTypedEditor의 프로젝트 선택 input 이벤트에서 glean→mathlib를 변경하면 이전
node.reference를 삭제하고 referenceStale=true를 지정하는 것을 재현했다.
실제 backend의 환경 변경 거부/새 조회 승인, Lean+mathlib 참조 대조와 합쳐 R03 PASS다.
미해결 universe parameter는 UI에서 명시적으로 LeanScript 인스턴스화를 요구하며 이를
자동 일반화 지원으로 주장하지 않는다.

## R01/R07 — 즉시 관찰 무효화와 실제 편집 제어기

root의 실제 Inspector fixture에서 P/Q/hp/hq를 모두 연결해도 사용 가정은 P,hp만 나왔다.
요구/제공 타입도 실제 값과 대응했다. 두 출력 first/successor를 같은 make 노드에서 각각
Watch로 고정하면 두 카드가 동시에 남으며 Nat·n 사용 가정, 서로 다른
value.fst(L31)/value.snd(L35) projection 소스를 보였다.

root가 본문을 바꾸고 preview를 기다리는 짧은 동안 과거 Inspector의 ‘현재 검증됨’ 문구가
남는 결함을 발견했다. dirty 시 onSelection을 즉시 호출하도록 수정한 뒤 감사자의
[audit_compute_ui.mjs](audit_compute_ui.mjs)가 같은 제품 제어기 이벤트를 독립 재현했다.
실제 기존 검사 응답을 Inspector에 넣고 편집 직후 preview 응답을 지연시켜 확인했다:

- 기존 Inspector는 verified-document, 사용 가정 P,hp.
- 편집 직후 Inspector는 unverified, 출력 type=null, assumptionsKnown=false.
- 아직 도착하지 않은 preview가 기존 확인 타입/현재 검증을 복원하지 않는다.

이 자료와 실제 두 Watch·과거 관찰/복구·v1/v2 프록시·실제 타입 음성 대조를 합쳐 R01 PASS다.

R07 제어기 대조도 같은 스크립트로 실행했다. 네트워크 응답은 test doubles이며 이 검사를
실제 kernel 작업 완료 또는 브라우저 렌더링 근거로 가장하지 않는다.

- 수동 두 연속 편집: preview 한 번, 추가 kernel start 0, 마지막 본문 유지.
- 자동 세 연속 편집: kernel start 한 번, 마지막 본문으로 요청.
- 실행 전 수동 전환: 대기 중인 자동 kernel 요청 취소; 다음 수동 편집은 preview만.
- start 응답을 지연시키고 cancel하면 늦게 반환된 job ID에도 cancel 요청을 전송하며 결과를 표시하지 않음.
- mode 변경 뒤 늦은 preview 응답은 폐기됨.

종료 코드 0, 원본 [compute-ui-results.json](compute-ui-results.json). 실제 Lean 프로세스
종료의 근거는 AUDIT-02의 독립 child-process 취소 실험을 유지한다. R07 자동/수동 UI
연결의 최종 브라우저 수락을 root가 진행한다.

## R08 — 이름·의존 타입·순서·삭제와 이력

[audit_signature.mjs](audit_signature.mjs)는 기존 실제 Fin fixture를 사용해 다음을 독립 확인했다.

- 공유 모듈의 입력 별칭 n→limit, i→idx와 종속 타입 Fin limit, 출력 idx.val<limit 변경.
- 영향 호출 root/callA와 root/callB를 둘 다 반환하고 기존 wire ID/끝점을 보존함.
- DocumentHistory의 Undo/Redo가 이전/새 입력을 정확히 복구함.
- JSON 저장/파싱 및 validateDocument 통과.
- 순서를 바꾸고 포트를 삭제해도 기존 wire를 숨겨 삭제하지 않음.

Node 종료 코드 0, 원본 [signature-model-results.json](signature-model-results.json).
실제 GraphCheckService 대조에서 종속 입력을 앞선 변수보다 먼저 옮긴 경우 Lean이
Unknown identifier limit로 거부하고, i 포트를 삭제한 경우 구조 검사가 undeclared/out-of-scope
binder로 거부했다. 원본은 [signature-kernel-results.json](signature-kernel-results.json).

정상 별칭 변경의 최초 실행은 중단 시점 전후 90초 검사 한도를 초과했다. 최신 재검사에서는
생성한 수학 소스의 elaboration은 성공했지만 새 타입/사용 가정 감사기에서
`uncaught exception: Unknown constant glean_component_1`이 발생해 최종 invalid였다.
이 실패를 수학적 이름 변경이 틀렸다는 결과로 오인하지 않는다. 공통 metadata auditor
회귀로 구현자와 root에게 전달했으며 이 재검사 시점에서는 정상 대조가 **미통과**였다.
원본 [signature-rename-retest.json](signature-rename-retest.json).

구현자가 metadata auditor의 검사 환경을 수정한 뒤 같은 정상 입력을 다시 실행했다.
이제 valid/verified=true이고 예상 타입·커널·strict 공리 검사를 통과했다. root/callA의
미사용 let에 대한 warning은 있으나 실제 오류는 없다. 원본은
[signature-rename-fixed-results.json](signature-rename-fixed-results.json)이다. Agent 3도
사용 가정/분기 타입/Fin call-site 타입·미완성·틀린 항·형제 가정 여섯 대조를 별도로 재실행해
공통 회귀가 해소됐음을 확인했다.

root의 실제 브라우저 근거는 별도로 확인했다: Fin n→Fin(n+1)을 편집하면 callA/B의
요구 타입·연결 선택 표시가 함께 바뀌고, 기존 index wire를 보존한다. 한 Undo로 Fin n,
Redo+새로고침으로 Fin(n+1)을 복구하며 미검증이다. 이전 실제 Fin 3→Fin 2 양성/음성
대조와 중첩 영향 호출, 이번 별칭 변경·저장/이력 독립 근거를 합쳐 R08 PASS다.

## R11/R12/R13 최신 UI 근거

- R11: callB 선택 의존 보기에서는 callB/three/index를 표시하고 callA를 흐리게 한다.
  callA를 선택하면 반대 호출이 흐려진다. 공유 정의를 열면 module/bound/proof와 n/i
  의존 입력을 탐색한다. 표시 전환이 문서를 변경하는 코드는 없지만 현재 검증 유지의
  실제 UI 재검사에서 검증된 다중 출력 fixture의 입력 n을 선택하면 n만 표시하고
  make/use를 흐리게 하며 상태는 ‘수학 그래프 검증 완료’를 유지했다. 전체 보기로 돌아와도
  같은 검증 상태다. 모듈 내부/그룹 근거와 합쳐 R11 PASS다.
- R12: root가 Map 세 입력→세 출력 count를 확인했으나, 비동기 manual preview 결과가
  속성 폼을 재생성해 선택된 원본 항목이 지워져 ‘배치 생성’이 빈 입력으로 실패했다.
  구현자가 선택을 보존하도록 수정한 뒤 root가 실제 브라우저에서 다시 실행했다.
- R13: root는 틀린 첫 중간 항이 첫/후속 단계의 실제 타입 오류를 일으키고 수정·새로고침을
  보존하는 것을 확인했다. jumpKey가 step ID를 유지하고 해당 Calc 행을 강조하는 코드로
  바뀐 뒤 root가 다시 검사했다. L30 진단에서 first 행은 focused, 실제 activeElement를
  포함하며 960px viewport 내 y=678에 보였다. second 행은 강조되지 않았다. 원래 x+1로
  복구한 뒤 재로드 및 실제 ‘수학 그래프 검증 완료’를 확인해 R13 PASS다.

### R12 최종 UI 재검사 수락

- Map left0/1/2: 실행 전에 입력 3·출력 3 표시, `map_05a77ecb_0..2` 세 호출 생성,
  새로고침 뒤 일곱 노드 유지.
- Zip left 2·right 3: 길이 불일치 표시와 명시적 거부, 일곱 기존 노드 그대로.
  left를 세 개로 바꾸면 입력 3×3·출력 3 표시와 `zip_9eed018a_0..2`의 정확한 index 짝,
  새로고침 뒤 열 노드 유지.
- Product left 2·right 3: 입력 2×3·출력 6 표시, pending preview가 끝나도 선택 유지,
  `product_82307439_0..5`와 각각 정확한 원본 쌍 생성. 기존 두 연결을 포함한 14개 wire,
  새로고침 뒤 열두 노드/연결 유지와 미검증 상태.

앞선 실제 커널 대조·원본 항목 ID·중간 Bool 항목의 정확한 위치 오류와 합쳐 R12를 PASS로
판정한다. 새로운 공통 metadata auditor가 고쳐진 뒤 이 수학 양성 대조를 다시 확인해야
최종 전체 완료다.

### R12 전역 문서 한도 회귀와 수정 재검사

정상 UI 수락 뒤 감사자가 별도 모델 경계 입력을 실행했다. 총 253개 노드(루트246+모듈7)가
있는 문서에서 모듈 안 Map4를 생성하면 최초 batchCalls는 현재 범위 개수만 확인하여
257개로 문서를 변경했다. 결과 validator가 문서를 거부해 자동 저장도 실패할 수 있었다.
이 실패를 구현자에게 즉시 전달했다.

전역 typedScopes 합산 전처리 수정 후 [audit_batch_limits.mjs](audit_batch_limits.mjs)를 실행했다.

- 총 253 노드+Map4: 명시적 크기 한도 오류, 문서 변경 없음, 기존 validator 통과 유지.
- 총 511 연결+Map3: 명시적 크기 한도 오류, 문서 변경 없음, 기존 validator 통과 유지.

두 대조 통과/종료 코드 0, [batch-global-limit-results.json](batch-global-limit-results.json).
해당 경계는 모델/원자성 검사이며 실제 Lean 검사로 기록하지 않는다.

## R14 — 독립 문서·출처·비교·복구 모델 검사

[audit_notebook.mjs](audit_notebook.mjs)는 모의 커널 결과를 만들지 않고 이전 실제
Nat.add_zero 검사 기록을 A의 출처로 사용했다. B는 다른 소스/파일/정책의 미검증 편집본이다.

- 이름 있는 A/B의 본문 차이와 변경된 Lean 소스 줄, 공리 정책 차이를 확인.
- A에 실제 sourceHash·environmentHash·Lean 4.34.1·실제 공리 목록을 보존.
- JSON 내보내기→parseDocument→DraftStore 자동 저장/복구에서 두 상태 보존.
- 문서·출처·감사 객체에 삽입한 `verified:true`, `kernelAccepted:true`를 복원 시 제거하고
  과거 자료인 historical=true를 유지.
- A의 원본 본문을 정확히 복원하며 저장된 녹색 자료에서 현재 검사 결과를 만들지 않음.

Node 종료 코드 0, 원본은 [notebook-model-results.json](notebook-model-results.json).
이 실험은 모델/저장 경로의 근거이며 실제 A/B 버튼 조작의 브라우저 근거를 대신하지 않는다.
관련 notebook/typed-editor/document 테스트 15개도 독립 실행해 모두 통과했다.

### R14 실제 UI와 제품 export/import 콜백 수락

root는 두 번 실제 커널 검사한 Calc 문서를 각각 A/B로 저장했다. A의 근거는
`Nat.le_succ x`, B는 `by exact Nat.le_succ x`다. UI에는
`graph.nodes.1.steps.0.proof` 및 Lean L30의 정확한 전후 차이와 실제 환경 hash/Lean 버전/
source hash/정책이 표시됐다. A를 복원하면 원래 근거, B를 복원하면 변경한 근거를 유지하며
각 복원은 미검증이다. 새로고침 뒤 두 이름 있는 문서와 diff를 보존했다.

root의 IAB 다운로드 이벤트 대기는 timeout이라 이를 native 파일 다운로드 통과로
기록하지 않는다. 대신 [audit_notebook_handlers.mjs](audit_notebook_handlers.mjs)가 현재
app.js의 **실제** download 함수·notebook-export 클릭·file-input change·loadDocument 함수를
추출하여 이벤트 하네스에서 실행했다. 모델 JSON을 직접 저장하는 실험과 구별한다.

- 클릭이 실제 application/json Blob(8,945 bytes)을 만들고 anchor.href에 Blob URL,
  anchor.download에 `glean-notebook.json`을 지정하여 click을 호출함.
- Blob의 실제 text에는 A/B 전체 문서/출처가 보존됨.
- 그 Blob을 file-input change에 전달하면 실제 parseDocument→loadDocument 경로로 열림.
  검사 result는 null로 폐기되고 상태는 미검증, A/B는 둘 다 보존됨.
- 최상위·variant 문서·출처에 삽입한 verified/kernelAccepted를 같은 import 콜백으로 읽어도
  현재 검사 result가 null이며 과거 자료로 강등됨.

관련 DOM/네트워크/브라우저 API는 하네스의 관찰 stub이며 브라우저 렌더링이나 OS 파일
다운로드를 가장하지 않는다. 종료 코드 0, 정확한 app.js hash/호출/상태는
[notebook-handler-results.json](notebook-handler-results.json). 실제 콜백이 출력한 JSON은
[notebook-exported.json](notebook-exported.json)에 보존했다. 실제 UI 전환·비교·복구와 제품
수출입 경로/신뢰 경계 대조를 합쳐 R14를 PASS로 판정한다.

## R06/R07 마지막 실제 제스처·실행 수락

root가 typed Nat 출력 클릭 시 Nat→Nat의 호환 후보 표시와 Esc 후보 해제를 확인했다.
기존 proof.x를 해제한 뒤 **native 포트 드래그** n.out→proof.x로 연결했고, 빈 캔버스에
출력을 드롭하면 기존 wire를 보존했다. 한 Undo가 이번 재연결만 제거하고 Redo로 복구했다.
팔레트의 Nat을 화면 (820,470)에 native 드래그해 배치했다. wheel로 20% 확대 상태
(translate 632,280.4; scale .2)에서 같은 화면점에 또 드래그하면 world(-385,-324.5)지만
실제 DOM 화면점은 (820,470)이라 좌표 변환을 확인했다. 앞선 그룹 경계 검사는 유지한다.
마지막으로 실제 커널 검증을 통과한 P/Q/hp/hq 및 Nat 0 fixture에서 zero.out을 클릭하면
select.P는 candidate-incompatible/제공 Nat/요구 Prop, select.hp는 candidate-unknown/
제공 Nat/요구 P였다. Esc로 두 상태를 해제했다. 앞선 Nat→Nat candidate-compatible과
합쳐 세 상태를 모두 실제 UI로 구별했고 R06 PASS다.

R07은 root가 자동 모드를 선택하고 본문을 `by exact rfl`로 바꾼 뒤 verify 버튼을 누르지
않아도 실제 ‘수학 그래프 검증 완료’가 나오는 것을 확인했다. 앞선 실제 프로세스 취소와
수동/preview 구별, 독립 제어기의 세 연속 입력 병합·수동 전환·늦은 응답 폐기 근거와
합쳐 R07 PASS다.

## R10 실제 목표 단계와 scoped graph/source 대응

root는 실제 `bookmark.lean`의 `notebook_demo P Q hp hq : P ∧ Q`에서 constructor 위치의
목표 P∧Q, `exact hp` 위치의 P, `exact hq` 위치의 Q를 관찰했다. 단계 1은 before P∧Q /
after P, 단계 2는 before P / after Q로 저장했고 두 관찰은 glean/bookmark.lean v1 및
실제 소스 식별자를 유지했다. 첫 이름·설명을 수정한 뒤 이동은 exact hp의 L5 col5로
갔으며 재로드 후 두 이름·설명·전후 실제 관찰을 보존했다. 소스 주석을 추가하면 두
기록은 ‘과거 문서 기록’, 이동은 과거 소스 관찰 안내로 거부했다.

감사자가 [audit_bookmark_mapping.mjs](audit_bookmark_mapping.mjs)를 현재 typed-editor 및
app.js의 **실제** captureSelection/Lean 목표 탐색/onExplore/bookmark/recordDocument
콜백에 연결했다. graph fixture와 generated source/source map은 Agent 3의 실제 커널
기록이며 DOM·연결성 확인용 목표 관찰은 test doubles다. 실제 LSP 목표를 만든 실험으로
가장하지 않고 위 root의 실제 관찰 근거와 합친다.

- Cases 왼쪽: scope `root/case/left`, join/hp/P/Q 및 해당 범위의 연결만 보존한다.
  오른쪽 branch는 포함하지 않는다. 생성 소스 L28–30과 대응한다.
- 공유 Fin 모듈: scope `module/bound`, proof/i/n 및 두 입력 연결만 보존하며 같은 실제
  source map의 L28–30과 대응한다.
- 실제 탐색 버튼 콜백은 원본 generated source, scoped subgraph, sourceRange와
  source/project/file 식별자를 소스 문서로 전달한다. 이후 실제 북마크 콜백과 JSON
  parseDocument 왕복에서 모두 유지한다.
- 소스·프로젝트·파일 이름을 각각 바꾸면 현재 graph/source 대응을 모두 해제한다.
  Agent 3의 독립 과거 위치 탐색 거부 및 원래 관찰 ID/version 보존 검사도 통과했다.

Node 종료 코드 0, [bookmark-mapping-results.json](bookmark-mapping-results.json).
root가 실제 브라우저에서 Cases fixture→왼쪽 분기 열기→join 선택→Lean 목표 탐색으로
Graph.lean을 열고 현재 단계 기록을 눌러 `root/case/left` 현재 문서 기록을 확인했다.
LSP를 조회하지 않은 이 시점에는 목표를 꾸미지 않고 관찰 없음으로 표시했다.
실제 전후 목표 타임라인·범위가 대응하는 접근·독립 콜백/왕복 근거를 합쳐 R10 PASS다.

## R14 native import와 불완전한 출처 비교 수정

root가 [notebook-exported.json](notebook-exported.json)을 실제 GUI로 가져와 A/B 두 상태,
출처 및 문서 diff를 보존하고 상태가 ‘타입 그래프 검사 대기’인 것을 확인했다. 다만
B의 소스/환경 기록이 없는데 최초 UI는 A의 모든 소스를 삭제 차이로, 알려진 환경과
미확정 환경을 ‘다름’으로 표시했다. 이를 출처 표시 결함으로 구현자에게 전달했다.

수정 후 [audit_notebook_availability.mjs](audit_notebook_availability.mjs)가 그 **같은**
exported 문서를 비교하고 실제 renderNotebook 콜백을 DOM 하네스에서 실행했다.
소스 차이 0, environmentChanged=null이며 ‘소스 비교 불가 · 기록 없음’과
‘환경 비교 불가 · 기록 없음’을 표시했다. 두 실제 커널 기록을 저장한 알려진 A/B는
Lean 소스 23줄 차이 및 알려진 같은 환경을 그대로 표시해 양성 대조도 통과했다.
종료 코드 0, [notebook-availability-results.json](notebook-availability-results.json).
현재 notebook/editor/document 관련 제품 테스트 22개도 독립 실행해 모두 통과했다.
OS 파일 다운로드 이벤트는 앞서 기록한 제한을 유지하며 실제 Blob/anchor와 GUI import
검사와 구별한다.

## 마지막 요청 경합과 개별 컴포넌트 검사

Agent 3이 같은 문서에서 오래된 preview가 최신 실제 check를 덮는 결함을 독립 재현했다.
구현자가 semantic revision과 별도로 매 check의 request generation을 비교한 뒤 감사자의
기존 [audit_compute_ui.mjs](audit_compute_ui.mjs)에도 성공/오류 두 순서를 추가했다.
preview 응답을 보류하고 새 실제 결과를 전달한 뒤 오래된 성공 또는 오류를 풀면,
최신 verified 결과만 유지하고 오래된 결과·오류 표시를 모두 폐기한다. 기존 수동/자동
병합·모드 전환·취소·즉시 Inspector 대조도 그대로 통과했다. 응답은 제어된 자료라서
별도의 새 커널 성공으로 기록하지 않는다. [compute-ui-results.json](compute-ui-results.json).

Agent 3의 마지막 **실제** 커널 대조도 확인했다. 최종 root True는 valid/verified이고
axioms=[]지만, 사용되지 않은 모듈의 `False := by sorry`는 per-helper metadata에
sorryAx/hasSorry=true/policyAccepted=false로 남는다. 실제 editor가 그 응답을 받으면
root는 verified-document, 해당 모듈 노드는 incomplete-component다.
[design-audit-unused-module-retest.json](design-audit-unused-module-retest.json),
[design-audit-unused-module-ui-retest.json](design-audit-unused-module-ui-retest.json).
이를 root의 검증이 모든 컴포넌트를 검증한다는 주장으로 쓰지 않는다. 같은 auditor의
환경 freshness/epoch·정확한 output/source 이동·source/project/file 과거 대응 대조와
최종 여섯 설계 결함·다섯 lifecycle 결함 수정도 독립 재검사로 닫혔다.

## 최종 관련 검사·빌드 기록

root가 마지막 backend 수정 이후 아래 Python 전체 관련 검사를, 마지막 R07 frontend
요청-generation 수정 이후 JS 전체 관련 검사를 실행했다. 감사자는 원본 로그를 읽어
최종 개수/실패·skip 여부 및 실제 integration 항목 실행을 확인하고 이 디렉터리에 복사했다.
이 로그 확인을 감사자가 같은 전체 명령을 재실행했다는 주장으로 쓰지 않는다.

```text
GLEAN_SOURCE_INTEGRATION=1 python3 -m unittest discover -s glean/tests/prototype -v
  exit 0; Ran 159 tests in 227.320s; OK

<bundled node> --test --test-reporter=spec glean/prototype/web/*.test.mjs
  exit 0; tests 143; pass 143; fail 0; cancelled 0; skipped 0

./glean/scripts/lake build
  exit 0; Build completed successfully (4 jobs)

./glean/scripts/lake env lean tests/Smoke.lean
  exit 0
```

원본 [final-python-tests.log](final-python-tests.log), [final-js-tests.log](final-js-tests.log).
최종 Python에는 실제 typed 양성/음성·fragment breakout, source expected-type/kernel/
axiom 경계, unused-module sorry 구별, unsafe/partial helper metadata 경계, 실제 Lean
선언/source 조회와 π 증명 LSP 문맥, 실제 child-process 취소 등이 실행되어 통과했다.
JS에는 최신 request 경합·즉시 Inspector·정확한 output/source 이동·불완전한 A/B 증거,
전역 batch 한도·기존 문서/이력/도킹·그룹 등 제품 관련 회귀가 포함된다.
이 회차는 GLEAN 프로젝트의 빌드/검사를 확인하며 Lean 상위 저장소 전체 compiler
재빌드나 모든 Lean 자체 테스트를 새로 실행했다고 주장하지 않는다.

수락 범위는 명시적 수학 컴포넌트·재사용 함수·Lean 연결과 위 고정 15개다. 기존 Lean
문서를 전부 자동 그래프로 바꾸거나 미해결 universe polymorphism을 자동 추론하는
기능으로 넓혀 주장하지 않는다. 출처를 모르는 상태는 미확정으로, 외부의 저장된 검증은
과거 자료로 남기고 재검증을 요구한다.
