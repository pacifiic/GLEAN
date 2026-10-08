<!-- Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0. -->

# Lean → GLEAN 변환 설계·코드 감사

2026-10-08 · 에이전트 3 역할 · 제품 파일 수정 없이 독립 실행 및 코드 검토

## 결론

이번 독립 감사의 최종 **10개 사례가 모두 기대 동작을 통과**했다. 지원 사례 8개는 실제 원문 모듈과 생성 그래프의 커널 검사를 통과했고, 지원 불가 사례 1개는 변환 전에 명시적으로 거부됐으며, 원문 변경으로 포트 타입이 오래된 사례 1개는 실제 Lean 타입 오류로 거부됐다.

초기 감사에서 발견한 인스턴스 인자 소실, private 타입 이름의 재파싱 실패, 커널에서 재검사한 지역 선언을 Meta 관찰 환경에서 찾지 못하는 문제는 구현자에게 전달했고, 수정 후 재시험했다. 임의의 전술 본문 전체를 편집 그래프로 분해하는 기능은 이번 구현 범위가 아니다.

## 방법과 최종 결과

Python 표준 라이브러리에서 `DeclarationIndexService.start → poll → convert → GraphCheckService.start → poll`을 호출했다. 요청 프로젝트는 `glean`, 파일 이름은 `Audit.lean`이며, 변환 요청에는 해당 서버 분석 작업의 `jobId`, 실제 `sourceHash`, `environmentHash`, 선택한 정리 이름을 전달했다. UI의 표시 결과만으로 통과를 판정하지 않았다.

지원 사례의 `status`는 모두 `valid`, `kernelAccepted`와 `sourceContextKernelAccepted`는 모두 `true`, 진단 목록은 빈 배열이었다.

| ID | 사례 | 기대 결과 | 실제 결과 |
|---|---|---|---|
| D01 | namespace와 지역 notation | 원문 문맥 보존, 호출 그래프 검증 | PASS · valid |
| D02 | 지역 `Inhabited Nat` 인스턴스와 `default` | 타입·인스턴스 인자 보존 | PASS · valid |
| D03 | 암묵적 `n`과 종속 입력 `Fin n` | 입력 포트와 실제 호출 타입 일치 | PASS · valid |
| D04 | 공개 정리 본문에서 private 증명 보조정리 사용 | 타입이 공개이면 변환 지원 | PASS · valid |
| D05 | 새 모듈 시스템의 `module` / `public theorem` | 원문 모듈과 그래프 검증 | PASS · valid |
| D06 | 원문의 축약 pretty-printer 옵션 | 변환용 타입이 원문의 표시 옵션과 독립 | PASS · valid |
| D07 | `Fin.cast`의 타입 안에 들어간 증명 인자 | 재파싱 가능한 타입에 증명 인자 보존 | PASS · valid |
| D08 | 업로드에서 정의한 사용자 structure와 projection | source-backed 타입 조회·관찰 지원 | PASS · valid |
| D09 | 공개 정리 시그니처가 private 타입 별칭을 참조 | 지원 불가 사유를 먼저 표시 | PASS · 변환 전 거부 |
| D10 | 같은 이름의 원문 정리를 `Nat`에서 `Bool` 입력으로 변경 | 오래된 `Nat` 포트를 실제 Lean이 거부 | PASS · invalid |

## 재현용 원문

아래 각 코드를 독립적으로 분석한다. D05의 선택 정리 이름은 `good`, 나머지는 `N.good`이다.

### D01 · 지역 notation

```lean
namespace N
local notation "ℕ₁" => Nat
theorem good (n : ℕ₁) : n = n := rfl
end N
```

최종 변환 목표는 `@Eq.{1} Nat n n`, 사람이 읽는 별도 표시 목표는 `n = n`이었다.

### D02 · 지역 인스턴스

```lean
import Lean
namespace N
theorem good [inst : Inhabited Nat] : (default : Nat) = default := rfl
end N
```

