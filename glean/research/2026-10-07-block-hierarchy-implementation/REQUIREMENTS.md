# 블록 계층·가져오기 독립 수락 매트릭스

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

이 문서는 [고정 계획](../2026-10-07-block-hierarchy-import/PLAN.md) 전체의 37개 수락 시나리오를 그대로 추적한다. Agent 1은 제품 구현, Agent 2는 요구사항·독립 기능 감사, Agent 3은 설계/코드 감사, root는 실제 브라우저 수락을 맡는다. 감사자는 제품 코드를 수정하지 않는다.

계획 파일 SHA-256: `ac81c17f3bb629c0f66a4f52763261b1ab7f446f48f588208f5870d9240ac6b3` (501행). 계획이 바뀌면 새 기준과 이유를 기록하며 기존 요구를 조용히 삭제하지 않는다. 아래 현재 판정은 실제 제품/독립 callback/native 근거를 합친 감사 상태다. 각 배치의 원래 실패 산출물도 보존한다.

## 범위와 판정

- 첫 릴리스는 **P0-A/B/C/D + P1**, 아래 32개 시나리오의 해당 부분이 필수다. 숨김·격리뿐 아니라 직접 긴 코드 작성, 편집 가능한 3단 혼합 graph/code 구성과 현재 파일의 실제 Lean 선언 분석을 포함한다.
- H06–H09는 P2, S04는 P3로 계획에 남긴다. P2/P3의 미지원/유보는 완료가 아니다. I03/I07의 P1 선언 탐색과 원문 보존 부분은 첫 릴리스 필수이고 P3 tactic 내부/지원 구간 전환은 후속으로 구별한다.
- **PASS**는 사용자 접근 경로, 실제 입력/데이터 경로, 양성·음성 대조, 요구된 저장/Undo/복구와 수치 근거가 모두 확인된 상태다. **PARTIAL**은 일부 기반만 확인한 상태, **FAIL**은 핵심 기능 부재 또는 실제 요구 위반이다. **DEFERRED**는 계획상 후속 단계이며 현재 미지원이다. 거부 메시지를 보여주는 것만으로 해당 기능 전체를 PASS 주지 않는다.
- 제품 테스트의 제목, 구현자의 완료 주장, 모형 JSON을 실제 Lean 선언/커널 결과로 간주하지 않는다. 정규식 개요는 추정 목록이다. 목표 관측은 전체 검증 성공과 구별한다.
- 한도가 늘어난 편집기만으로 B01을 통과하지 않는다. 64KiB급/1MiB급 실제 계산·지역 보조증명 fixture의 전체 저장·전달·검사 경로와 잘못된 마지막 단계, 취소/한도 때 원문 보존이 필요하다.
- 테스트/하네스의 controlled response는 비동기 순서·이벤트 대조에만 사용하고 actual Lean/LSP 근거와 구분한다. root만 브라우저를 조작하며 구체적 행동/스크린샷/fixture를 제공한다.
- 마지막 제품 변경 이후 관련 전체 검사와 GLEAN 빌드/Lean smoke가 통과해야 릴리스 완료다. 기존 Grasshopper 15개 기능 PASS는 회귀 기준이며 새 37개 완료로 바꾸어 세지 않는다.

## 전체 37개 추적 표

