# 블록 계층 다섯 번째 감사 — 긴 본문 수리·실제 선언·공유 편집

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

이 배치는 실제 제품의 긴 본문 실패를 같은 입력으로 다시 검사하고, 현재 파일 선언 분석과
root의 native 공유 편집·복구 근거를 독립 산출물에 연결한다. 실제 Lean, 제품 callback에
controlled transport를 붙인 검사, pure 모델, 실제 다운로드를 구별한다. 감사자는 제품을
수정하지 않았으며 .lean 원본을 새로 쓰지 않아 검증 중 프로젝트 환경 hash를 바꾸지 않았다.

## 동일한 긴 본문 네 대조 재검사

[audit_long_product.py](audit_long_product.py)에서 actual compile_typed_graph →
GraphCheckService → SourceCheckService → Lean 예상 타입 및 독립 kernel audit를 순차 실행했다.
기존 실패 JSON과 Lean 원본은 그대로 남기고 새 결과는 `retest` 접미사로 저장했다.
기본 Lean 자원 한도를 강제로 높이지 않았다. 전체 원문은 result JSON의 generatedCode에
보존되며 fixture의 escaped body가 생성 소스에 정확히 존재함을 먼저 확인했다.

| 입력 | 실제 결과 | 전체 제품 시간 |
| --- | --- | --- |
| 64KiB급 정상,65,530bytes/1,193행 | valid, verified=true, kernelAccepted=true, 공리 없음 | 23.922초 |
| 마지막 단계 `exact True.intro` | invalid, 실제 True 대 n+0=n, body1193:3 | 7.884초 |
| 1MiB급 정상,1,048,483bytes/10,281행 | valid, verified=true, kernelAccepted=true, 공리 없음 | 37.238초 |
| 마지막 단계 `exact True.intro` | invalid, 실제 True 대 n+0=n, body10281:3 | 25.867초 |

[전체 요약](long-product-retest-results.json),
[1MiB 정상](long-product-1m-valid-retest-result.json),
[1MiB 오류](long-product-1m-wrong-ending-retest-result.json).
잘못된 두 입력에는 하나씩 실제 타입 불일치 진단이 있으며 graphLocation=root/proof,
fragmentField=body, Unicode 행·열 metadata를 포함한다. 기존 Auditor maxRecDepth 실패와
1MiB 잘못된 종결의 timeout을 같은 입력으로 닫았다. 기존 실패 기록은 [AUDIT-04.md](AUDIT-04.md)에
남긴다. 이 결과와 native 원문 입력·새로고침·취소 수락을 합쳐 B01을 PASS로 갱신했다.

root의 실제 1MiB 코드 편집기는10,281행/본문 hash를 보존했고 끝 행 이동·중간 검색을 했다.
actual 작은 Unicode 오류의3단 접힘·숨김·격리 밖 진단에서 caret69/focus=true와100% 공개가
확인됐다. Agent3의 실제 type/syntax/astral/EOF mapping과 저장된 실제 결과를 소비하는 editor
대조도 통과했다. UI22 임시 공개 복귀 시 codeTarget 종료는 별도의 최종 native 재수락으로
남겨 H02/V05/B03을 아직 PARTIAL로 유지한다.

## 현재 파일의 실제 선언 1,000개

[audit_declarations_1000.py](audit_declarations_1000.py)는 실제 DeclarationIndexService를 실행했다.
65,203bytes 원문의1,000개 선언 이름, 명시 입력 n:Nat, 출력 n+0=n, 범위 L9..L1008,
직접 Nat.add_zero 의존을 전부 대조했다.10.614초, analyzed/verified=false/kernelAccepted=false다.
정규식 추정을 실제 선언으로 바꾸어 세지 않았다.
[실제 요약](declarations-1000-audit-results.json), [전체 metadata](declarations-1000-actual-result.json).

실제 반환 imports는 `['Init','Init']`이며 고유 목록은 Init이다. 모든 선언의 dependencyModules는
Nat.add_zero→Init.Core와 나머지 직접 상수→Init.Prelude를 제공한다. 환경·소스 hash도 반환됐다.
Agent3의 namespace/section/notation/private/macro-generated/instance/부분 오류 뒤 정상 선언
actual 결과를 함께 확인했다. [명령 adapter 대조](design-audit-command-product-checks.json).

[actual source-analysis UI callback](declarations-1000-ui-results.json)은 위 실제 metadata를 소비했다.
50→100 점진 표시, 검색0999→1카드, 원문1007 zero-based 행 이동과 import 소유 모듈 선택을
대조했다. semantic256노드 허용/257거부도 유지됐다. 이 controlled DOM 측정은 browser layout
시간이 아니다. root native 역시 실제1,000개 분석→50카드→더 보기→검색1개→L1008을 확인했다.
검색114ms에는 도구와 accessibility 비용이 포함된다.

