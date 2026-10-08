# 블록 계층 최종 수락 감사

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

[고정 계획](../2026-10-07-block-hierarchy-import/PLAN.md)의 37개 조건 중 첫 릴리스 범위인
P0-A/B/C/D와 P1의 **32개 기능 수락이 통과**했다. P2의 H06–H09와 P3의 S04는 다섯 후속
조건으로 남는다. I03/I07 역시 P1의 선언 탐색·원문 보존·관계 구별만 수락했으며 tactic 내부
자동 전환과 목표 변화선은 P3 미지원이다. 전체 37개 구현 완료를 뜻하지 않는다.

[전체 추적 매트릭스](REQUIREMENTS.md)는 **32 PASS / 5 DEFERRED**다. 마지막 안정 제품의
Lake build와 Lean Smoke.lean, 실제 소스 통합을 포함한 전체 Python 166개와 web JS 211개
검사가 모두 통과했다. 첫 릴리스 수락과 회귀 게이트를 완료했다.

## 근거의 범위

Agent 1이 제품을 구현하고, Agent 2가 독립 요구사항·이벤트·저장·실제 Lean 경로를 검사했다.
Agent 3가 설계·지역 문맥·출처·비동기 순서·손상 복구를 검사했고 root가 실제 브라우저에서
선택·입력·연결·메뉴·파일 가져오기·다운로드·새로고침·Undo·전체화면을 조작했다.
감사자는 제품 코드를 수정하지 않았으며 추가 에이전트를 만들지 않았다.

이 보고서는 actual kernel과 command-state 분석, 실제 제품 callback의 controlled transport,
pure 모델, native 다운로드를 구별한다. 선언 분석의 analyzed 상태를 verified로 세지 않으며
과거 분석의 이름·범위를 현재 소스의 사실처럼 표시하지 않는다. 테스트 제목만으로 수락하지
않고 실제 입력·출력·상태와 양성/음성 대조를 확인했다.

## 핵심 기능 수락

| 범위 | 확인한 실제 동작과 독립 대조 |
| --- | --- |
| 숨김·중첩·격리 | A/B 호출별 인자 3/5와 표시 상태를 분리하고, 부모/자식 격리와 명시 세션 재개를 복원한다. 수동 Hide와 격리는 다른 이력이며 Undo는 현재 탐색을 유지한다. 3단 컨테이너 이동·접기·숨김·export/reimport에서 실제 endpoint와 생성 증명이 같다. |
| 혼합 본문 작성 | native 메뉴로 graph/code/graph/code 계층을 만들고 공개 포트를 연결한 실제 전체 증명이 kernel/목표/공리 검사를 통과했다. private 자식 포트 우회와 Cases 형제 가정의 범위 탈출은 원자적으로 거부한다. |
| 긴 코드 | 실제 제품 64KiB급과 1MiB급 정상 본문은 kernel+예상 목표+공리 없음으로 통과한다. 잘못된 마지막 단계는 실제 타입 오류로 거부하며 본문 1193:3과 10281:3에 대응한다. native 검색·행 이동·저장·새로고침·편집 Undo·취소는 원문 hash를 보존한다. |
| 오류 탐색 | 3단 접힘·수동 숨김·격리 밖 실제 오류는 Unicode caret69에 editor를 열고, 복귀 시 canvas/viewport/숨김/격리/전역 오류를 정확히 복원한다. source 파일 오류도 원문 L309:3/caret13503으로 열린다. |
| 파일과 선언 | π 311줄 원문 파일 블록을 즉시 열고 정확한 바이트 hash를 유지한다. 현재 파일의 namespace/private/macro/instance/부분 오류 뒤 선언을 실제 Lean command-state에서 읽는다. source 상수 관계와 port wire, 커서 목표 관측은 구별한다. |
| 규모와 재사용 | 실제 1,000개 선언 분석은 10.614초였고 UI는 50→100→검색 1개로 표시한다. 설치된 Nat.add_zero의 별도 출처/import를 조회해 실제 참조 그래프를 kernel로 검사했다. 편집 그래프의 256노드/512간선 한도는 유지한다. |
| 원문·복구·출처 | BOM/CRLF/Unicode와 invalidUTF8 원본 바이트를 보존한다. 새 소스/프로젝트/파일 뒤 옛 분석 성공·실패 응답을 버린다. 손상 표현/cache는 경고하고 원문·설정 원본을 보존하며 0/false/null 원본 다운로드도 정확하다. |

