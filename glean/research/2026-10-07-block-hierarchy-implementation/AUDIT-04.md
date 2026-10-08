# 블록 계층 네 번째 감사 — 제품 장문 검사·내보내기·탐색 복구

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

이 회차는 한도 확장 이후 actual GraphCheckService와 실제 프론트 저장 API를 검사했다.
root가 실제로 다운로드한 3단 컨테이너 문서도 기존 원본과 비교했다. pure model,
controlled storage/DOM, actual Lean kernel과 native export를 각각 구별한다.

## 장문 제품 경로의 실패

[audit_long_product.py](audit_long_product.py)는 실제 제품 compiler의 전체 escaped 본문,
expected signature 생성, GraphCheckService → SourceCheckService → Lean 실행과 독립 커널
감사를 통과하도록 네 대조를 순차 실행했다. 자원 옵션을 강제로 늘리지 않았다.
각 result/source/expected source의 원본과 제품 파일 hash를 보존했다.

| 입력 | 실제 상태 | 시간 | 판정 |
| --- | --- | --- | --- |
| 64KiB급 정상 본문,65,530bytes/1,193행 | invalid, kernelAccepted=false, Auditor 최대 재귀 깊이 예외 | 21.455초 | FAIL |
| 같은 크기, 마지막 `exact True.intro` | invalid, 실제 True 대 n+0=n 오류 | 7.490초 | PASS 음성 대조 |
| 1MiB급 정상 본문,1,048,483bytes/10,281행 | invalid, kernelAccepted=false, 같은 Auditor 예외 | 35.947초 | FAIL |
| 같은 크기, 마지막 `exact True.intro` | error,120초 시간 제한, verified=false | 120.184초 | 정확한 타입 거부 대조 미통과 |

전체 [long-product-results.json](long-product-results.json),
[64KiB 정상 원본 결과](long-product-64k-valid-result.json),
[1MiB 정상 원본 결과](long-product-1m-valid-result.json),
[1MiB 오류 원본 결과](long-product-1m-wrong-ending-result.json).
정상 fixture는 이전 standalone Lean 기본 자원에서 실제로 성립했지만 제품의 독립 감사
경로는 성립한 증명을 검증하지 못했다. timeout을 Lean이 타입 불일치로 거부한 것으로
바꾸어 세지 않는다. B01은 이 배치에서 FAIL이다. Agent 1에게 원본 재현과 수리를 요청했고
Agent 3이 감사 traversal을 별도로 검토한다.

감사 스크립트 최초 실행에서 import root 계산과 escaped Lean 문자열 포함 assertion을
수정했다. 이는 감사 하네스 경로/표현 가정 오류였으며 제품 결함으로 기록하지 않았다.

## 프론트 원문 저장·복구와 용량

[audit_long_frontend.mjs](audit_long_frontend.mjs)는 actual parseDocument, validateDocument,
DocumentHistory, DraftStore를 호출했다. 두 크기를 JSON export/reimport, 본문 edit Undo/Redo,
current/previous 자동 복구에서 exact hash로 확인했다. controlled storage의 5MiB byte quota
안에 64KiB급 두 snapshot은134,638bytes,1MiB급 두 snapshot은2,118,716bytes였다.
[long-frontend-results.json](long-frontend-results.json).

본문이 서버 검사 한도를 넘더라도 저장 객체를 자르지 않고 보존하는 동작을 확인했다.
실제 storage write가 controlled quota를 넘으면 save가 명시적으로 실패하고 last-good draft는
그대로 남았다. 브라우저 localStorage의 실제 quota/인코딩/상호작용 성능은 이 controlled
저장소 결과와 구별하며 root의 native 붙여넣기/저장/새로고침/취소 수락이 필요하다.

## 실제 3단 컨테이너 내보내기