root는 현재 파일 선언0999의 직접 Nat.add_zero를 설치 환경에서 실제 조회하고, 업로드와
다른 출처임을 표시한 뒤 Init.Core 참조 그래프를 만들었다. 실제 kernel/goal/공리 없음이
통과한 [다운로드 문서](ui-installed-reference.glean.json)를 독립 compiler로 다시 읽었다.
[참조 export 검사](installed-reference-independent-results.json). 이 경로는 업로드 증명 본문을
설치 선언의 검증 근거로 복사하지 않는다. 현재 private 선언은 탐색 가능하되 별도 작업 모듈
연결 전 직접 호출 미지원이 분명하다.

## 공유 200호출의 실제 취소·복구

root가1MiB 정의를200회 호출하는 문서를 native에서 열고 call0격리→Hide로 빈 화면→Undo,
내부 코드14문자 편집→Undo, 실제 검사 시작→취소를 수행했다. 빈 화면에서도 격리 종료와
숨긴 항목201개에 접근할 수 있었고 취소 뒤 원문은 남았다.
실제 [취소 뒤 export](ui-shared-200-after-cancel.glean.json)는1,115,533bytes이며200calls,
1module, full body1개, 본문 hash `8b8ad61bdda3b1f598f3dab08f7adfa11246133f7ed0838f52798f7bc2426eab`
가 원래 fixture와 정확히 같다. [독립 대조](shared-cancel-independent-results.json).

이 native 근거와 같은 history benchmark의 heap+1.23MB/RSS+14.47MB/commit median2.65ms,
quota 및 HTTP 음성 대조를 결합해 B06을 PASS로 갱신했다. native 도구 전체 load836ms,
isolate747ms, code edit4832ms는 accessibility 직렬화를 포함해 브라우저 단독 지연으로
표현하지 않는다. 이전 memory baseline full snapshot을 덮어쓴 감사 기록 실수와 제한된
전사본임은 AUDIT-04에 그대로 명시했다.

## 화면 상태와 새 수리

root의 실제 child 복구는 호출A n=3의 내부 격리1target/hidden1을 명시 재개하고 부모root의
A만 보기를 복원했다. 이후 호출B n=5에 A의 숨김/격리가 섞이지 않았다. child Undo는
현재middle 탐색 경로를 유지하고 부모로 돌아오면 원래 선택을 복원했다.
[실제 callback 복구](isolation-parent-history-latest-results.json)와 canonical trail 음성 대조가
같은 조건을 통과해 H05/V04/V09/S03을 PASS로 갱신했다.

wire 취소 후 후보 tooltip이 남던 E05는 같은 actual typed output→cancelInteraction 재현에서
기본 타입 tooltip으로 돌아왔다. root native Esc도 동일했다.
[E05 재검사](wire-cancel-tooltip-retest-results.json).
격리 중 Map 생성 노드가 숨던 E06은 같은 callback에서 createdVisible=true 및 frozen frame의
명시 대상에 추가되는 것으로 수리됐다. [E06 재검사](isolation-batch-new-retest-results.json).
새 같은-scope 복사/붙여넣기와 source 직접 관계 확장은 아직 별도의 수락을 진행 중이다.

Agent3의 actual raw-byte app/editor/history/draft/export 대조는 BOM/CRLF/Unicode 원문과
invalidUTF8를 손실 없이 보존한다. 편집한 current만 바뀌고 original은 남는다. 원본 hash의
형식상 정상인 위조도 실제 bytes에서 hash를 다시 계산하고 불일치 경고를 보여준다.
[바이트 재검사](design-audit-source-bytes-retest.json). I08을 PASS로 갱신했다.

현재 [매트릭스](REQUIREMENTS.md)는31 PASS/1 PARTIAL/5 DEFERRED다.32개 첫 릴리스 중
31개 수락이며 나머지1개와 마지막 제품 변경 이후 관련 전체 테스트·빌드·smoke는 남는다.
H06–09/S04 P2/P3 다섯 조건과 I03/I07의 tactic 내부 후속 부분은 미지원/유보이며 완료로
세지 않는다.

추가 독립 [copy-paste-results.json](copy-paste-results.json)은 actual 메뉴에서 같은 scope 두 블록의 복사/격리중붙여넣기/즉시표시/내부wire remap/외부wire보존/DocumentHistory UndoRedo, 다른scope와한도초과 원자거부를 통과했다. [direct-expansion-results.json](direct-expansion-results.json)은 actual 입력/사용처 명령의 개수·수동숨김 explicit 추가·직접범위만추가·semantic/realwire/HTTP불변을 통과했다. source-reference 모델의 외부이름은 미확정목록이며 가짜wire를 만들지 않는다. 새 native copy 경로와 실제 source 카드 연결은 아직 따로 확인한다.