| ID | 계획 단계 | 릴리스 범위 | 시험 | 고정 통과 조건 | 현재 판정 | 근거/남은 검사 |
| --- | --- | --- | --- | --- | --- | --- |
| H01 | P0 | 첫 릴리스 필수 | A→B→C에서 B 숨김 | 실제 간선·생성 코드·의미 해시 동일, 가짜 A→C 증명선 없음 | PASS | root native 직접 중립경계/원래 endpoint 선 유지, model A→숨긴B→C 가짜직결 없음, actual editor Hide 의미key/real edge/HTTP 불변. 실제3단 export 전후 generatedCode 동일 및 native 표시-only cached검증 재사용 확인. |
| H02 | P0 | 첫 릴리스 필수 | 숨긴 오류·최종 목표의 진단 클릭 | 전역 상태 유지, 조상을 임시로 펼쳐 읽을 수 있는 배율로 이동 | PASS | native 실제3단접힘+숨김+격리밖 bodyL4:C20 진단→100%/Unicodecaret69/focus true, 전역error유지. UI22 수리 후 임시 공개 복귀는 editor닫고 canvas/hidden1/outsideerror1/rootisolate/fullscreen exact 복원. [native](ui-diagnostic-return-fixed.jpg), actualsmall·longrange대조 결합. |
| H03 | P0 | 첫 릴리스 필수 | 3단 컨테이너 접기·숨김·이동 후 Undo/재열기 | 실제 endpoint, 숨김 설정, 배치·탐색 상태 일관성 | PASS | root native3단 생성/drag/Hide/Undo/Redo/export/reimport/expand, 실제 export5nodes(+155,+86)/goal/e1..e5 및 generatedCode 동일. UI19 최신 세 header42px 분리 native 확인. [독립 export](three-containers-independent-results.json). |
| H04 | P0 | 첫 릴리스 필수 | Cases 형제 분기 간 포함·연결 이동 | 시각 조작으로 지역 가정이 탈출하지 않음 | PASS | Agent3 actual Cases 범위/형제 지역가정 positive-negative, presentation 전후 생성코드 동일 및 외부 연결 원자적 거부. 최신 branch metadata actual23.275초 PASS. [실제 결과](design-audit-cases-metadata-retest.json), [경계 감사](design-audit-boundaries.md). |
| H05 | P0 | 첫 릴리스 필수 | 한 정의의 호출 A/B에서 서로 다른 인자로 내부 탐색 | 일반 정의와 호출별 인자를 구별, A의 타입·선택·숨김이 B에 잘못 적용되지 않음 | PASS | root native 호출A binding3/B binding5, 숨김·선택·격리 분리와3단 부모 복귀. 일반 정의/공유 편집 별도 표시. 동일 이름 인자 actual callback 및 occurrence identity 음성 대조 PASS. [인자](call-arguments-retest-results.json). |
| H06 | P2 | 후속 P2 | 공유 정의 수정, 이후 독립 정의로 복제 | 공유 시 모든 관련 호출 재검사, 독립 복제 후 원본은 의미 불변 | DEFERRED | P2 범위; 공유 영향 호출은 기존 기반이지만 독립 정의 복제/중첩 공유 선택 미지원. |
| H07 | P2 | 후속 P2 | `n : Nat`, `i : Fin n`을 쓰는 조각 추출 | n이 먼저 매개변수화, 실제 타입 검사, 빠진 지역 문맥 진단 | DEFERRED | P2-A 의존 문맥 폐쇄 추출 미지원. 기존 v1/v2 추출은 대체 근거가 아님. |
| H08 | P2 | 후속 P2 | 외부로 나갔다 다시 들어오는 선택, 분기 증인 추출 | 호출 치환 순환 및 허용되지 않은 범위 탈출 거부, 원본 유지 | DEFERRED | P2-A 호출 치환 순환·분기 증인 추출 거부와 원자적 rollback 미구현. |
| H09 | P2 | 후속 P2 | Nat 결과를 같은 타입의 다른 값으로 바꾸는 잘못된 추출 | P2-A에서는 데이터 반환 추출을 거부; P2-B에서는 의미 보존 검사로 거부 | DEFERRED | P2-A 단일 Prop 게이트/P2-B 값 의미 보존 추출 미지원; 같은 타입만으로 완료 불가. |
| V01 | P0-A | 첫 릴리스 필수 | A/B/C 중 A·C를 선택만 보기 | B 카드 숨김, 선택 변경만으로 대상 불변, 실제 간선·소스·검사 범위 동일 | PASS | root native title Shift/우클릭으로 callA+join 선택·격리, 직접경계2/real edge3·숨김끼리 선 생략. actual typed visible카드 선택변경 뒤 frozen targets 불변, 의미key/realedges/검사요청0 확인. |
| V02 | P0-A | 첫 릴리스 필수 | 수동 숨김 → 격리 → 추가 Hide/Show → 격리 종료 | 기존 및 격리 중 수동 변경 보존, 진입 시 스냅샷으로 덮어쓰지 않음 | PASS | root native five 수동숨김→callA+join격리→추가 joinHide→종료 후 both manual 유지, active CmdZ는 join만복원. 독립 manual/frames 분리·새Hide override 대조 통과. |
| V03 | P0-A | 첫 릴리스 필수 | 두 단계 격리, 같은 선택 반복, 한 단계/전체 종료 | 중복 프레임 없음, 이전 대상/viewport 복귀, 현재 캔버스만 종료 | PASS | root native 같은대상반복 무중복·2단계 back/exit의 target counts 수락. 별도 actual 모델은 frame별 viewport 복귀/현재scope-only exit 및 A/B nested 분리 확인. |
| V04 | P0-A/B | 첫 릴리스 필수 | 호출 A 격리 후 내부 탐색·자식 격리·부모 복귀·호출 B 열기 | 부모/자식/호출별 상태 분리, 컨테이너 선택은 유효한 실제 대상에 매핑 | PASS | root native A격리→A내부→자식격리→부모 root 복귀→B내부 hidden0/binding5. child 복구와 정식 occurrence 경로 대조, semantic container-to-node mapping PASS. [복구](isolation-parent-history-latest-results.json). |
| V05 | P0-A | 첫 릴리스 필수 | 격리 밖 오류 클릭 후 복귀 | 임시 표시와 정확한 위치 이동, 원래 격리 보존, 경계 연결·전역 오류 요약 유지 | PASS | native 격리밖 실제진단 exactUnicodecaret69→임시editor→복귀는 codeTarget종료/canvas100%/hidden1/outsideerror1/frame1/globalerror/fullscreen exact. actual sourceMap/range/상태모델 음성·복귀 대조와 결합. [native](ui-diagnostic-return-fixed.jpg). |
| V06 | P0-A | 첫 릴리스 필수 | 선택 없음·모든 대상 삭제·생성/붙여넣기·편집 Undo | 빈 선택 무동작, 빈 단계 안전 종료, 새 블록 즉시 표시와 삭제 ID 정리 | PASS | native proof격리copy/paste 즉시target2/Undo target1; 독립same-scope/internalwire/다른scope/limits원자성 PASS. Agent3 actualapp reviewID첫open/Undo동일ID/paste/새문서거부 통합수리 PASS. [editor](copy-paste-results.json), [app](design-audit-copy-controller-retest.json). |
| V07 | P0-A | 첫 릴리스 필수 | 숨긴 목록에서 추가→다시 Hide, 수동 숨김 해제/전부 표시 | 추가 항목은 이전 필터에 숨지 않지만 최신 Hide는 임시 표시를 해제, 전부 숨김 시 탈출 UI 유지, 수동 숨김·격리 종료의 효과 구별 | PASS | root native 수동숨긴five explicit add→다시Hide, blank200calls격리에서 종료/숨긴201 접근 가능. actual 전부표시/빈화면/Undo5controls PASS. [명령](isolation-command-results.json). |
| V08 | P0-A | 첫 릴리스 필수 | 코드 편집기·미완성 연결·전체화면에서 Esc, 키보드 격리 종료 | 작업 취소 우선순위 유지, 이중 해제 없음, 상태 막대와 종료에 항상 접근 가능 | PASS | root native wireEsc는 격리/fullscreen 유지, codeEsc→canvas/fullscreen 유지, pickerEsc만 닫힘, Enter 격리종료 fullscreen 유지. E05 후보class/tooltip도 같은 실제 callback+native에서 복원. [재검사](wire-cancel-tooltip-retest-results.json). |
| V09 | P0-A | 첫 릴리스 필수 | 격리 중 저장/재열기·세션 복구·Ctrl+Z | 일반 파일은 활성 격리 없이 열림, 복구는 명시적 재개, 격리가 문서 Undo를 소비하지 않음 | PASS | native 일반export 격리 제외/명시복원/active-isolate Undo, childreload exact A경로·1target·hidden1→parentrootAonly 복귀. actual path/trail/selectedIds/returnStack/view exact 및 canonical mismatch 거부. [독립](isolation-parent-history-latest-results.json). |
| V10 | P1 | 첫 릴리스 필수 | 선택+입력/사용처 격리, 수동 숨긴 의존 블록, 미확정 소스 참조 | 관계 종류·추가 개수·미확정 표시, 명시적 확장, 임의의 증명 와이어 생성 없음 | PASS | root native graph/source 두경로 입력0·manualhidden1→explicitadd→exit manual보존/users직접범위. actual graph/source callbacks 관계종류·counts·외부Nat목록·본문미확정/과거분석미확정·0proofedges·semantic불변. [graph](direct-expansion-results.json), [source](source-expansion-retest-results.json). |
| B01 | P0-D | 첫 릴리스 필수 | 새 코드 블록에 기존 8KiB를 넘는 실제 Lean 본문 직접 입력/붙여넣기 | 64KiB급과 1MiB급의 원문 저장·복구·편집·검사 경로 확인, 정상 fixture 실제 검사와 잘못된 마지막 단계 거부 | PASS | 독립 actual product64KiB/1MiB 정상 strict kernel+expectedgoal+공리없음, wrong-ending 실제 invalid exact1193:3/10281:3. native1MiB 입력/행이동/검색/저장/새로고침/200calls 취소 exact body. [4건](long-product-retest-results.json), [원문](native-long-body-independent-results.json). |
| B02 | P0-B/D | 첫 릴리스 필수 | 그래프 부모 안에 code 자식과 graph 자식, 그 안에 code 손자를 연결해 3단 이상 구성 | 내부 실제 연결이 부모 입력/결과로 이어지고 전체 목표를 Lean으로 검사 | PASS | root 실제 메뉴로 graph/code/graph/code 4정의 작성, 공개 소켓 수동 연결, grandchild x+0 편집, 원래 증명에 삽입해 strict 커널+목표+공리 없음 통과. 실제 15,098bytes export의 7modules/모든 연결/현재 compiler ready 독립 확인. |
| B03 | P0-D | 첫 릴리스 필수 | 긴 코드 최하위 블록의 중간·끝부분에 오류 삽입 | 상위 진단 클릭 시 해당 조상과 편집기를 열고 정확한 행·열에 도달 | PASS | actual 긴본문 wrong끝1193:3/10281:3 및smalltype/syntax/EOF/astral exactmetadata. native1MiB 중간검색/끝행이동,3단숨김격리 actualL4:C20→Unicodecaret69/focus와정확canvas복귀 수락. Agent3 savedactual→editor callback 대조를결합. [actual](long-product-retest-results.json), [native](ui-diagnostic-return-fixed.jpg). |
| B04 | P0-B/D | 첫 릴리스 필수 | 혼합 블록 저장/복구, 내부 코드 수정, 숨김 | 저장/복구·숨김은 본문 hash 보존, 코드 수정은 hash 변경; 계약 불변 시 공개 포트 ID·외부 와이어 유지, 의미 편집만 영향받는 상위 검사 무효화 | PASS | root native3단내부code 편집/실제 타입거부/Hide 전역오류 유지+혼합 authored strict검증/export. actual widebody input→Hide→JSON parser→Undo/Redo에서 body hash 변화/보존, sharedA/B ref·모든public계약/realedge exact불변 확인. |
| B05 | P0-B | 첫 릴리스 필수 | 부모 외부에서 내부 자식 포트로 직접 연결 시도 | 경계 우회 거부, 필요한 값은 부모 공개 포트로 노출하도록 안내 | PASS | Agent3 actual public-parent 양성 및 private/crossscope bypass atomic 음성, root native 공개소켓만으로 실제 혼합 chain strict kernel PASS. [경계 감사](design-audit-boundaries.md). |
| B06 | P0-D | 첫 릴리스 필수 | 많은 호출이 하나의 긴 코드 정의를 공유하고 편집 Undo·취소 수행 | 정의 본문 중복 폭증 없이 응답성·메모리 측정, 취소/한도 초과에도 본문 보존 | PASS | 1MiB공유정의200calls 본문저장/생성1개, history50 heap+1.23MB/RSS+14.47MB/commitmedian2.65ms 측정. native Hideblank/Undo/내부편집Undo/checkcancel 뒤 exact200calls1module/body1개 export. quota/HTTP제한 원문보존 대조 PASS. [native export](shared-cancel-independent-results.json), [측정](shared-body-memory-retest-results.json). |
| I01 | P0/P1 | 첫 릴리스 필수 | π 311줄 파일 열기 | 즉시 원문/파일 블록, 원본 hash 유지, 분석 전 검증 완료 표시 없음 | PASS | root native311줄 π선택→즉시원문파일블록,14,049bytes/source SHA0c041eca... exact, 분석전·미검증 상태.94ms는 도구/AX포함이며 반복median/p95 성능목표 달성 주장은 아님. 이후 실제 원본 kernel+standard공리 검증도 확인. [기록](HUMAN-AUDIT.md), [검증](ui-pi-original-verified.jpg). |
| I02 | P1 | 첫 릴리스 필수 | namespace·section·notation·macro·instance가 있는 파일 | 실제 이름·타입·위치 확인, 텍스트 추정과 구별, 원문 문맥 유지 | PASS | actual 현재파일 command adapter namespace/section/notation/private/macro-generated/instance/부분오류 이후정상선언의 fullname/telescope/directdeps/UTF16range/sourcehash 확인. native12부분선언/private원문L10. [실제 체크](design-audit-command-product-checks.json). |
| I03 | P1/P3 | 첫 릴리스 (P3 부분 후속) | 지원하지 않는 tactic, 중간 오류가 있는 파일 | 본문 누락 없이 탐색, 일부 분석과 목표 검증 구별 | PASS | P1: 중간 타입오류 뒤 정상선언 실제 분석, 원문 전체 보존 및 hasErrors/analyzed/verified=false/kernelAccepted=false 분리. 소스/tactic 내부 자동 전환은 P3 유보로 명시. [실제 부분분석](design-audit-command-product-retest.json), [원문](design-audit-source-bytes-retest.json). |
| I04 | P1 | 첫 릴리스 필수 | 새 업로드 선언과 설치된 공개 선언을 각각 호출 시도 | 전자는 호출 가능 조건을 설명, 후자는 실제 import 및 Lean 검사로 확인 | PASS | native currentdecl0999→Nat.add_zero 설치lookup→다른출처label→참조graph 실제 Init.Core import+kernel+goal+공리없음. 업로드currentbody는 호출근거로 복사 안 함/private는 탐색. [export대조](installed-reference-independent-results.json), [identity](design-audit-source-analysis-ui-retest.json). |
| I05 | P0–P3 | 첫 릴리스 필수 | 소스/프로젝트 변경 도중 이전 분석 완료 | 과거 결과를 새 문서·환경에 붙이지 않음 | PASS | actual source/project/file generation start/poll/installedlookup late success·failure 폐기/취소·역사label/원문jumpdisabled. 새 historical identity=null latefailure guard도 같은 actualcallback 수리 PASS. worker환경전후 검사와캐시대응미확정 유지. [재검사](design-audit-source-view-lifecycle-retest.json). |
| I06 | P1 | 첫 릴리스 필수 | π 원본과 최종 증명 단계를 잘못 고친 변형 | 원본은 해당 정책으로 검사, 잘못된 증명은 거부, 숨김·접기와 무관 | PASS | nativeπ원본 actualkernel재검사/standard Classical.choice Quot.sound propext 통과. 같은마지막종결hn변형은실제 부등식 <1 대 False 타입오류거부; source캡슐group접기→Hide hidden1 blank에서도전역error/진단 유지, inline jump L309:C3/caret13503 sourceeditor visible/focus. [원본](ui-pi-original-verified.jpg), [숨김오류](ui-pi-hidden-error.jpg), [이동](ui-pi-source-error-jump.jpg). |
| I07 | P1/P3 | 첫 릴리스 (P3 부분 후속) | 상수 의존선·목표 변화선·실제 포트 연결 비교 | 의미·범례·클릭 동작 구별, 미확정 소스 대응을 사실처럼 표시하지 않음 | PASS | P1: native 범례는 상수직접참조/편집포트wire/커서목표관측을구별. 실제source local의존은카드focus, 외부는별도installedlookup; 실제port는기존endpoint. 미확정/과거source관계는명시하고 가짜proofwire없음. [source](source-expansion-retest-results.json). P3 tactic 목표변화선/편집전환 미지원은후속유보로유지. |
| I08 | P0 | 첫 릴리스 필수 | UTF-8 BOM·CRLF·Unicode 주석 파일을 열고 숨김/배치/저장/복구/원문 내보내기 | 소스를 편집하지 않았을 때 원본 바이트 hash 동일, 디코딩 실패는 명시 | PASS | native BOM/CRLF/Unicode current/original download exactbytes. actual app/editor/history/draft/rawinvalidUTF8/editedcurrent별도/8MiB원본/hash위조수정+경고 PASS. [독립](design-audit-source-bytes-retest.json). |
| S01 | P1 | 첫 릴리스 필수 | 1,000개 선언 인덱스와 직접 의존 탐색 | 선택 범위 점진 렌더링, 기존 의미 그래프 한도 보존, 조작 지연 측정 | PASS | 독립 actual1000decl10.614초 모든 fullname/telescope/range/directdeps. actual UI callbacks50→100→search1/semantic256허용257거부; native50cards/search0999/L1008/importlookup. UI 지연114ms는 AX포함. [actual](declarations-1000-audit-results.json), [UI](declarations-1000-ui-results.json). |
| S02 | P0 | 첫 릴리스 필수 | v1/v2/v3 저장 문서와 손상된 표현 메타데이터 열기 | 호환 이전·진단·원본 보존, 재열기는 기존 정책에 따라 미검증 상태에서 확인 | PASS | v1/v2/v3 native 호환·손상 원본 다운로드·미검증·삭제 Undo 통과. 새 source cache imports/range 등 선택 스키마는 명시 경고와 정확한 원문/cache 보존으로 복구. outer string/version99 및 top/nested 0/false/null 원본도 actual listener 다운로드 각 1개·exact JSON 수리 재검사 완료. [최종](design-audit-falsy-source-recovery-retest.json), [lifecycle](design-audit-source-view-lifecycle-retest.json). |
| S03 | P0 | 첫 릴리스 필수 | 현재 열린 문서에서 숨김 후 내부 이동·선택·Undo | 숨김만으로 Lean 재검사하지 않음, Ctrl+Z는 숨김 편집을 취소하고 탐색은 별도 이력 | PASS | native verifiedHideUndo는 같은 actualenv조회 뒤 exact검증결과/Q,R타입 재사용, child navigationUndo는 현재middle경로 유지하고 부모선택 복원. actual 추가요청0/같음·변경·없음·늦은env4controls. [cache](presentation-cache-results.json). |
| S04 | P3 | 후속 P3 | 큰 증명에서 선택한 tactic 내부의 목표 탐색 | 범위별 점진 분석, 취소 가능, 이전 문서 목표 결과를 재사용하지 않음 | DEFERRED | P3 고정 버전 tactic 내부 adapter/범위별 점진 목표·취소 PoC 미지원. |