초기 출력 `Eq Inhabited.default Inhabited.default`는 `Nat`과 `inst` 인자를 잃어 `Inhabited ?m` 타입클래스 문제로 실제 검사에 실패했다. 수정 후 목표는 다음과 같고 커널 검사를 통과했다.

```lean
@Eq.{1} Nat (@Inhabited.default.{1} Nat inst)
  (@Inhabited.default.{1} Nat inst)
```

원문의 암묵적·인스턴스 입력은 이번 그래프에서 명시적인 입력 계약과 호출 인자로 전달된다. 그래프 내부의 새 코드에서 원문의 인스턴스 검색 문맥을 자동으로 재현한다고 주장하지 않는다.

### D03 · 암묵적·종속 입력

```lean
import Lean
namespace N
theorem good {n : Nat} (i : Fin n) : i = i := rfl
end N
```

최종 목표 `@Eq.{1} (Fin n) i i`를 사용하는 실제 그래프 검사에 성공했다.

### D04 · private 증명 보조정리

```lean
import Lean
namespace N
private theorem helper : True := True.intro
theorem good : True := helper
end N
```

private 의존성을 전부 금지하지 않고, 공개 시그니처의 private 상수 참조만 지원 불가로 처리하는 경계가 실제로 유지되는지 확인했다.

### D05 · 모듈 시스템

```lean
module
public theorem good : True := True.intro
```

### D06 · 원문의 표시 옵션

```lean
import Lean
set_option pp.maxSteps 1
set_option pp.instances false
set_option pp.proofs false
namespace N
theorem good [inst : Inhabited Nat] : (default : Nat) = default := rfl
end N
```

원문 분석은 오류 없이 완료됐고, D02와 같은 완전한 변환용 목표로 실제 커널 검사를 통과했다. 재파싱용 렌더는 별도 기본 `Options`에서 시작하여 완전한 이름·명시적 인자·universe·proof·lambda 타입 등 필요한 정보를 보존한다. 사람용 `displayType` / `displayOutputType`는 별도이다.

### D07 · 타입 안의 증명 인자

```lean
import Lean
namespace N
theorem good (n : Nat) (i : Fin n) : Fin.cast (Eq.refl n) i = i := rfl
end N
```

최종 변환 목표는 다음과 같았다. 사람이 읽는 표시는 `Fin.cast ⋯ i = i`로 간결하게 유지하되, 생략된 proof를 컴파일 입력으로 사용하지 않는다.

```lean
@Eq.{1} (Fin n) (@Fin.cast n n (@Eq.refl.{1} Nat n) i) i
```

### D08 · 사용자 structure

```lean
import Lean
namespace N
structure P where
  x : Nat
theorem good (p : P) : p.x = p.x := rfl
end N
```

목표 `@Eq.{1} Nat p.x p.x`로 실제 원문 모듈·그래프 커널 검사와 Meta 관찰이 모두 완료됐다. 이는 이번 `structure` 사례의 생성자·귀납 타입 등록 경계를 시험한 결과이며, 모든 사용자 귀납 타입에 대한 일반적 완전성 증명은 아니다.

### D09 · private 타입을 포함하는 공개 시그니처

```lean
import Lean
namespace N
private abbrev Ty := Nat
theorem good (n : Ty) : n = n := rfl
end N
```

초기에는 `N.Ty`가 실제 생성 모듈에서 조회되지 않았다. `pp.privateNames=true`만 추가하면 `_private.GleanUploadedSource.0.N.Ty`가 출력되지만 숫자 이름 성분을 일반 term parser로 재파싱하지 못했다. 최종 구현은 **정리 타입**의 private 상수 의존성을 검사해 변환 전에 아래 이유로 거부한다. 원문은 유지된다.

> The public signature mentions a private type or definition; use the preserved Lean source instead.

D04처럼 증명 본문에서만 private 보조정리를 사용하는 경우는 이 제한에 포함하지 않는다.

