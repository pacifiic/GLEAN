# Typed graph 핵심 수학 경로 독립 감사

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

이 회차는 새 v3 컴파일러의 **핵심 수학 경로**를 검사했다. 사용자에게 제공되는 노드 편집 UI,
드래그 연결, 저장·복구, Inspector 통합은 아직 구현 중이다. 아래 핵심 경로 통과를 전체 기능
완료로 확대하지 않는다. 기존 v1/v2 그룹 UI의 추가 근거는 [AUDIT-02.md](AUDIT-02.md)에 기록했다.

## 현재 판정

| 요구사항 | 이번 증거 | 현재 판정과 남은 일 |
| --- | --- | --- |
| R02 LeanScript | Nat 항을 명시적으로 연결한 증명 통과; 잘못된 항·미선언 지역 변수 거부; sorry는 incomplete | PARTIAL — 실제 노드 UI·저장 왕복·후속 Inspector 통합 필요 |
| R05 Cases/Join | Or 양쪽 분기 합류 통과; 누락 분기·잘못된 분기 증명·형제 가정 참조 거부 | PARTIAL — 분기별 UI·탐색·범위 배선·복구 확인 필요 |
| R08 시그니처 | 분기 안 호출 및 이를 포함하는 상위 모듈의 영향 호출 누락 발견, 수정 후 동일 재현 통과 | PARTIAL — 실제 의존 타입 Fin n, 공유 호출 UI·타입 갱신·왕복은 미검사 |
| R09 다중 출력 | Prod의 fst/snd를 후속 노드의 서로 다른 인자로 사용; Subtype 값/성질을 종속 인자로 사용; Exists 분해/재조립 통과; 잘못된 사영 및 증인 탈출 거부 | PARTIAL — 이름 있는 출력 포트의 실제 UI·선택/배선·왕복 필요 |
| R13 Calc | 최초 정상 등식·부등식 모두 실패; 수정 후 둘 다 실제 커널 통과. 잘못된 중간 항은 거부하며 step ID와 오류 줄 대응 | PARTIAL — 단계 편집 UI·오류 단계 이동·변경 무효화·왕복 필요 |

R04는 이전 회차의 PASS를 유지한다. 이 회차에서 검사하지 않은 R03/R10/R12/R14/R15는
새로 완료 판정하지 않는다. 현재 R01/R06/R07/R11도 v3 통합 회귀가 남아 있다.

## 독립 실험과 원본 자료

구현 담당자의 테스트를 복제해 실행한 결과가 아니라, 요구사항 감사자가 별도로 작성한
[audit_typed_core.py](audit_typed_core.py)의 18개 입력을 사용했다. 17개는 실제
`SourceCheckService`에 생성 소스와 **별도로 생성한 예상 루트 타입**을 전달했고,
형제 가정 누출 1개는 컴파일러 구조 검사에서 거부됐다. 성공한 소스는 별도 커널 재검사와
strict 공리 정책을 거쳤다. 모의 Lean 결과를 주입하지 않았다.

```sh
python3 glean/research/2026-10-07-grasshopper-implementation/audit_typed_core.py
```

최초 결과: 18개 중 16개 기대 결과 일치, 종료 코드 1. 원인은 아래 TREQ-01의 정상 Calc
2개 실패였다. 실패 기록은 [typed-core-initial-results.json](typed-core-initial-results.json)에
입력 그래프·생성 소스·별도 예상 타입·소스맵·원본 진단·커널 결과·소스 파일 해시와 함께 보존했다.

| 실험 | 기대 / 최초 결과 |
| --- | --- |
| R02 `n + 0 = n`, 명시적 Nat 입력 | valid / valid |
| R02 잘못된 `True.intro` | invalid / invalid |
| R02 `by sorry` | incomplete / incomplete |
| R02 노드 입력으로 선언하지 않은 루트 `n` 참조 | invalid / invalid |
| R05 `P ∨ Q → Q ∨ P`, 양쪽 분기 | valid / valid |
| R05 한 분기 누락 | invalid / invalid |
| R05 오른쪽 분기에서 왼쪽 `hp` input ref 사용 | invalid / invalid, Lean 실행 전 범위 거부 |
| R05 오른쪽 분기의 틀린 증명 `Or.inr hq` | invalid / invalid |
| R09 Prod의 서로 다른 두 출력 후속 사용 | valid / valid |
| R09 Prod Nat 필드에 `True.intro` 사영 | invalid / invalid |
| R09 Subtype 값과 해당 값의 성질 후속 사용 | valid / valid |
| R09 Subtype 성질에 `True.intro` 사영 | invalid / invalid |
| R09 Exists 증인/증거를 해당 분기에서 재조립 | valid / valid |
| R09 Exists에서 Nat 증인을 범위 밖 결과로 반환 | invalid / invalid |
| R13 2단계 등식 / 잘못된 중간 항 | valid / invalid; invalid / invalid |
| R13 2단계 부등식 / 잘못된 중간 항 | valid / invalid; invalid / invalid |

