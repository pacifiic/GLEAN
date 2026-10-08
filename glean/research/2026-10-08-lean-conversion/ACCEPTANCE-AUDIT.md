# Lean 선언 호출 변환 독립 수락 감사

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

## 판정

2026-10-08, Agent 2는 제품 코드를 수정하지 않고 실제 Lean 명령 분석 → 서버 변환 → 생성 그래프 검사 경로를 독립 실행했다. [실험 fixture](acceptance_experiment.py)의 **16개 시나리오가 모두 통과**했다. 실제 결과는 [acceptance-results.json](acceptance-results.json)에 보존한다.

이번 판정의 범위는 **지원되는 공개 단형 정리의 호출을 편집 가능한 v3 그래프로 만드는 기능**이다. 증명 본문의 tactic/have/calc/cases를 내부 블록으로 자동 분해하는 기능을 완료했다고 판정하지 않는다.

## 실제 Lean 실험

| 구분 | 시나리오 | 확인 결과 |
| --- | --- | --- |
| 양성 1 | 공개 정리의 본문에서 현재 파일의 private 보조정리 호출 | 원본 모듈과 그래프의 독립 커널 검사, strict 정책, 실제 입력 와이어 통과 |
| 양성 2 | namespace 안의 공개 `abbrev Size := Nat`, `i : Fin (n+1)` | 의존 입력 순서와 실제 와이어 2개 보존, 커널 통과 |
| 양성 3 | `{i : Fin n}` 암묵 입력 | implicit 플래그와 포트 보존, 실제 커널 통과 |
| 양성 4 | Unicode 입력 이름 `π` | 위생적인 `arg0`와 originalName `π` 보존, 실제 커널 통과 |
| 양성 5 | `[inst : Inhabited Nat]`, `(default : Nat)` | instance·implicit 플래그와 명시적인 canonical 타입 계약, 실제 커널 통과 |
| 지원 경계 | 공개 정리의 타입이 private 정의를 사용 | 구체적 지원 불가 사유로 거부, 원문 유지 |
| 지원 경계 | universe 다형 정리 | 명시적 LeanScript 인스턴스화 필요 메시지로 거부 |
| 지원 경계 | private 정리 선택 | 구체적 private 사유로 거부 |
| 출처 | 변환 요청의 오래된 sourceHash | 변환 전에 거부 |
| 출처 | 변환 요청의 오래된 environmentHash | 변환 전에 거부 |
| 음성 | 생성된 script 본문을 `by exact True.intro`로 변경 | 실제 타입 오류, `root/source_call`, 본문 1행 4열로 매핑 |
| 출처 | 보존 원문 수정 후 기존 sourceHash 유지 | 컴파일 전 거부 |
| 출처 | 저장 문서의 과거 environmentHash로 재검사 | 실제 현재 환경과 비교해 거부 |
| 완성도 | 원본 정리에서 `sorry` 사용 | kernelAccepted=true와 verified=false를 구별, incomplete 및 sorryAx 표시 |
| 공리 정책 | 원본 정리에서 사용자 정의 공리 사용 | 커널 검사와 정책 승인 구별, customAxioms 및 invalid 표시 |
| 부분 분석 | 정상 정리 뒤에 타입 오류가 있는 파일 | 전체 오류 파일 변환을 명시적으로 거부 |

양성 5개는 전부 `verified=true`, `kernelAccepted=true`, `sourceContextKernelAccepted=true`, strict 공리 없음으로 통과했다. sourceContext의 원문 문자열은 동일하고 원문 복귀의 strict 정책도 보존됐다. 양성 실험 파일 자체는 오류 없는 실제 명령 분석을 선행 조건으로 검사했다.

## UI 상태·저장 모델 검사

다음 JavaScript 파일의 검사 **9개를 별도로 재실행하여 모두 통과**했다.

- `glean/prototype/web/source-analysis.test.mjs`
- `glean/prototype/web/source-context.test.mjs`