### D10 · 원문 변경 후 오래된 포트

먼저 아래 코드를 분석하고 `good`을 그래프로 변환한다.

```lean
theorem good (n : Nat) : n = n := rfl
```

그 뒤 감사용 변형에서 `graph.sourceContext.source`를 다음 코드로 바꾸고 UTF-8 본문의 SHA-256 `sourceHash`도 새로 계산했다. 그래프의 기존 `Nat` 입력·목표·호출 본문은 유지했다.

```lean
theorem good (b : Bool) : b = b := rfl
```

단순 해시 불일치 차단을 넘어 실제 타입 검사를 시험한 변형이다. Lean은 `good n`의 입력이 `Nat`인데 `Bool`이 필요하다는 오류로 거부했다. 오류에는 `graphLocation=root/source_call`, `fragmentField=body`, `bodyLine=1`, `bodyColumn=7`이 포함되어 호출 블록 본문으로 이동할 수 있었다.

## 보충 검사 S01 · 재귀 귀납 타입

위 최종 10개 사례와 별도로, 구현자의 ctor/induct Meta 등록 경계 질문에 대응하여 다음 코드를 추가 시험했다.

```lean
import Lean
namespace N
inductive Tree where
  | leaf : Tree
  | branch : Tree → Tree → Tree
def size : Tree → Nat
  | .leaf => 0
  | .branch l r => size l + size r + 1
theorem good (t : Tree) : size t = size t := rfl
end N
```

실제 분석 → 변환 → 그래프 검사는 `valid`, `kernelAccepted=true`, `sourceContextKernelAccepted=true`, 진단 없음이었다. 목표는 `@Eq.{1} Nat (N.size t) (N.size t)`였다. 이 사례에서도 재귀 귀납 타입·생성자·재귀 함수의 커널 재검사와 Meta 관찰이 완료됐으며, `addConstAsync`의 unsupported-kind fallback은 이미 완전히 commit한 constant info를 읽는 이 경로에서 문제가 되지 않았다. 이는 하나의 추가 재현 사례이며 전체 귀납 타입 지원의 완전성을 주장하지 않는다.

## 커널 검사와 Meta 관찰의 신뢰 경계

코드 검토 대상은 [source_check.py](/Users/moonone/GLEAN/glean/prototype/source_check.py)의 `AUDITOR_LEAN` 및 worker, [declaration_index.py](/Users/moonone/GLEAN/glean/prototype/declaration_index.py), [source_context.py](/Users/moonone/GLEAN/glean/prototype/source_context.py), [typed_graph.py](/Users/moonone/GLEAN/glean/prototype/typed_graph.py), [graph_jobs.py](/Users/moonone/GLEAN/glean/prototype/graph_jobs.py)와 변환·원문 복귀·내보내기 UI였다.

1. 원문 전체를 별도 `GleanUploadedSource` 모듈로 컴파일한다. namespace, section, notation, instance, private 증명 구현을 잘라서 재구성하지 않는다.
2. 감사 프로그램은 업로드 모듈을 수학적으로 이미 신뢰한 import로 취급하지 않는다. 생성 모듈의 import 목록에서 해당 모듈을 제거하고, 설치 환경의 기반 import 위에서 원문의 serialized constants를 `Kernel.Environment.replay`한다.
3. 그 커널 환경에서 생성 그래프를 다시 replay한다. 별도로 컴파일한 예상 목표도 replay하여 생성된 `glean_proof`의 실제 타입과 커널의 정의적 동치로 대조한다.
4. 목표 정리의 공리 의존성을 같은 `checked` 커널 환경에서 수집한다. 표준/엄격 정책 판정은 목표의 실제 의존성에 적용한다. 설치된 Lean/mathlib 전체를 이번 요청마다 다시 증명하는 절차는 아니다.
5. 그 이후 Meta 관찰용 `inspectedEnv`에 **replay가 승인한** `checked.constants.map₂`의 constant info를 async 등록한다. 원문 타입 별칭과 사용자 선언을 Meta에서 찾도록 하는 관찰용 어댑터이다. 원문의 unchecked 환경·확장·initializer를 커널 판정의 근거로 대체하지 않는다.
6. 실제 커널 승인·타입 동치·공리 수집은 계속 원래 `checked`를 사용한다. Meta 등록이 증명 판정으로 승격되지 않는다. 관찰 중 오류가 나면 성공을 만들어내지 않고 작업이 실패한다.

