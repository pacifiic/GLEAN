# 블록 계층 세 번째 감사 — 장문 실제 증명·세션 복구 범위

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

제품 장문 검사 전체 경로가 완성되기 전에 fixture 자체의 실제 Lean 성립성과 비용을
독립 확인했다. 이는 editor/JSON/HTTP/생성 wrapper/expected signature/LSP를 통한
B01 완료와 구별한다. 새 세션 복구의 실제 callback과 root native 수락도 연결한다.

## 장문 fixture의 실제 Lean 대조

고정 도구는 Lean 4.34.1, arm64-apple-darwin24.6.0,
commit `5045d0056413266e57c625dcd7c365b10e377c52` Release다.
명령은 `./glean/scripts/lake env lean <absolute audit source>`이며 source/로그/결과는
모두 이 감사 폴더에 남긴다. 두 본문은 실제 Nat 계산과 지역 보조증명을 포함하고
주석·공백 padding 자료가 아니다.

| 입력 | 실제 결과 | 자원·시간 | 근거 |
| --- | --- | --- | --- |
| 65,530bytes/1,193행, 마지막 `exact Nat.add_zero n` | compile exit0, 공리 없음 | 기본 설정 2.57초 | [longbody-64k-standalone-results.json](longbody-64k-standalone-results.json) |
| 같은 본문 마지막 `exact True.intro` | exit1, True 대 n+0=n 타입 불일치, L1203:2 | 명시 maxRecDepth20000/maxHeartbeats2000000, 2.33초 | [audit-longbody-64k-bad.log](audit-longbody-64k-bad.log) |
| 1,048,483bytes/10,281행, 마지막 `exact Nat.add_zero n` | compile exit0, 공리 없음 | 기본 설정 22.85초 | [longbody-1m-standalone-results.json](longbody-1m-standalone-results.json) |

64KiB 양성은 명시 자원 확장 설정으로 먼저 통과한 뒤 기본 설정으로도 확인했다. 기본
설정 통과를 보고하므로 확장 옵션이 필수라는 주장에 쓰지 않는다. 잘못된 증명을 Lean이
오류를 남긴 채 sorryAx로 복구한 로그도 있다. 이 exit1/sorryAx 결과를 검증 성공으로
표시하지 않는다. 한 번의 측정이므로 median/p95 성능이라고 부르지 않는다.

구현 중 body1MiB/source8MiB/document·request24MiB 한도가 새 공통 파일에 도입됐다.
아직 실제 GraphCheckService의 두 장문 양성/잘못된 마지막 단계, 취소/시간 제한, 전체
저장/복구와 LSP 경로를 이 회차에서 통과했다고 표시하지 않는다. 생성 header/fragment
진단 배치는 Agent 3과 구현자가 실제 작은 오류 대조를 진행 중이다.

P1 규모 입력 [fixtures/declarations-1000.lean](fixtures/declarations-1000.lean)도 준비했다.
65,203bytes이며 namespace 안 Nat 보조정리 1,000개다. standalone Lean compile exit0을
확인했지만 [expected manifest](fixtures/declarations-1000.expected.json)는 기대 이름·타입·
직접 의존 목록이다. 현재 파일 실제 adapter 출력으로 확인하기 전에는 실제 인덱스의
1,000개 탐색 성공으로 세지 않는다.

## 격리 Undo와 명시적 복구

[audit_isolation_recovery.mjs](audit_isolation_recovery.mjs)는 actual typed editor 이벤트,
actual app navigateHistory callback, 실제 별도 store/validator를 직접 호출했다.
controlled DOM/fetch를 사용해 UI/커널 결과와 구별한다. 첫 세 대조 exit0:

- 격리 중 Hide를 Undo하면 원래 숨김 문서 편집만 취소되고 targets/stage/viewport가 유지된다.
- 일반 open과 recovery offer만으로 격리는 활성화되지 않는다. 실제 복원 버튼 callback 뒤에만 해당 frame이 나타난다.
- 다른 documentId, 사라진 target, malformed viewport를 거부하고 ordinary document를 바꾸지 않는다.

[isolation-recovery-results.json](isolation-recovery-results.json)에 제품 hash와 실제 값을
보존했다. root native에서도 Hide join→격리 active 상태에서 Cmd+Z가 join을 복구하면서
callA+join depth1/target2와 five 수동 숨김을 유지했다. reload 직후에는 활성 격리 없이
복원 버튼만 보였고 explicit 클릭 뒤 원래 root frame이 돌아왔다. 일반 export는 앞 회차의
실제 파일 검사에서 isolate가 제외됨을 확인했다.