변환이 서버 분석 job/source/environment 식별자를 사용하고, 늦은 변환 응답이 수정된 원문을 덮지 않으며, 과거·부분 오류 분석의 변환 버튼이 비활성화되는 것을 확인했다. 보존 원문의 JSON 저장·복구와 손상된 context 거부도 확인했다. 이 검사는 controlled response와 DOM 모델을 사용하며 실제 커널 검사 또는 native 화면 검사의 대체 근거로 세지 않는다.

## 감사 중 수정과 한계

- 원문 복귀의 공리 정책이 항상 standard로 바뀌는 문제를 구현자에게 전달했고, strict 보존 수정 후 실험에서 확인했다.
- 개발 중 추가한 명령 분석 필드가 `Array Name`에 `toArray`를 호출해 Lean 컴파일에 실패하는 회귀를 전달했다. 수정 후 최종 명령 분석과 실제 변환 실험을 통과했다.
- 초기 독립 fixture에 Lean 예약어 `instance`를 정리 이름으로 사용한 오류는 감사자가 `instance_proof`로 수정했다. 제품 실패로 계산하지 않았으며, 양성의 오류 없는 분석 선행 조건을 강화했다.
- 최종 native UI에서 Undo/Redo·원문 복귀·원본 바이트 다운로드·시각적 품질과 전체 빌드/검사 gate는 root의 별도 수락 범위다. 이 문서만으로 그 검사를 완료했다고 주장하지 않는다.
- 보존 원문을 사용하는 그래프의 커서 목표 조회는 현재 명시적으로 미지원이다. 원문 문서의 목표 조회 또는 전체 그래프 Lean 검사를 사용한다.

## 재실행

저장소 루트에서 다음 명령을 사용했다.

```sh
python3 -m glean.research.2026-10-08-lean-conversion.acceptance_experiment
/Users/moonone/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test glean/prototype/web/source-analysis.test.mjs glean/prototype/web/source-context.test.mjs
```

실험은 제품 파일을 수정하지 않는다. 재실행하면 이 실험의 결과 JSON을 갱신한다.

## 후속 감사 1: 당시 240초 예산과 취소

이 절은 240초 정책을 적용했던 당시의 결과다. **현재 정책은 아래 후속 감사 2의 일반 120초 / sourceContext 그래프 360초다.** 240초 결과 JSON은 당시 근거로 보존하며 덮어쓰지 않았다.

π 선언 호출 그래프의 기존 120초 초과를 root가 확인한 뒤, 구현자는 보존 원문 모듈을 함께 컴파일하는 작업에만 총 240초의 예산을 부여했다. Agent 2는 무거운 Lean 실험을 추가하지 않고 [budget_experiment.py](budget_experiment.py)로 **14/14 controlled 시나리오 PASS**를 확인했다. [최종 결과](budget-acceptance-results.json)를 보존한다.

- 일반 원문·그래프 검사는 120초, sourceContext 그래프는 job별 240초다. 서비스 전역의 일반 예산은 변경되지 않는다. 확장 예산 설정은 양수이며 최대 240초다.
- job 시작 시각을 통제하고 짧은 실제 dummy subprocess를 실행해, 경과 120초의 일반 작업은 Timeout, 같은 경과의 sourceContext 작업은 완료, 경과 240초의 sourceContext 작업은 Timeout임을 확인했다. 실제로 120초나 240초를 기다리는 실험은 아니다.
- 임시 loopback HTTP 서버를 통해 `/api/lean/check/start`에 client `timeoutSeconds:240` 및 raw `sourceContext` 필드를 넣어도 120초임을 확인했다. sourceContext 없는 `/api/graph/check/start`도 요청 또는 그래프에 있는 client timeout 값으로 240초를 선택할 수 없다.
- strict 정책, 동시 활성 작업 2개 제한, 취소 후 슬롯 반환, 늦은 완료의 검증 승격 차단을 확인했다. 실행 중인 dummy child도 취소 후 종료되고 `job.process=None`, cancelled, verified=false가 유지된다.

추가 취소 실험에서 `cancel()`과 worker의 finally가 동일 process group을 병렬 정리하며 `PermissionError(EPERM)`를 일으켜 포인터 정리가 누락되는 문제를 **fresh process 2회 재현**했다. [첫 실패](budget-initial-cancel-failure.json)와 [예외를 기록한 재현 결과](budget-reproduced-cancel-failure.json)를 별도로 보존했다. 이 실패가 verified=true를 만드는 것은 아니지만 정상적인 작업 정리가 깨졌다.