`Lean.Replay`는 안전하고 total인 선언을 재검사하며 unsafe/partial 선언은 일반적인 replay 정책에 따라 제외한다. 따라서 `sourceContextKernelAccepted`를 임의의 IO 프로그램이나 unsafe 실행의 안전성 보장으로 읽으면 안 된다. 목표 정리의 커널 유효성 역시 자연어로 의도한 수학과의 일치에 대한 증거는 아니다.

## 저장·목표 탐색·표시 경계

- 소스·환경 identity를 서버 분석 작업과 대조하고, 커널 작업의 시작·종료에서 환경 변경을 검사한다. 문서 캐시를 새 분석이나 검증으로 취급하지 않는다.
- 최초 원본 바이트와 현재 수정된 UTF-8 본문은 별도이다. 이전 원본 해시와 현재 본문 해시가 다르다는 이유만으로 정상적인 본문 편집을 부정하지 않는다.
- 선언 직접 의존 관계를 증명 포트 와이어로 자동 치환하지 않는다. 새 와이어는 변환한 정리의 실제 입력 인자 전달이다.
- 임시 원문 모듈을 사용하는 그래프의 커서 LSP 목표 조회는 현재 명시적으로 지원하지 않는다. 원문 문서로 돌아가 목표를 조회하거나 전체 그래프 검사를 실행한다.
- 생성 Lean 내보내기에는 `GleanUploadedSource.lean` companion 모듈이 필요하다. 생성 파일 하나만으로 컴파일할 수 있는 것으로 설명하지 않는다.

이 항목들의 코드 경계는 검토했지만, 이 문서는 모든 브라우저에서 두 파일 다운로드가 실제 완료되는지 또는 UI의 심미성을 직접 확인한 결과로 사용하지 않는다. 제품 UI·전체 회귀 검사는 별도 감사와 root 게이트의 범위이다.

## 제외한 실험과 감사 한계

초기 원문 표시 옵션 사례에 `set_option pp.maxDepth 1`을 사용했으나 Lean 4.34.1에는 그 옵션이 없어 **원문 자체가 `Unknown option pp.maxDepth` 오류**를 냈다. 이 실험은 제품 실패도 성공도 아니며 최종 10개 결과에서 제외했다. 실제 등록 옵션인 `pp.maxSteps`로 교체한 D06을 최종 결과로 사용했다.

초기 `[Fact True]` 사례도 해당 fixture 원문이 타입클래스 binder 오류를 냈으므로 제외하고, 실제 지원되는 `Inhabited Nat` D02로 재시험했다. 수정 중 스냅샷의 감사 프로그램 컴파일 오류(`ci.kind`, reserved identifier 등)를 최종 통과 결과와 혼합하지 않았다.

이번 결과는 위 10개 재현 사례와 읽은 코드의 경계를 확인한 것이다. 임의의 `.lean` 파일 전체 변환, 다형 정리 자동 인스턴스화, private 타입 포함 시그니처 변환, 모든 tactic의 그래프 분해, 사용자 연구 결과를 주장하지 않는다.

## 후속 감사 · 복합 검사 시간 제한과 진행 표시 (240초 당시)

root가 π 사례의 실행 시간 제한 문제를 확인한 뒤, 원문 모듈을 포함하는 그래프 작업의 기본 예산을 **총 240초**로 늘리는 수정도 별도로 검토했다. 일반 소스·그래프 및 선언 분석의 기본 예산은 **총 120초**를 유지한다. 이번 후속 감사에서는 무거운 Lean 실행을 추가하지 않았으며, 실제 π와 오류 변형의 재시험은 root의 별도 게이트이다.