이 표의 기능별 전체 근거와 남은 지원 범위는 매트릭스 행에 연결돼 있다. 다음은 마지막
수리에서 확인한 재현 가능한 결과다.

- [장문 실제 네 대조](long-product-retest-results.json): 64KiB 정상 23.922초, 오류 7.884초;
  1MiB 정상 37.238초, 오류 25.867초. 두 정상 결과의 verified/kernelAccepted는 true이고
  공리 목록은 비어 있다. 오류는 timeout이 아니라 실제 True 대 n+0=n 불일치다.
- [M15 변경 영향](long-product-affected-m15-results.json): 장문 이후 변경은 optional metadata의
  exact owner 키를 Name.mkSimple로 읽는 두 곳이다. 생성 증명/목표/커널/공리 경로는 유지됐다.
  Agent3 최신 실제 Cases와 generated-looking user local 대조가 변경 범위를 덮었다. 이를
  장문 네 건을 다시 실행한 것으로 세지 않는다.
- [최종 1,000개 UI callback](declarations-1000-ui-final-results.json),
  [직접 source 관계](source-expansion-final-results.json),
  [source Undo/환경 네 대조](source-history-final-results.json): 이전 독립 actual metadata가
  마지막 guard를 통과하며 실제 메뉴/저장/비동기 상태를 유지한다. 이 UI callback의 도구
  transport와 환경 응답은 controlled이며 새 kernel 실행을 주장하지 않는다.
- [실제 공유 200호출 export](shared-cancel-independent-results.json): 취소와 Undo 뒤 1MiB
  본문 hash가 같고, 200호출/1정의/full body1개다. 이 native 시험은 200호출의 검증 성공을
  주장하지 않는다. history 메모리·HTTP/quota 음성 대조는 AUDIT-04/05에 별도로 있다.
- [source 손상 복구](design-audit-falsy-source-recovery-retest.json),
  [cache/lifecycle](design-audit-source-view-lifecycle-retest.json),
  [clipboard 통합](design-audit-copy-controller-retest.json): imported cache TypeError,
  과거 조회의 늦은 failure, 첫 reviewID와 Undo 뒤 같은 문서 붙여넣기 거부, falsy 원본의
  다운로드 누락은 같은 실제 callback 재현으로 닫혔다.
- [native 진단 복귀](ui-diagnostic-return-fixed.jpg),
  [π 숨김 오류](ui-pi-hidden-error.jpg), [π 원문 이동](ui-pi-source-error-jump.jpg): 마지막 UI
  관찰을 Agent3의 실제 body metadata/선택 범위 대조와 결합했다.

## 마지막 검사 게이트

| 검사 | 현재 결과 |
| --- | --- |
| GLEAN Lake build | root 확인 PASS, 4 jobs |
| tests/Smoke.lean | root 확인 PASS, exit 0 |
| GLEAN_SOURCE_INTEGRATION=1 전체 Python 테스트 | PASS, 166개, 126.721초, OK/exit 0, [로그](final-python-tests.log) |
| bundled Node 전체 web 테스트 | PASS, 211/211, fail 0/skipped 0, 2.148초/exit 0, [로그](final-js-tests.log) |

명령 PATH에 없는 bare node 호출은 127로 실패해 bundled Node로 다시 시작했다. 이를 제품
회귀 실패로 세지 않는다. 실제 전체 테스트 결과는 해당 bundled 명령의 완료 로그로만
판정했다. Agent 2가 두 최종 로그의 완료 수치와 오류 없는 종료를 확인했으며, 최종 안정
제품 47개 파일 hash는 검사 전후 그대로였다. [hash/명령 기록](final-product-hashes.json).
root의 git diff --check도 exit 0이고 마지막 혼합 그래프 native 검증은 strict/kernel/공리 없음,
browser errors 빈 목록으로 완료됐다. [최종 실제 화면](ui-final-mixed-graph.jpg).

기능 수락과 빌드/회귀 완료를 구별하며, 후속 추출·독립 정의 복제·의존 문맥 폐쇄·tactic 내부
탐색은 계획에 남긴다. 현재 기능은 수동 code/graph 계층과 실제 선언 기반 탐색을 지원한다.