## TREQ-01 — 정상 Calc 두 번째 단계가 실패함: 수정 확인

두 정상 fixture는 다음 수학 증명이다.

```lean
calc
  x + 0 + 0 = x + 0 := by rfl
  _ = x := by rfl

calc
  x ≤ x + 1 := Nat.le_succ x
  _ ≤ x + 2 := Nat.le_succ (x + 1)
```

초기 생성기는 다음 단계 좌변을 새 `gleanTerm%` 조각으로 다시 만들었다. Lean은 두 번째
Calc 단계 처리 시 해당 좌변이 아직 미정 메타변수라며 이전 우변과 연결하지 못했다.
실제 오류는 `invalid 'calc' step, left-hand side is ?m... but previous right-hand side is
x + 0 : Nat`였으며 부등식도 같은 원인으로 실패했다.

Agent 1은 이후 좌변을 Calc의 고정 연결 구조 `_`로 생성하고 각 step ID의 소스 범위를 추가했다.
수정 후 같은 정상·음성 대조 네 개만 재검사했다.

```sh
python3 glean/research/2026-10-07-grasshopper-implementation/audit_typed_core.py \
  R13-equality-chain R13-equality-wrong-step \
  R13-inequality-chain R13-inequality-wrong-step
```

4개 모두 기대 결과 일치, 종료 코드 0. 정상 두 개는 `verified:true`, `kernelAccepted:true`,
`axioms:[]`, strict 정책 승인. 잘못된 중간 항 두 개는 `verified:false`, `kernelAccepted:false`.
실제 오류 L30/L31이 각각 `root/calc/first`·`root/calc/second` 소스 범위와 일치했다.
재검사 원본은 [typed-core-calc-retest.json](typed-core-calc-retest.json)에 있다.

이는 소스맵 데이터가 맞다는 근거이며, 브라우저에서 오류 클릭이 해당 단계 편집기로 이동한다는
근거는 아직 아니다.

## TREQ-02 — 분기 안 모듈 호출의 영향 목록 누락: 수정 확인

독립 모델 재현은 `leaf` 모듈을 `wrapper` 모듈의 Cases 왼쪽 분기에서 호출하고,
루트가 `wrapper`를 호출하는 구조를 사용했다. `leaf` 입력/출력을 Nat에서 Bool로 변경했을 때
초기 `editSignature`는 영향 호출 목록 `[]`을 반환했다. Cases 분기를 순회하지 않아
안쪽 호출과 전이적으로 영향받는 루트 호출을 모두 놓쳤다.

- 최초: [typed-signature-scope-probe.json](typed-signature-scope-probe.json)
- 재귀 범위 순회 수정 후: [typed-signature-scope-retest.json](typed-signature-scope-retest.json)

같은 모델 재현에서 다음 두 호출 ID를 반환하고 독립 Node assertion을 통과했다.

```text
module/wrapper/choose/left/innerCall
root/outerCall
```

이는 영향 호출 수집 함수의 독립 검사다. 완전한 수학 그래프의 커널 수락이나 Fin n 타입 갱신을
이 작은 모델 재현으로 대신했다고 주장하지 않는다.

## 다음 수락 검사

- 새 UI가 도착하면 위 fixture를 사용자 입력·실제 포트 연결·오류 이동·저장·복구 경로에서 다시 검증한다.
- R02/R05/R09/R13의 단독 핵심 코드가 실제 UI의 같은 `GraphCheckService` 경로에 연결되는지 확인한다.
- 실제 선언 조회 및 환경 변경(R03), 의존 모듈 입력(R08), Map/Zip/Product 원본 추적(R12), 정확한 Nat 값(R15)을 별도 검증한다.
- 기존 Watch/미리보기/검사 제어가 v3 타입과 범위 ID를 이해하고 과거 타입·검증을 현재 상태로 보이지 않는지 확인한다.