이 절과 취소 경쟁 재감사는 **240초 정책 당시의 기록**이다. 현재 정책은 아래 360초 재감사 절을 따른다. 기존 실험에서 240초를 사용한 사실을 현재 정책으로 덮어쓰지 않는다.

### 코드로 확인한 경계

- 서버가 검증된 `source_context` 내부 옵션의 존재에 따라 작업별 예산을 선택한다. 클라이언트 JSON의 임의 `timeoutSeconds`는 `validate_request`가 제거한다. source-backed 기본 상한은 240초이며 내부 설정도 양수·240초 이하로 제한한다.
- `_Job.timeout_seconds`를 사용하므로 원문 작업의 예산이 동시에 실행되는 일반 작업을 연장하지 않는다. snapshot의 `timeoutSeconds`는 실제 서버 선택값이다.
- deadline은 `job.started`부터 작업 시작 이후 준비·원문 컴파일·그래프 컴파일·예상 목표 컴파일·커널 감사 시간을 합산한다. 각 단계마다 240초를 새로 주지 않는다. 작업 생성 전의 그래프 코드 생성 시간까지 포함하는 예산은 아니다.
- 실행 중 subprocess의 시간 초과와 취소는 기존 process-group 종료 경로를 따른다. 취소된 작업의 `_finish`는 `verified=false`로 유지한다. deadline 후 뒤늦게 완료한 작업도 `_finish`에서 `status=error`, `verified=false`로 바뀐다.
- 시간 연장 때문에 원문 replay, 생성 그래프 replay, 예상 목표 replay·정의적 동치 대조, 공리 의존성 수집·정책 판정 중 어느 단계도 생략하지 않았다. Meta 관찰을 커널 판정으로 대체하지 않았다.
- `GraphRunner`의 별도 `onProgress`는 queued/running 단계만 알린다. 기존 완료 결과 `deliver`는 terminal 결과만 받는다. 작업 generation이 달라진 늦은 poll은 진행 표시와 완료 결과 모두 발행하지 않는다.
- typed editor는 문서 revision과 check generation을 추가 확인하여 오래된 진행 표시를 무시한다. preview는 이 진행 경로를 타지 않고 `preview=true`, `verified=false`인 구조 결과로 남는다.
- 진행 표시는 서버의 `timeoutSeconds`와 경과 시간을 사용한다. 준비, 원문 모듈, 그래프, 목표 시그니처, 독립 커널·공리 단계 이름을 보여주며 완료 시각이나 잔여 시간을 추정하지 않는다. 서버 값이 없으면 `제한 미확정`으로 표시한다.

### 실제 수행한 가벼운 테스트

다음 두 명령을 독립 실행했고 **JS 6개 + Python 3개가 모두 통과**했다.

```sh
/Users/moonone/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test \
  glean/prototype/web/graph-runner.test.mjs \
  glean/prototype/web/graph-progress.test.mjs
python3 -m unittest glean.tests.prototype.test_source_budget -v
```

Python 테스트는 다음을 확인한다.

1. 클라이언트가 99,999초를 요청해도 일반 작업 120초·source-backed 작업 240초이며, strict 정책과 동시 작업 수 제한은 유지된다.
2. 짧은 내부 시험 예산 0.3초에서 이전 단계에 이미 사용한 0.25초를 포함하여 다음 subprocess에 남은 예산을 기준으로 timeout을 적용한다. 실제 Python sleep subprocess를 사용하며 Lean 실행은 아니다. poll 주기와 프로세스 종료 시간까지 정확히 0.05초 이내라는 주장은 아니다.
3. 전체 deadline이 지난 뒤 `valid/verified=true/kernelAccepted=true`로 완료하려 해도 결과는 `error/verified=false`이다.