구현자는 job별 정리 lock과 동일 child의 중복 종료 방지, 이미 종료된 leader에서만 EPERM을 무해하게 처리하는 분기, nested finally의 포인터 정리를 적용했다. 수정 후 위 14개 실험이 모두 통과했다. 살아 있는 process의 PermissionError를 조용히 무시하지 않는 것도 관련 회귀 검사에서 확인했다.

최종 수정 후 다음 관련 검사도 독립 재실행했다.

- Python `test_source_budget`: 7/7 PASS — 총 deadline 이후 검증 결과 차단, phase 사이 시작 시각 유지, 취소 정리 race 및 살아 있는 process의 권한 오류 유지 포함.
- Python `SourceJobTests`: 4/4 PASS.
- JS `graph-progress.test.mjs` + `graph-runner.test.mjs`: 6/6 PASS — 서버 phase·경과 시간·총 예산 표시, 진행 중 검증 결과 공개 방지, 취소된 늦은 poll 차단.

이 부록은 시간 예산과 상태·취소의 감사다. π 그래프의 240초 안 실제 커널 통과 여부와 전체 검사 gate는 root가 별도로 확인한다.

```sh
python3 -m glean.research.2026-10-08-lean-conversion.budget_experiment
python3 -m unittest glean.tests.prototype.test_source_budget glean.tests.prototype.test_source_check.SourceJobTests -v
/Users/moonone/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test glean/prototype/web/graph-progress.test.mjs glean/prototype/web/graph-runner.test.mjs
```

## 후속 감사 2: 현재 360초 예산

root는 native π 그래프의 240초 제한에서도 독립 커널 단계가 시간 초과하는 것을 확인했고, 보존 원문 모듈을 함께 검사하는 작업의 기본·상한을 360초로 변경하도록 요청했다. 일반 원문·그래프의 120초 제한은 유지한다. Agent 2는 무거운 Lean 실험을 추가하지 않고 아래 경계를 독립 확인했다.

[현재 controlled 결과](budget-acceptance-360s-results.json)는 **14/14 PASS**다. [budget_experiment.py](budget_experiment.py)는 현재 360초 기준으로 실행하고 이 별도 파일에 결과를 저장한다. 기존 [240초 기준 결과](budget-acceptance-results.json), 취소 실패 2개 파일은 그대로 보존했다.

- sourceContext 작업의 snapshot·실제 job budget은 360초, 서비스의 일반 budget은 120초다. constructor의 361초·0·음수·무한대·NaN·문자열·None 설정은 거부한다.
- 시작 시각을 통제한 짧은 실제 subprocess에서 일반 작업은 경과 120초에 Timeout이다. sourceContext 작업은 기존 경계였던 **경과 240초에도 실행을 완료**하고, **경과 360초에는 Timeout**이다. 오래 기다리는 방식의 실험은 아니다.
- 실제 loopback HTTP POST에서 raw source 요청의 `timeoutSeconds:360`와 raw `sourceContext` 필드는 확장 예산을 선택하지 못한다. sourceContext 없는 graph 요청도 client timeout 값으로 확장할 수 없으며 둘 다 120초다.
- strict 정책·활성 슬롯 2개·취소 후 슬롯 반환·취소된 늦은 완료의 verified 차단이 유지된다. 실행 중 dummy child의 취소와 포인터 정리도 다시 통과했다.
- 변경 후 관련 Python 검사 11/11, JS progress/runner 검사 6/6을 독립 재실행해 통과했다. JS는 서버가 반환한 360초 예산을 표시하고 진행 상태를 최종 검증 결과로 바꾸지 않는다.

이 감사는 현재 시간 예산·상태·취소 경계의 확인이다. **π 그래프가 360초 안에 실제 커널 검사를 통과하는지는 root의 단독 native 검사 결과로 별도 판정한다.** 이 절의 14개 검사에 π 커널 통과를 포함하지 않는다.