## 단계별 별도 완료 게이트

| 단계 | 끝내기 전에 확인할 계획 본문 조건 |
| --- | --- |
| P0-A | 의미 그래프와 별도 versioned presentation/sessionView; 컨테이너 부모 하나·순환/다른 의미 범위/존재하지 않는 ID 검증; v1/v2 그룹 이전 및 v3 공유 투영; 격리 종료/수동 숨김 해제/전부 표시 구별; 숨김/표현 Undo와 탐색 이력·복구 구별. |
| P0-B | code/graph의 동일 공개 계약; 빈 graph를 직접 구성; 내부 입력/결과가 부모와 실제 연결; 정의 ID/의미 범위/occurrence 경로/container ID 분리; 호출 A/B 인자와 일반 정의 타입을 혼동하지 않음. |
| P0-C | Lean 분석을 기다리지 않는 파일 블록/원문; 원본 byte snapshot과 검증 텍스트의 연결; 추정 개요와 환경/분석/목표 검증 상태 분리. 이 단계만으로 가져오기 전체 완료 불가. |
| P0-D | 본문·JSON escaping·HTTP·생성 wrapper·expected signature·LSP·출력·저장 한도 정합성; 1MiB급 본문을 자르지 않음; 전용 코드 편집기 검색/행 번호/접기/진단·목표; 큰 코드 공유 저장/생성 및 취소/시간 제한, 정확한 내부 행·열; 부모 graph 안 code/graph 재귀 혼합. |
| P1 | **현재 문서** command/snapshot 실제 선언·범위·직접 의존 adapter PoC: namespace/section/notation/private/macro 생성/instance/부분 오류; 전체 문맥 유지, 실제 telescope와 원본 이동, 분석 identity/취소/재시도; 1000개 인덱스 점진 렌더링; 설치 공개 선언 실제 import/재검사, 단독 업로드 선언은 별도 작업용 모듈 연결 전 호출 미지원 설명. |
| P2-A | 단일 Prop 출력의 의존 문맥 폐쇄·순서 미리보기; Nat/Fin 데이터 입력 허용, local let/typeclass/universe/증인 정책; 호출 치환 DAG·원자적 실패 원본 유지; 실제 계약/외부 목표/커널/공리 검사; 공유·독립 복제 구별. |
| P2-B | 데이터 결과의 definitional equality 또는 실제 동치 증명으로 의미 보존; 종속 다중 결과의 Prop/Type 구별과 패키징; 확인 불가면 명시적 미지원. |
| P3 | 고정 Lean 4.34.1 내부 adapter PoC; have/calc/cases/tactic 관측과 수학 컴포넌트 구별; 지역 문맥·source/version/환경 대응; 취소·점진 분석; 지원 구간만 별도 편집 복사본 검사. |