JS 테스트는 서버 단계·예산 표시, 빠진 예산을 발명하지 않는 동작, 시작 중 취소, 작업 교체 시 취소 완료 대기, 완료 결과 한 번 전달, 늦은 poll의 진행·결과 억제를 확인한다.

### 시간 초과 후 관찰 정보가 검증 완료로 새지 않는지

deadline 직후 커널 결과를 얻은 경우 `kernelAccepted=true` 또는 공리 정책 통과 정보는 관찰 사실로 남을 수 있다. 그러나 다음 경로를 코드로 확인했으며, 그 정보만으로 문서 검증 완료를 표시하지 않는다.

- `renderTypedResult`는 `data.verified`를 완료 판정으로 사용한다.
- typed `inspectionSnapshot`은 `result.verified` 없이는 `verified-document`를 만들지 않는다. `inspectionCard`도 이 verification 상태만으로 현재 문서 검증을 표시한다.
- `canReuseVerifiedResult`는 `verified===true`와 현재 환경 hash 일치를 모두 요구한다.
- 저장된 Watch는 historical 관찰로 표시한다. notebook은 audit의 `verified` / `kernelAccepted`를 제거하고 저장된 관찰·공리 기록과 현재 검증을 구분한다.

이번 코드 감사에서 공리 정책의 `policyAccepted`나 남아 있는 커널 관찰 정보가 timeout 결과를 현재 문서 검증 완료로 승격하는 경로를 발견하지 않았다. 실제 240초 안에 π가 완료되는지, 모든 브라우저에서 단계 표시·취소가 같은 동작을 하는지, 이전 10개 Lean 사례가 이 후속 수정 뒤에도 동일한 실행 시간을 보이는지는 이 가벼운 감사 결과로 주장하지 않는다. 추가 제품 변경이 필요한 차단 문제는 발견하지 않았다.

### 후속 발견과 재감사 · 실행 중 취소 경쟁

독립 수락 감사에서 실제 Python subprocess 실행 중 취소를 시험했을 때, 취소 요청과 worker의 `finally`가 같은 process group을 중복 종료하여 `PermissionError`가 발생하는 경쟁을 발견했다. 이때 worker의 process 포인터 정리도 빠졌다. 최초 결과는 14개 중 13개 통과였으며, 실패 재현은 [budget-reproduced-cancel-failure.json](/Users/moonone/GLEAN/glean/research/2026-10-08-lean-conversion/budget-reproduced-cancel-failure.json)에 보존했다. Lean 증명 실패와 구분되는 실행 수명 관리 버그이다.

수리 후 코드를 다시 읽고 다음 경계를 확인했다.

- `_stop_job_process`는 job별 lock과 `Popen` 객체 identity로 같은 child의 종료를 직렬화하고 중복 호출을 억제한다. 다음 단계의 새 subprocess는 별도로 종료할 수 있다.
- `cancel`은 service lock을 해제한 후 stop lock을 얻고, worker도 stop lock을 해제한 뒤 service lock으로 포인터를 정리한다. 이 경로에 lock 획득 순서의 역전이 없다.
- `PermissionError`는 이미 종료된 프로세스에 대해서만 무해 처리한다. `process.poll() is None`인 살아 있는 프로세스의 권한 오류는 여전히 발생시켜 숨기지 않는다.
- `_run_process`의 중첩 `finally`는 stop 실패 시에도 `job.process=None`과 출력 로그 정리를 수행한다.
- 원문 replay → 그래프 replay → 예상 목표 replay·타입 대조 → 공리 감사 순서와 deadline 이후 `verified=true` 발행 차단을 유지한다.

설계 감사자는 위 Python unittest 명령을 수리 뒤 독립 재실행하여 **7개 모두 통과**를 확인했다. 이전 예산·late-finish 3개에, 종료된 group의 권한 오류 처리, 살아 있는 group의 권한 오류 전파, 동시 취소·cleanup의 단일 종료, 종료 오류 시 포인터 정리 4개가 추가됐다. 무거운 Lean 실행은 추가하지 않았다.