범위를 child로 늘린 독립 대조에서 결함이 추가로 나타났다. callA 내부 module/outer의
n_in을 격리한 session을 새로 열고 복원하면 frame은 내부에 남지만 visible path/trail/
selection/viewport는 root/[]/null/(20,20)이었다. 현재 화면에 격리 상태가 나타나지 않아
이전 탐색 맥락이 복구되지 않는다. PLAN L90/L142의 별도 탐색 복구 gate로 구현자/root에
수리를 요청했다. [isolation-recovery-navigation-results.json](isolation-recovery-navigation-results.json),
exit1. root canvas 복원의 양성과 child 복원의 실패를 구별하며 V09/S03 전체 완료는
당시 보류했다. 구현자가 별도 navigation snapshot을 추가한 뒤 동일 child 재현에서
path/trail/selection/viewport가 정확히 복원됐다. [isolation-recovery-navigation-retest-results.json](isolation-recovery-navigation-retest-results.json), exit0.
위조 occurrence trail chain/final scope guard는 Agent 3이 M09로 따로
발견·수리·독립 재검사했으며 해당 근거를 재사용한다.

이어 child scope에서 Hide→actual app Undo를 실행하면 부모로 돌아갈 navigation stack은
여전히 소실되는 추가 결함을 확인했다. 현재 child scope는 맞지만 `상위로 돌아가기`
버튼이 사라져 이전 부모 선택/viewport를 복원하지 못한다.
[isolation-parent-history-initial-results.json](isolation-parent-history-initial-results.json),
exit1(다른 복구 대조는 통과). 구현자/root에 별도 parent return 이력 수리를 요청했다.
V09/S03의 전체 완료는 이 후속 경로까지 확인한 뒤 갱신한다.

## 손상 표현 native 수락

root는 [fixtures/corrupt-presentation.glean.json](fixtures/corrupt-presentation.glean.json)을
native import로 열었다. 별도 노란 warning과 미검증 상태가 유지되고 원래5node/4wire가
남았다. `원본 표현 저장`으로 실제 생성된 [ui-presentation-original.json](ui-presentation-original.json)은
fixture.presentation과 original marker까지 deep equality가 맞았다. 129bytes, SHA-256
`86da1317eadaf11e7933f976669226316fd801fcee3d61102cbd647c7aa25a0b`.
[ui-presentation-recovery.jpg](ui-presentation-recovery.jpg).

S02의 새로운 v3 손상 진단·원본 복구 UI 경로가 확인됐다. root는 이어 v1 native import의
원래6node/compose 목표/no warning/미검증을 확인했다. v2 legacy-group의 세 구성원,
공개 apply1 경계와 다른3node를 확인하고 펼치기로 전체6node를 복구했다. 이 과정에서도
미검증 상태였다. 감사자가 최신 제품 hash로 v1/v2/v3 model/file/DraftStore/Undo의6개
대조와 occurrence 손상/유효256/257의4개 대조를 다시 실행해 모두 통과했다.
[p0-compatibility-latest-results.json](p0-compatibility-latest-results.json),
[occurrence-corruption-latest-results.json](occurrence-corruption-latest-results.json).
관련 presentation/history/isolation recovery 30tests도 exit0이다. S02는 PASS로 갱신했다.
관련 전체 검사/빌드는 마지막 제품 변경 뒤 다시 확인해야 하며, P2/P3 유보를 완료로
바꾸지 않는다.

## 직접 작성한 혼합 그래프의 실제 수락

root는 baseline JSON만 재활용하지 않고 native 메뉴로 graph/code/graph/code 네 정의를
직접 추가했다. 공개 소켓을 수동으로 연결하고 code grandchild를 `x + 0`으로 고친 뒤
원래 root three→new graph parent→callA 경로에 넣었다. 전체 root 목표는 actual strict
커널 재검사/의도 타입/공리 없음 검사를 통과했다.

실제 내보낸 [ui-authored-mixed.glean.json](ui-authored-mixed.glean.json)은15,098bytes,
SHA-256 `3cdfe450c394163020fcb53931e9622a6c5ec84c1cf8bd493b071a70f0fe77a2`다.
감사자는 실제 export의7modules, 네 blockKind, public input→code child→graph child→result,
graph child→code grandchild→result, root insertion과 raw body `x + 0`를 직접 대조했다.
현재 compiler는 ready, generated source4232bytes다.
[authored-mixed-independent-results.json](authored-mixed-independent-results.json),
[ui-authored-mixed-verified.jpg](ui-authored-mixed-verified.jpg). B02는 PASS로 갱신했다.
이 small mixed 수락이 장문 B01/B03/B06 완료를 뜻하지 않는다.