root의 π311줄 native 파일블록은14,049bytes 원본 hash를 보존하고 분석/검증 전에 미검증으로 표시했다.94ms는 tool/AX포함 단일 측정이므로 제안목표의 반복median/p95 달성으로 확대하지 않는다. 이후원본 actual kernel+표준공리 검사도 성공했다. I01은 PASS이며 I06 잘못된종결·숨김/접기 수락은 계속 남는다.

최신 native 복사/붙여넣기의 proof-only격리→paste즉시표시→CmdZ원래target1 복구와 actual3대조를 합쳐 V06을 PASS로 갱신했다. source/graph 두 native 직접확장 경로와 [source-expansion-retest-results.json](source-expansion-retest-results.json)의 actual metadata를소비하는목록/범례/과거자료미확정 표시를 합쳐 V10/I07의 P1 부분도 PASS다. 같은 실험으로 과거의존버튼 현재파일오표시를 저장된분석 label로 수리한것을 확인했다. source/history [source-history-results.json](source-history-results.json) 네 actual app callback 대조는 원문·frame·선택을 보존하며 same/change/missing/late환경에서 올바른 resultreuse를 확인했다. 별도store session은 명시 재개 전 비활성이며 일반문서 frames없음, 사라진target 거부다. 해당환경/검증결과는 controlled response이며 native커널판정을 대신하지 않는다.

후속 Agent3 actual app 통합검사에서 처음 review없는문서의 clipboard identity가 app이 붙인 reviewID와 바뀌어 같은문서 Undo 후 paste를 거부하는 새결함을 발견했다. 기본native copy/paste와 순수모델·editor callback의PASS를 삭제하지 않지만 최종 V06은 해당통합수리와같은재현이 닫힐 때까지 PARTIAL로 되돌렸다.

E07: sourceFileView의손상표현은normalize후presentationRecovery에원본을exact보관하지만 공통 app 원본다운로드handler가 top-level만읽어 다운로드가0회였다. [실패](source-presentation-recovery-initial-results.json), actualcallback exit1. Agent3의 historicalcache late 설치조회 failure catch누락도 확정되어 I05/S02는 수리와같은재현재검사까지 PARTIAL로보류했다.

최종같은재현에서 source 원본표현저장 E07 emitted1/exactmarker PASS([source-presentation-recovery-retest-results.json](source-presentation-recovery-retest-results.json)), clipboard첫open/controllerID/Undo/paste 통합PASS([design-audit-copy-controller-retest.json](design-audit-copy-controller-retest.json)), historicallatefailure폐기PASS([design-audit-source-view-lifecycle-retest.json](design-audit-source-view-lifecycle-retest.json))로 각각닫았다. UI22 native actualL4:C20→caret69→복귀가canvas100%/manualhidden1/outsideerror1/frame1/fullscreen/globalerror를정확복원한다([화면](ui-diagnostic-return-fixed.jpg)). H02/V05/B03/V06/I05/S02를 PASS로 갱신했다. 마지막I06 화면조작과π판정독립 수락 및 최종회귀게이트는 남는다.

새 optional-cache import검사에서 imports:42인 문서를validateDocument가허용하고 loadCache에서TypeError가발생했다([design-audit-source-view-cache-corruption-results.json](design-audit-source-view-cache-corruption-results.json)). Agent3가 캐시선택필드검사를소유해 구현자에게수리요청했고 S02는 그수리까지 다시PARTIAL이다. 이미닫은nested 원본다운로드·v1/v2/v3native수락은 유지한다.

I06최신 native: 원본π actualkernel+표준공리3개PASS와hn잘못된종결 actual타입거부를 확인했고, 변형source캡슐group접기·Hide후에도전역error/동일진단이유지됐다. inline진단은원문L309:C3/caret13503으로editor visible/focus를복원했다([숨김](ui-pi-hidden-error.jpg), [이동](ui-pi-source-error-jump.jpg)). 별도actualapp패널 callback Unicode/LSP변환2건도PASS([좌표](source-diagnostic-jump-initial-results.json)). 최초실험때수리가이미반영되어 이좌표artifact는처음부터PASS이며 실패실험을만들었다고 주장하지않는다.

long4뒤source_check.py는optionalmetadata exactowner Name.mkSimple두곳만 바뀌었다. compiler/graph_jobs/limits는동일hash다. Agent3최신actualCases+generated-looking userlocal 대조는strict/kernelAccepted/공리없음/분기타입및usedlocals를확인했다. [영향범위와실제대조](long-product-affected-m15-results.json). 이작은actual을long4다시실행한것으로세지않으며 unchangedkernel/type/axiom경로의long성공과바뀐metadata회귀를구별한다.

최종후속수락은 [AUDIT-06.md](AUDIT-06.md)에정리했다. 마지막cache/wrapper/falsy원본경계도Agent3같은actualcallback에서닫혔고 전체32개첫릴리스기능수락, Python166/JS211/build/Smoke게이트가통과했다. 이회차의이전실패와시점별판정은계속보존한다.