별도 수락 감사의 fresh-process 재실행도 **14개 모두 통과**했으며, 실제 실행 중 child가 종료되고 worker가 `interrupted`로 빠지는 결과를 [budget-acceptance-results.json](/Users/moonone/GLEAN/glean/research/2026-10-08-lean-conversion/budget-acceptance-results.json)에서 확인했다. 이 결과는 controlled Python subprocess·HTTP 예산 경계 시험이며 π 증명의 240초 내 완료 결과를 대신하지 않는다.

최종 코드 재감사와 위 재시험에서 추가 차단 문제를 발견하지 않았다. 제품 코드는 구현자 소유로 유지했으며 설계 감사자는 이 연구 문서만 수정했다. 해당 수리 이후 제품 동결이 가능하다고 root와 구현자에게 전달했다.

## 추가 재감사 · 현재 source-backed 기본/상한 360초

root는 native UI의 π 실행이 240초 예산에서 커널 감사 단계의 timeout/error로 끝났으며, 이 실행에서는 검증 성공을 얻지 못했다고 전달했다. CLI 정상 사례의 170.568초 통과와 오류 변형의 134.526초 타입 오류 기록은 별도 실행 결과로 보존하며, native 240초 실패와 혼합하지 않는다. 이 전달된 실행 시간 편차를 반영하여 source-backed 그래프의 기본/상한을 360초로 늘리는 변경을 재감사했다. 설계 감사자가 이 절에서 π를 다시 실행한 것은 아니다.

현재 코드를 읽고 다음을 확인했다.

- `SourceCheckService`의 `source_context_timeout_seconds` 기본값과 허용 상한은 360초이다. 유한한 양수만 허용하며 361초·무한대·NaN 등은 거부한다.
- `validate_source_context`를 통과한 내부 `source_context`가 있는 작업만 이 예산을 선택한다. 일반 작업은 120초이며 클라이언트 JSON의 임의 예산 요청은 여전히 제거한다. snapshot의 `timeoutSeconds`는 서버가 선택한 값이다.
- `job.started` 이후 원문 모듈, 생성 그래프, 예상 시그니처, 독립 커널 및 공리 감사의 시간을 합산한다. 각 단계에 새 360초 예산을 주지 않는다. 작업 생성 전 그래프 코드 생성은 이 예산 밖이다.
- 원문 replay → 생성 그래프 replay → 예상 목표 replay·정의적 동치 대조 → 공리 수집·정책 판정 순서를 유지한다. Meta 관찰로 커널 승인을 대신하지 않는다.
- 취소 이벤트, job별 process 종료 lock/identity, 살아 있는 프로세스의 EPERM 전파, 오류 시 process 포인터 정리, terminal 결과의 deadline 이후 `verified=true` 차단은 그대로 유지한다.
- 일반 작업의 예산, strict 정책, 동시 2개 제한을 변경하지 않는다. UI는 snapshot에서 예산을 읽으므로 360초를 표시할 수 있으며 임의의 완료 예상 시간을 만들지 않는다.

설계 감사자는 최신 변경에서 `python3 -m unittest glean.tests.prototype.test_source_budget -v`를 독립 재실행하여 **7개 모두 통과**를 확인했다. 120/360 서버 선택과 client override 차단, 360 허용·361/무한대/NaN 거부를 확인하는 테스트를 포함한다. 단계 합산 예산, 늦은 검증 차단, 취소 경쟁·권한 오류·정리 경계 테스트도 통과했다. 추가 heavy Lean 실행은 없으며, 현재 360초 native π 실행의 결과는 root의 별도 게이트이다.

이 변경에 추가 차단 문제를 발견하지 않았으며 제품 동결이 가능하다고 root와 구현자에게 전달했다. 위 240초 당시의 controlled 실험 14/14는 현재 360초 기본값을 시험한 결과로 읽으면 안 된다.