root는 legacy-group을 그룹2,그룹3으로 감싸고 drag/Hide/Undo/Redo/export/reimport/expand를
native에서 실행했다. 실제 [ui-three-containers.glean.json](ui-three-containers.glean.json)은
3,269bytes, SHA-256 `cfbbbabc4c650cc32790fa7dc3b48e924451aec75b093212087834de16295755`다.

감사자는 원래 f,hp,g,apply1,apply2 다섯 실제 노드가 정확히(+155,+86) 이동했고 goal은
불변임을 확인했다. e1..e5 실제 endpoint가 모두 동일하며 두 실제 compiler의 generatedCode가
동일하다. 세 container의 child chain, outer manual hidden이 실제 파일에 존재한다.
[three-containers-independent-results.json](three-containers-independent-results.json).
root가 보고한 겹친 header 클릭/시각 결함 UI19의 최종 수락은 별도로 남긴다.

## 탐색 이력 수리 재검사

이전 child Undo에서 상위로 돌아가기 이력이 사라진 결함을 동일 actual app callback으로
다시 실행했다. 현재는 child Undo 뒤 상위 버튼이 유지되고 부모 viewport가 정확히 복귀한다.
명시적 child session 복원도 path/trail/selectedIds/returnStack/view가 정확히 동일하다.
[isolation-parent-history-latest-results.json](isolation-parent-history-latest-results.json), exit0.
이전 실패 artifact는 유지하고 parent-return 결함을 닫았다.

root의 native legacy-v2 검증→Hide→Undo에서 이전 검증 상태가 해제되는 UI18의 원인을
분리했다. 현재 environment hash는 glean 하위의 연구용 `.lean`도 sourceStateHash에 포함한다.
새 연구 source 작성을 멈춘 native 재현에서는 Undo 직후 환경 확인 중 잠시 미검증이었다가
비동기 조회 후 기존 실제 11.06초 검증 결과, Q/R 타입, 공리 없음이 정확히 재사용됐다.
실제 이전/이후 environment hash도 같았다. 지속적인 소실 결함으로 확정하지 않는다.
[ui18-environment-before.json](ui18-environment-before.json),
[ui18-environment-after.json](ui18-environment-after.json).

[audit_presentation_cache.mjs](audit_presentation_cache.mjs)는 actual app callback, 실제 legacy-v2
normalization/history로 같은 환경 재사용·변경/미확정 환경 해제·새 검사 뒤 옛 응답 폐기의
네 controlled 대조를 통과했다. [presentation-cache-results.json](presentation-cache-results.json).
이를 실제 환경 provenance 조회와 구별하며 environment gate를 없애는 수정을 요구하지 않는다.

## 공유 본문 history 메모리 수정

Agent 1의 immutable subtree 공유 변경 뒤 같은 pure Node benchmark를 재측정했다.
1MiB 정의를200회 호출하고50개 layout history를 유지할 때 retained heap 증가가
1,227,168bytes, RSS 증가가14,467,072bytes였다. commit median2.65ms/p953.71ms/max5.33ms,
Undo2.40ms. 본문 직렬화는 여전히1개이며 actual pure compiler 생성 소스에도 full body1개다.
[shared-body-memory-retest-results.json](shared-body-memory-retest-results.json),
[shared-code-compiler-results.json](shared-code-compiler-results.json),
[200개 호출 fixture](fixtures/shared-code-body-1m-200-calls.glean.json).
프론트 원문 Undo/Redo/draft 대조도 새 history 파일로 다시 통과했다.
관련 history/presentation/isolation recovery32tests exit0.

동일 benchmark의 기본 출력이 과거 baseline 경로여서 재측정이 기존 full raw memory
snapshot을 덮어쓴 감사 기록 실수가 있었다. 최신 full snapshot을 retest 파일로 보존하고,
기존 baseline은 이전 감사 문서에 기록된 heap/RSS/지연/hash 수치를 옮긴 제한된 기록임을
명시했다. 현재와 과거의 정확한 process before/after memory snapshot을 함께 보존했다고
주장하지 않는다. 앞으로 script 출력은 별도 retest 경로를 기본으로 사용한다.

