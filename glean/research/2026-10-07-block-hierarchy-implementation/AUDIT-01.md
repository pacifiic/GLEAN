# 블록 계층 첫 감사 — 범위·초기 한도·P0 표현 왕복

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

이 회차는 계획 전체의 37개 시나리오를 [REQUIREMENTS.md](REQUIREMENTS.md)에 고정하고
초기 결손과 첫 P0-A 순수 모델 배치를 감사했다. 제품 파일은 수정하지 않았다.
브라우저는 root가 맡으며 UI 통과가 없는 항목을 모델 테스트만으로 PASS 주지 않는다.
첫 릴리스의 32개 필수 시나리오와 후속 P2/P3 다섯 시나리오를 구별한다.

## 초기 코드·크기 경로

계획 SHA-256 `ac81c17f3bb629c0f66a4f52763261b1ab7f446f48f588208f5870d9240ac6b3`,
501행/수락 37개다. 기존 script·module·실제 Lean/LSP는 기반이며 새 숨김/격리/중첩/
긴 코드/현재 문서 선언 분석의 완료를 뜻하지 않는다.

```text
python3 glean/research/2026-10-07-block-hierarchy-implementation/audit_size_baseline.py
  exit 0 (초기 경계를 기록한 명령이며 Lean kernel은 실행하지 않음)

<bundled node> glean/research/2026-10-07-block-hierarchy-implementation/audit_frontend_size_baseline.mjs
  exit 0 (순수 모델/import 크기 경계를 기록함)
```

- 65,530bytes/1,193행 본문, 1,048,483bytes/10,281행 본문을 실제 Nat 계산·지역
  보조증명 코드로 구성했다. 주석/공백만 늘린 자료가 아니다. 양쪽 compiler는 8192bytes
  한도로 invalid를 반환했다. 1MiB급 full source는 checker/LSP의 128KiB에서 거부됐다.
- 별도의 프론트 fixture에서는 모델 validator가 큰 본문을 받아도 1MiB급 본문이 JSON
  escaping 후 1,068,703bytes가 되어 file import에서 거부됐다.
- regex index가 namespace/private 선언을 실제 Lean 이름/telescope로 바꾸지 못하고
  macro-generated declaration도 제공하지 않는 것을 확인했다. 단순 text 개요로 기록한다.

원본 [size-baseline-results.json](size-baseline-results.json),
[frontend-size-baseline-results.json](frontend-size-baseline-results.json).
초기 한도 결과는 각 파일 hash를 보존하며 이후 한도 변경의 완료 근거로 쓰지 않는다.
실제 사용할 장문 입력은 [fixtures](fixtures/README.md)에 저장해 root/구현자에게 공유했다.
이 자료의 양성 Lean 검증과 잘못된 마지막 단계의 음성 검증은 아직 실행하지 않았다.

## 첫 P0-A 모델 배치의 결함과 동일 재현

모델이 stable이라고 전달된 뒤 아래 세 입력을 독립 직접 호출했다.

| 발견 | 최초 실제 결과 | 요구된 수정 | 동일 입력 재검사 |
| --- | --- | --- | --- |
| malformed scope `scopes.root='broken'` | 표현을 버리며 warnings=[], original=null | 손상 진단 및 원본 recovery | warnings와 exact original 보존 |
| 유효 container 257개 | slice(0,256)으로 하나를 조용히 잃음; warnings=[], original=null | 한도 진단 및 원본 recovery | 256개 복구·한도 warning·exact original 보존 |
| 유효한 빈 imported container를 상위 그룹으로 묶음 | x=y=Infinity; JSON에는 null | 유한 좌표 또는 수정 전 원자적 거부 | 명시적 빈 그룹 오류, 원래 presentation 그대로 |

세 결과를 구현자/root/설계 감사자에게 전달했고 구현자가 실패 회귀를 추가해 수정했다.
감사자의 [audit_p0_roundtrip.mjs](audit_p0_roundtrip.mjs)는 동일 세 입력과 독립 v1/v2/v3
대조를 실행했다. 구현자 수정이 이 하네스 작성 중 적용되어 보존한 JSON은 **수정 뒤**
결과이며 최초 실패 JSON처럼 이름 붙이지 않는다.

각 문서 버전에서 세 단계 컨테이너를 만들고 hidden ID·중첩 이동을 유지했다.
DocumentHistory Undo/Redo, 실제 parseDocument JSON 왕복, 실제 DraftStore 저장/복구가
모두 원래 모델과 정확히 일치한다. 이것은 실제 파일 파싱/모델/저장 경로의 근거이며
브라우저 조작 또는 커널 증명 성공 근거가 아니다.

```text
<bundled node> .../audit_p0_roundtrip.mjs
  exit 0; 3개 v1/v2/v3 왕복 + 3개 결함 동일 입력 재검사 모두 일치

<bundled node> --test glean/prototype/web/presentation.test.mjs glean/prototype/web/history.test.mjs
  exit 0; tests 23; pass 23; fail 0; skipped 0
```