단독 업로드 정리의 실제 프로젝트 재사용, 다른 Lake 프로젝트, code 본문에서 graph 생성 helper 직접 호출, 일반적인 다형 계약과 양방향 code↔graph 변환은 계획의 후속 연결/PoC 범위다. 초기 지원으로 꾸미지 않으며 미지원 원문은 보존한다.

## 초기 coverage gap과 증거

아래 7개 항목은 구현 전 결손의 역사 기록이며 현재 판정은 위 매트릭스와 최신 AUDIT에 따른다.

1. 공통 화면 투영·격리·중첩 모델이 없다. typed renderer는 semantic scope의 모든 노드/edge를 그리며 기존 의존 preview는 흐리게 한다. `history.mjs::semanticScope`는 groups/x/y만 제외한다. 화면 상태를 노드/문서에 단순 추가하면 의미 해시 경계가 자동으로 맞지 않는다.
2. 정의 탐색만 있다. `typed-editor.mjs::scopePath`의 module/id를 호출 A/B 보기 경로로 쓰면 상태가 섞인다. 현재 공유 모듈 생성/합성은 새 수동 graph/code 구성의 기반이지만 호출별 탐색이 아니다.
3. 긴 본문 한도는 실제 경로마다 다르다. 독립 [audit_size_baseline.py](audit_size_baseline.py)는 65,530bytes/1,193행 및 1,048,483bytes/10,281행의 실제 Nat 계산 증명 본문을 만들었다. 두 compiler 입력이 8192bytes 한도로 invalid이고, 1MiB급 full source는 source checker/LSP 128KiB에서 거부됐다. **Lean kernel은 실행하지 않았다.** 원본 [size-baseline-results.json](size-baseline-results.json).
4. 프론트 모델은 큰 본문을 저장 객체로 받아도 1MiB급 JSON(1,068,703bytes)은 재가져오기에서 거부한다. 독립 [audit_frontend_size_baseline.mjs](audit_frontend_size_baseline.mjs), [frontend-size-baseline-results.json](frontend-size-baseline-results.json). 이 실험은 browser render나 실제 Lean 검사가 아니다.
5. `lean_lsp.py::extract_declarations`는 명시적으로 conservative textual index이며 namespace/private 실제 이름·signature·macro-generated 선언을 제공하지 않는다. 초기 샘플에서 hidden_proof 하나만 표시되고 macro가 만드는 generated는 없다. 이를 Lean 분석 성공으로 쓰지 않는다. 기존 `declaration.py`는 설치 import 환경 조회로 현재 업로드 파일 adapter의 대체물이 아니다.
6. 현재 파일 import는 `file.text()` 문자열, export는 doc.source다. 원본 bytes snapshot/엄격한 decoding·BOM/CRLF 보존은 별도 대조가 필요하다. 정확한 코드 내부 오류 위치와 raw-byte/표현 불변식의 독립 설계 감사는 Agent 3과 분담한다.
7. 현재 50개 history entry는 JSON 전체 복제, DraftStore는 current/previous 전체 JSON이다. 공유 긴 정의·자동 저장·Undo의 실제 메모리와 지연을 측정해야 B06을 통과한다.