## HTTP 및 새 편집기 취소 결함

[audit_long_http.py](audit_long_http.py)는 실제 localhost HTTP `/api/preview`에서1MiB급
escaped body 전체가 생성 소스에 남는200 ready 결과를 확인했다(24ms,미검증).
1MiB+1bytes 본문은 invalid/명시 크기 진단이고24MiB 초과 Content-Length header는413이다.
HTTP 한도 대조는 서버의 길이 header 조기 거부를 검사하며 초과 body 전체를 서버에
전달했다고 주장하지 않는다. [long-http-preview-results.json](long-http-preview-results.json).
Lean job은 시작하지 않았다.

E04: 새 code editor의 목표 조회가 pending일 때 본문을 편집하면 옛 목표 응답은 정확히
폐기되지만 조회 버튼 disabled와 중단 버튼 visible이 남아 새 조회를 할 수 없다.
actual initCodeEditor input/async callback으로 재현했고 현재 같은key editor는 유지되므로
render만으로 복구되지 않는다. [code-query-edit-initial-results.json](code-query-edit-initial-results.json),
[audit_code_query_cancel.mjs](audit_code_query_cancel.mjs). 원문은 보존되며 Agent 1에 idle 상태
복원 수리를 요청했다. 목표 관측/취소는 P0-D 편집기의 별도 gate로 계속 추적한다.
수리 뒤 동일 pending→input→옛 응답 재현에서 query enabled/cancel hidden/body exact/stale goal
미표시를 확인했다. [code-query-edit-retest-results.json](code-query-edit-retest-results.json), exit0.
E04는 닫았다.

root는 새 넓은 편집기에서 두 본문을 실제 입력하고1MiB급10,281행/1,048,483문자 유지,
본문 L10281 이동,010000 검색의 L10002 위치를 확인했다. 실제 다운로드
[ui-one-mib-export.glean.json](ui-one-mib-export.glean.json)은1,060,146bytes이며 본문 hash가
fixture와 정확히 같다. native 새로고침 자동복구 후 재다운로드도 exact hash였다.
[ui-long-body-results.json](ui-long-body-results.json),
[native-long-body-independent-results.json](native-long-body-independent-results.json).
자동화 전체 입력5083ms에는 accessibility serialization 비용이 포함돼 browser 단독 입력
성능 수치로 쓰지 않는다. 커널 양성 실패와 editor 원문 보존 양성을 함께 유지한다.

추가 actual typed callback 대조
[mixed-body-events-results.json](mixed-body-events-results.json)은3단 공유 fixture에서 본문
편집만 검증을 해제하고 계약/포트 ID/모든 실제 간선을 유지함을 확인했다. Hide·JSON 파싱·
Undo/Redo는 의도한 본문 hash를 보존한다. root의 native 내부 편집/실제 오류/숨김과 실제로
작성한 혼합 정의 strict 검증·export 근거를 연결해 B04를 PASS로 갱신했다.

[isolation-command-results.json](isolation-command-results.json)은 actual typed commands의
빈선택 무동작, visible 카드 클릭 뒤 frozen targets 불변, 모든 target 수동숨김 시 탈출 명령,
현재 캔버스 전부 표시, 그 Undo가 manual만 복원하고 종료한 격리를 따로 유지하는 다섯
대조를 통과했다. 의미key/실제edges가 같고 추가HTTP는0개다. root의 native 격리 메뉴·
숨김/단계 수락과 결합해 H01/V01/V02/V03을 PASS로 갱신했다. 아직 native child 복원,
새 편집기의 실제 목표/취소와 오류 행 이동, 나머지 빈 상태·붙여넣기와 P1 경로는 남는다.

32개 첫 릴리스 조건과 P2/P3 다섯 후속 조건은 계속 별도로 추적한다. 이 회차는 전체 기능
완료나 마지막 제품 변경 이후의 전체 빌드/회귀 검사를 보고하지 않는다.