현재 hash와 결과 [p0-roundtrip-retest-results.json](p0-roundtrip-retest-results.json).
Agent 3이 따로 실행한 occurrence 수동 보기 분리/temporary ancestor cleanup/무시된
script metadata의 scope traversal 회귀와 semantic/isolation 대조는 해당 감사자의 근거로
별도 추적한다. 이 감사에서 동일 검사를 중복 실행했다고 주장하지 않는다.

## 현재 판정과 다음 수락

첫 P0-A 모델 배치의 H01/H03 및 V01–V07/V09 기반을 PARTIAL로 갱신했다. 숨김/격리
상태 막대·목록·Esc·fullscreen·경계 연결·읽기 배율과 실제 UI 이벤트/복구는 root 수락이
필요하다. H05의 호출 A/B 문맥과 P0-B/D의 혼합 장문 작성도 최종 구현/수락을 기다린다.

P1 완료는 현재 문서의 실제 command/snapshot 선언·범위·직접 의존 adapter gate를
통과해야 한다. 설치 환경의 기존 declaration 조회나 추정 regex 목록으로 대체하지 않는다.
P2/P3 항목은 미지원/후속으로 남아 있으며 첫 릴리스와 전체 계획 완료를 혼동하지 않는다.
마지막 제품 변경 뒤 전체 관련 검사와 빌드는 아직 이 회차에서 완료했다고 주장하지 않는다.

## 호출별 표현 손상·한도 재검사

새 `occurrenceViews` 배치에서 두 추가 결함을 독립 재현했다. `occurrenceViews='broken'`
형식 손상과 257개 기록 한도 초과가 모두 warning 없이 버려지고 원본도 남지 않았다.
[occurrence-corruption-initial-results.json](occurrence-corruption-initial-results.json)은 실제
실패(exit 1)와 당시 제품 hash를 보존한다. 구현자에게 전달한 뒤 동일 두 입력을 다시
실행하여 각각 명시적 진단과 exact original recovery를 확인했다.

잘못된 key가 섞인 overflow 자료만으로 한도 수정을 통과시키지 않았다. 실제 존재하는
17개 outer 호출 × 16개 inner 호출의 유효 trail에서 canonical key 256개와 257개를
따로 만들었다. 256개는 warning 없이 유지되며 257개는 한도 warning과 원본을 남기고
256개로 복구된다. 네 대조 모두 exit 0이며 [occurrence-corruption-retest-results.json](occurrence-corruption-retest-results.json)에
기록했다. 같은 batch의 key/trail 불일치 검사는 Agent 3 소유다. 이로써 감사자가 확인한
P0 표현 모델 결함 다섯 건의 동일 재현이 닫혔지만 UI에서 손상 진단을 보이는 S02 전체
수락은 남아 있다.

## 공유 긴 본문 메모리의 순수 기준 측정

[audit_shared_body_memory.mjs](audit_shared_body_memory.mjs)는 1,048,483bytes 정의 하나를
200개 호출이 공유하는 실제 v3 모델과 50entry DocumentHistory를 측정한다. JSON에는
정의 본문이 정확히 한 번 나온다. `node --expose-gc`/Node v24.19.0/darwin arm64에서
commit median 3.63ms/p95 5.96ms/max 6.90ms, Undo 2.21ms다. retained heap 증가
108,380,256bytes, RSS 증가 138,805,248bytes를 기록했다. history는 현재 문서 전체를
복제하므로 공유 정의라도 Undo entry별 본문 저장 비용은 남는다.

[shared-body-memory-baseline-results.json](shared-body-memory-baseline-results.json)은
메모리·시간·history hash를 보존한다. 이 값은 실제 브라우저 응답성이나 Lean 증명 성공,
취소/한도 초과 보존의 근거가 아니다. 계획에 임의의 메모리 통과 임계값을 추가하지 않고
구현자에게 비용과 정책 확인을 요청했다. B06은 측정 기반이 생겨 PARTIAL로 올렸다.

## root 첫 혼합 증명·격리 UI 대조

root는 [ui-mixed-3-level.json](ui-mixed-3-level.json)을 실제 가져오기 경로로 열고
같은 3단 혼합 정의의 n=3/n=5 호출 결과를 And로 합치는 전체 증명에서 Lean 커널,
의도한 목표 타입, 공리 없음 검사를 통과했다. 이 양성 자료는 직접 새 graph/code 작성이나
호출별 내부 보기를 완료했다는 근거로 확장하지 않는다.

이어 callA+join의 카드 본문 Shift 선택으로 대상2/격리 숨김3 상태를 실제 확인했다.
제목 Shift 선택 실패(UI-08), 도크가 fullscreen 버튼을 가림(UI-07), 숨김끼리 연결과
큰 경계 캡슐이 남는 밀도 문제(UI-09)가 발견되어 수정 중이다. 자세한 행동과 화면은
[HUMAN-AUDIT.md](HUMAN-AUDIT.md), [ui-first-isolation.jpg](ui-first-isolation.jpg).
V01 등의 전체 PASS는 수정 뒤 동일 동작 및 의미 불변 대조까지 보류한다.