root의 초기 사용자 관점 근거는 [HUMAN-AUDIT.md](HUMAN-AUDIT.md), [ui-before.jpg](ui-before.jpg). 초기 GLEAN Lake build 4jobs/Smoke.lean 통과는 기준 상태의 빌드이며 새 기능 완료 판정에 재사용하지 않는다.

## 감사 루프 기록 규칙

각 구현 배치마다 AUDIT-XX 또는 구조화 JSON에 제품 파일 hash/시점, 명령·종료 코드, fixture, 양성/음성 기대와 실제 결과, 실제 Lean/순수 모델/controlled response/UI의 구분을 기록한다. 결함은 ID·최소 재현·원자성/데이터 손실 영향과 함께 root/implementer에게 전달하며 수정 후 같은 재현을 다시 실행한다. 시점이 다른 전체 테스트와 새 제품 파일은 섞어 완료로 보고하지 않는다.

P0가 일부 끝났다면 해당 행만 갱신한다. 32개 첫 릴리스 조건이 통과하더라도 P2/P3 다섯 시나리오가 완료된 것처럼 “37개 완료”라 하지 않는다. 후속 항목의 미지원/유보 상태와 남은 PoC를 명확히 보고한다.

실제 editor callback과 root의 native export 파일에 대한 다음 배치는 [AUDIT-02.md](AUDIT-02.md)에 기록한다. 순수 API 검사·controlled response·실제 다운로드 파일·실제 Lean 근거를 구별한다.
장문 실제 standalone 대조와 root/child 세션 복구 범위는 [AUDIT-03.md](AUDIT-03.md)에 기록한다. standalone 증명 성공을 제품 B01 전체 경로의 검증 성공으로 바꾸어 세지 않는다.
실제 제품 장문4대조 실패/프론트 exact 왕복/실제3단 export/탐색 이력 수정은 [AUDIT-04.md](AUDIT-04.md)에 기록한다.


## 첫 P0-A 모델 배치 감사

[초기 및 첫 모델 감사](AUDIT-01.md)를 별도로 기록한다. 새 모델의 v1/v2/v3 3단 컨테이너 이동·Undo/Redo·파일 파싱·자동 복구의 순수 경로 3건을 독립 확인했다. 최초 malformed scope, 257개 컨테이너 잘림, 빈 컨테이너 grouping의 nonfinite 좌표를 발견해 구현자에게 전달했다. 동일 입력 재검사에서는 각각 진단+원본 보관, 진단+원본 보관, 원자적 거부로 고쳐졌다. [p0-roundtrip-retest-results.json](p0-roundtrip-retest-results.json). UI는 root의 수락을 기다리므로 해당 전체 요구사항을 PASS로 올리지 않는다.

장문4건·P1 실제 선언·native 공유200호출·복구 수락은 [AUDIT-05.md](AUDIT-05.md), 마지막 전체 기능 수락과 회귀 게이트는 [AUDIT-06.md](AUDIT-06.md)에 기록한다. 현재 **32 PASS / 0 PARTIAL / 0 FAIL / 5 DEFERRED**, 첫 릴리스 32개 기능 수락이 통과했다. 마지막 안정 제품의 Python 166개/JS 211개, GLEAN Lake build, Lean smoke와 diff check가 모두 통과했다. [최종 수락](AUDIT-06.md), [제품 hash/검사 명령](final-product-hashes.json).
