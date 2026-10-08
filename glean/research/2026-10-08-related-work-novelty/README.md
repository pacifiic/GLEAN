# GLEAN 선행 연구와 노블티 평가

평가 기준일: 2026년 10월 8일.

**Grasshopper처럼 블록을 연결해 증명하고, 하위 증명을 한 블록으로 묶어 재사용한다는 기본 발상의 노블티는 낮다. GLEAN은 긴 Lean 원문과 편집 가능한 그래프를 계층적으로 함께 다루는 시스템으로서 차별화할 가능성이 있지만, 새로운 알고리즘이나 사람의 검토 효율 향상은 아직 입증하지 않았다.** 연구의 중심을 시각적 블록 자체에서 의존 타입과 지역 문맥을 보존하는 편집, 그리고 사람이 검토할 때 생기는 오해를 줄이는 인터페이스로 좁히는 것이 좋다.

아래 평가는 논문 원문, 저자·기관의 논문 페이지, 공식 프로젝트 문서에 근거한다. 개별 도구를 모두 설치해 비교 실험한 결과는 아니다. 논문으로 발표된 기여와 공개 도구의 기능을 구별하며, 확인한 자료에 없는 기능을 곧바로 미지원으로 판정하지 않는다. 문헌 조사는 비체계적 탐색이며 전 세계 최초라는 주장을 뒷받침하지 않는다.

## 현재 GLEAN의 평가 범위

[제품 설명](/Users/moonone/GLEAN/GLEAN.md), [계층과 가져오기 계획](/Users/moonone/GLEAN/glean/research/2026-10-07-block-hierarchy-import/PLAN.md), [수락 감사](/Users/moonone/GLEAN/glean/research/2026-10-07-block-hierarchy-implementation/REQUIREMENTS.md)를 기준으로 구현과 계획을 구분했다.

| 기능 | 현재 상태 | 연구 주장에 미치는 영향 |
| --- | --- | --- |
| LeanScript와 실제 Lean/mathlib 선언을 포트로 연결 | 구현 및 기존 감사 근거 있음 | 실제 Lean 타입을 사용하는 작성 도구라는 근거 |
| 코드 부모와 그래프 부모를 서로 중첩하고 공유 정의 호출 | 구현 및 기존 감사 근거 있음 | 혼합 계층 편집의 시스템 기여 후보 |
| `n : Nat`, `i : Fin n` 같은 의존 입력과 Cases 지역 문맥 | 지원 범위 내 구현 | 단순 명제논리보다 현실적인 Lean 표현을 다룸 |
| 숨김·격리·접기, 호출별 보기, 숨긴 오류의 전역 상태 유지 | 구현 및 기존 감사 근거 있음 | 검토 시 지역 보기와 전체 증명의 상태를 함께 전달하는 기반 |
| 긴 코드 편집, 실제 목표 조회, 소스·환경이 연결된 기록 | 구현 및 기존 감사 근거 있음 | 과거 관찰을 현재 검증으로 오해하지 않도록 하는 기반 |
| `.lean` 원문 가져오기와 실제 선언·범위·직접 참조 분석 | 구현 및 기존 감사 근거 있음 | 가져오기는 가능하지만 전체 증명이 편집 그래프로 바뀌는 것은 아님 |
| 선택한 v3 조각의 의존 문맥 폐쇄와 모듈 추출 | P2 유보 H07–H09 | 핵심 리팩터링 기여는 아직 주장할 수 없음 |
| 공유 정의를 독립 정의로 복제 | P2 유보 H06 | 일반적인 복사·붙여넣기와 구별해야 함 |
| 임의의 Lean tactic 증명을 점진적으로 편집 그래프로 전환 | P3 유보 S04 등 | 범용 Lean→그래프 변환기로 소개하면 과장 |
| 실제 사용자의 이해도·검토 시간·오류 탐지 개선 | 사용자 비교 연구 없음 | 효과는 연구 가설이며 결과가 아님 |

기존 감사의 32 PASS와 5 DEFERRED는 제품 요구사항의 상태다. π 증명 원문 검사와 잘못된 마지막 줄 거부, 긴 본문 저장·편집 실험은 기능 정확성을 보여준다. π 증명을 시각적 그래프로 분해해 작성했다는 근거나 복잡한 수학 전반에서 검토가 빨라졌다는 근거는 아니다. 선언 1,000개 탐색과 의미 그래프 256노드 한도도 서로 다른 규모 지표다.

## 가장 직접적으로 겹치는 연구

### Incredible Proof Machine

Joachim Breitner의 **Visual theorem proving with the Incredible Proof Machine**, ITP 2016은 가장 가까운 선행 연구다. 가정·추론 규칙·결론을 포트가 있는 블록으로 만들고 연결하여 증명을 구성한다. 논문 서론은 LabVIEW의 시각적 언어 G를 Curry–Howard 대응에 연결한 것으로 발상을 설명한다. 즉 시각적 프로그래밍을 증명 작성에 적용하는 구상 자체가 이미 명시적으로 제시되어 있다. [기관 논문 페이지](https://pp.ipd.kit.edu/publication.php?id=breitner16incredible&lang=en), [논문 원문](https://pp.ipd.kit.edu/uploads/publikationen/breitner16incredible.pdf).

논문 §2.6은 선택한 증명 조각을 custom block으로 만들고 재사용하는 기능을 설명한다. 지역 가정·변수의 범위를 그래프에서 추론하며, 증명 그래프의 형식적 정의와 자연 연역과의 관계도 다룬다. 따라서 블록 연결, 선택 조각의 모듈화, 지역 가정의 시각적 처리는 GLEAN의 독립적인 신규 기여가 아니다. [공식 실행 도구](https://incredible.pm/), [논문 §2.6 및 §3](https://pp.ipd.kit.edu/uploads/publikationen/breitner16incredible.pdf).

GLEAN이 비교할 지점은 Lean 4의 실제 프로젝트 환경, 의존 입력, 긴 코드와 그래프를 함께 다루는 편집이다. 기존 논문은 논리 교육용 도구를 중심으로 하며, 시각화 발상의 겹침과 실제 Lean 통합의 차이를 함께 설명해야 한다.

### PSGraph와 Tinker

Grov, Kissinger, Lin의 **A Graphical Language for Proof Strategies**, LPAR 2013은 tactic을 노드로 두고 목표를 연결선을 따라 전달한다. §2와 §5는 하위 그래프를 한 노드로 접고 다시 펼치는 계층, 상위 노드와 내부 그래프의 입출력 일치, 하위 전략의 합성을 설명한다. 따라서 블록 안에 블록, 접기·펼치기, 계층 경계의 계약도 선행 개념이다. [논문](https://arxiv.org/abs/1302.6890), [원문 §5](https://arxiv.org/pdf/1302.6890).

Tinker는 이를 편집·디버깅하는 도구로 구현하며 계층과 라이브러리, breakpoint, 실행 기록과 재생을 제공한다. 공식 문서에는 Isabelle, ProofPower, Rodin 연결이 명시되어 있다. 2017년 STTT 논문 **The Tinker tool for graphical tactic development**도 있다. [공식 프로젝트와 논문 목록](https://ggrov.github.io/tinker/).

핵심 비교 단위는 다르다. PSGraph의 연결선은 목표가 어떤 tactic으로 이동할지 결정하는 goal-type 조건이고, GLEAN v3의 연결선은 Lean 항과 증거를 컴포넌트 입력에 전달한다. 이 차이를 명시해야 한다. 2013년 프로토타입의 한계를 최신 Tinker 전체의 한계로 옮겨 주장해서는 안 된다.

### Paperproof

Paperproof는 Lean 4 증명에서 가정과 목표가 바뀌는 과정을 보여준다. 공식 README는 실제 mathlib 예제, `cases`·`induction` 등 tactic 표현, 중첩 scope, scope 확대, snapshots와 single-tactic mode를 소개한다. 따라서 Lean 증명 시각화, 지역 문맥 표시, 단계별 관찰만으로 새로움을 주장하기 어렵다. [공식 저장소](https://github.com/Paper-Proof/paperproof).

GLEAN의 비교 지점은 목표 이력의 표시를 넘어 포트 연결과 공유 정의를 편집하고, 긴 원문을 유지하면서 필요한 부분을 계층적으로 작성하는 흐름이다. Paperproof의 문서에 나타난 목표를 기준으로 비교하며, 모든 편집 기능이 없다고 단정하지 않는다.

### ProofWidgets4와 Lean의 확장 UI

Nawrocki, Ayers, Ebner의 **An Extensible User Interface for Lean 4**, ITP 2023은 Lean 표현과 연결된 확장 인터페이스를 다룬다. ProofWidgets4는 수학·데이터 시각화, tactic 인터페이스, 다른 목표 표시, 표현 입력과 증명 편집을 지원한다고 명시한다. 실제 Lean 정보를 GUI에 연결하는 것 자체는 신규 기여가 아니다. [논문](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ITP.2023.24), [공식 라이브러리](https://github.com/leanprover-community/ProofWidgets4).

Untangle은 Lean 4의 범주론 string diagram을 클릭해 표현을 rewrite하는 도구다. 시각적인 선과 도형의 조작을 실제 증명 편집에 연결하는 사례이며, 공식 문서는 특정 영역의 proof of concept임을 명시한다. GLEAN의 범용적인 블록 계약과 영역별 수학 도표를 구별해야 한다. [공식 저장소](https://github.com/dignissimus/Untangle).

### Lean Atlas와 Lean Compass

Yanahama와 Sannai의 **Lean Atlas: An Integrated Proof Environment for Scalable Human-AI Collaborative Formalization**, 2026 프리프린트는 GLEAN의 최초 문제의식과 직접 겹친다. Lean 커널이 받아들인 명제도 사람이 의도한 수학과 다를 수 있다는 semantic hallucination을 다루며, 선언의 type/value 의존 관계를 분류하고 Lean Compass로 사람의 의미 검토 대상 집합을 추출한다. [논문](https://arxiv.org/abs/2604.16347), [방법과 한계](https://arxiv.org/html/2604.16347v1).

중요한 차이는 **선택만 보이게 하는 UI와 의미 검토에 필요한 집합을 계산하는 알고리즘이 다르다**는 것이다. GLEAN의 현재 직접 입력·사용처 보기는 한 단계 관계이며 Compass와 같은 의미 검토 폐쇄 집합이 아니다. Atlas의 평가도 검토 후보 노드 수 감소를 측정했으며 사람의 실제 검토 시간 감소는 측정하지 않았다고 밝힌다. GLEAN 역시 시간 단축을 실험하기 전에는 주장할 수 없다. 같은 [원문 §6 Limitations](https://arxiv.org/html/2604.16347v1).

arXiv 메타데이터는 AIPV 2026에 제출한 것으로 표시한다. 이 보고서에서는 심사 통과가 확인된 학회 논문으로 분류하지 않는다.

### ProofFlow

Cabral 등의 **ProofFlow: A Dependency Graph Approach to Faithful Proof Autoformalization**, 2025 arXiv 버전은 자연어 증명을 단계별 의존 그래프로 만들고 각 노드를 Lean 보조정리로 형식화한다. 결과는 노드를 클릭하여 세부 결과를 보고 색상으로 성공·오류를 확인하는 인터랙티브 그래프다. 증명 구조와 의미 충실도, Lean 컴파일 성공을 구분해 평가한다. [논문](https://arxiv.org/abs/2510.15981), [워크플로와 출력 §3](https://arxiv.org/html/2510.15981v1).

따라서 AI 증명을 그래프로 분해하여 검토하고 실패 위치를 표시하는 것 역시 이미 연구 대상이다. GLEAN은 자동 형식화 파이프라인과 비교해 사람이 계층과 연결을 직접 편집하는 과정에서 무엇이 개선되는지 보여줘야 한다. 이 비교는 열람한 arXiv 버전을 기준으로 하며 별도의 학회 채택 여부를 전제하지 않는다.

## 함께 비교해야 할 도구와 기반 기능

| 선행 도구 | 확인한 기능과 GLEAN에 주는 의미 |
| --- | --- |
| [ProofViz — TFP 2021](https://stchang.github.io/pubs/proofviz.pdf) | Cur의 부분 증명 항과 tactic의 대응, 노드별 문맥·목표, focus 변경, tactic 실행과 Undo/Redo를 제공한다. 인터랙티브 시각화와 실제 작성의 결합도 선행 사례가 있다. |
| [LeanBlueprint](https://github.com/PatrickMassot/leanblueprint) | 2020년에 시작된 Lean 프로젝트의 blueprint 인프라다. 비형식 수학 설명과 형식화 구조를 함께 탐색하는 기존 작업 흐름을 비교 대상으로 삼을 수 있다. |
| [Trellis](https://www.math.cmu.edu/~wes/trellis.php) | 자연어와 Lean이 짝을 이루는 선언 DAG, worker와 독립 검토자, 사람이 의미 폐쇄 집합을 승인하는 흐름을 설명한다. 다중 에이전트 구현·감사 루프 자체도 신규 연구 주장으로 삼기 어렵다. 공개 시스템 설명과 독립적으로 검증한 성능을 구별한다. |
| [Visual Lean](https://www.agapebloom.com/vlean/) | 가정·타입·문맥을 노드로 만들고 연결해 증명한다는 실험적 구상을 공개한다. 명시된 구현은 C++/WASM 프로토타입이다. 페이지의 이름이나 type-safe 설명만으로 실제 Lean 커널 연동이 확인된 것으로 보지 않는다. |
| [mathlib `extract_goal`](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Tactic/ExtractGoal.html) | 목표와 관련 지역 문맥을 독립 선언 형태로 추출한다. 지역 문맥을 매개변수로 만드는 아이디어는 이미 있다. 문서는 pretty printing과 import에 따라 추출한 문장이 원래 목표와 달라질 수 있다고 경고한다. |
| [mathlib `#explode`](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Tactic/Explode.html) | Lean 증명 항을 분해하여 단계, 의존 관계, 범위를 Fitch 방식으로 표시한다. Lean에서 실제 증명의 구조를 추출하는 것 자체도 새로운 출발점은 아니다. |
| [Hazel — POPL 2019](https://popl19.sigplan.org/details/POPL-2019-Research-Papers/13/Live-Functional-Programming-with-Typed-Holes) | 미완성 프로그램의 hole과 문맥을 다루고 편집 상태의 의미를 형식화한다. GLEAN이 편집 모델의 이론적 기여를 주장하려면 이 계열과의 비교도 필요하다. |
| [A drag-and-drop proof tactic — CPP 2022](https://arxiv.org/abs/2210.11820) | 드래그 동작을 형식적 증명 구성 단계에 연결한다. 마우스로 증명한다는 일반적인 인터랙션은 선행 연구가 있다. |
| [Proof Interfaces for Exploratory Mathematics — 2026](https://arxiv.org/abs/2610.02449) | Hazel Prover의 등식 추론과 자동화 수준 조절, Rocq로의 증명 내보내기를 다룬다. 메타데이터는 SPLASH-E의 비아카이브 작업으로 명시한다. Lean용 범용 그래프 편집과는 적용 범위가 다르다. |

## 어떤 그래프인지 먼저 구별해야 한다

이 구별은 GLEAN의 설명과 평가 모두에 필요하다. 노드와 선이 닮았다는 이유로 의미까지 같다고 볼 수 없다.

| 그래프 | 노드와 선의 의미 | 대표 비교 대상 |
| --- | --- | --- |
| 증명·항 컴포넌트 그래프 | 가정·함수·증거를 적용하고 출력 항을 입력에 전달 | IPM, GLEAN v3 |
| 증명 전략 그래프 | tactic이 목표를 소비하고 하위 목표를 다음 tactic으로 전달 | PSGraph/Tinker |
| 목표 이력과 증명 트리 | tactic 전후의 목표·가정, 생성된 증명 항의 구조를 표시 | Paperproof, ProofViz |
| 프로젝트 선언 의존 그래프 | 정리·정의가 어떤 상수를 참조하는지 표시 | Lean Atlas, GLEAN 소스 선언 분석 |
| 자연어 증명 단계 그래프 | 비형식 추론 단계와 보조정리의 의존 관계를 표현 | ProofFlow, Trellis |

GLEAN에서 원문 capsule을 표시하고 선언 참조를 연결했다고 해서 원문의 tactic 추론 과정까지 시각적으로 표현한 것은 아니다. 숨긴 노드 사이를 임의로 연결하면 실제 의존 관계가 바뀐 것으로 오해할 수 있다. 각각의 보기에서 무엇을 생략했는지와 어떤 수준의 관계인지 표시하는 설계가 중요하다.

## 노블티 판단

아래 등급은 위 비교에 근거한 연구적 판단이다. 논문 채택 가능성의 확률이나 객관적인 점수는 아니다.

| 주장 후보 | 평가 | 이유 |
| --- | --- | --- |
| Grasshopper식 노드 증명 작성 | 낮음 | IPM과 PSGraph가 직접 선행한다. |
| 선택 블록을 하나로 묶거나 블록 안에 블록을 넣기 | 낮음 | custom block과 계층 그래프가 이미 있다. |
| OOP로 증명을 모듈화 | 낮음 | 캡슐화·합성·재사용이라는 기존 원칙을 적용하는 설계 선택이다. |
| Lean 타입·목표를 GUI에 실시간 연결 | 낮음 | 기존 Lean UI, ProofWidgets, Paperproof와 겹친다. |
| AI 증명을 그래프로 검토 | 낮음 | Atlas, ProofFlow, Trellis와 문제 및 흐름이 겹친다. |
| 긴 원문과 편집 그래프가 섞인 계층을 실제 Lean 문맥으로 작성·검토 | 중간의 시스템 기여 가능성 | 현재 구현을 출발점으로 범위·경계·호출 문맥을 유지하는 상호작용을 설명할 수 있다. 기존 기술의 결합만으로는 충분하지 않다. |
| 의존 타입을 보존하는 선택 조각 추출과 원자적 호출 치환 | 비교적 강한 기여 후보 | 단순 목표 출력보다 그래프의 외부 경계·분기·값 의미를 함께 보존해야 한다. 아직 P2이며 기존 `extract_goal` 및 그래프 추출과 비교해야 한다. |
| 사람이 더 빨리 읽고 의미 오류를 더 잘 발견한다 | 잠재력 있으나 미입증 | 비교 사용자 연구가 필요하다. 예쁜 UI나 자동 테스트 수로 대체할 수 없다. |

Grasshopper의 심미성과 CAD식 작업 공간은 제품 사용성을 높일 수 있다. 연구에서는 그것이 어떤 과제의 어떤 오류를 줄였는지 설명하고 측정해야 한다. 시각적으로 연결된 증명이 텍스트보다 항상 이해하기 쉽다는 전제도 검증 대상이다.

## 권장하는 연구 질문

가장 현실적인 주제는 **Lean 원문과 그래프를 혼합한 계층 편집이, 지역 문맥을 유지하면서 증명을 검토하고 수정하는 데 어떤 도움을 주는가**다. 현재 구현을 활용할 수 있고, 범용 자동 변환이 완성될 때까지 기다릴 필요도 없다.

논문 주장의 후보는 다음과 같다. 첫 번째는 기존 기능의 체계화이며, 두 번째와 세 번째는 추가 연구가 필요하다.

1. **표현과 검증 모델:** 본문·공개 입출력·호출을 의미 문서로 두고, 접기·숨김·격리를 별도 보기로 분리한다. 어느 보기에서도 전역 오류와 검증 근거가 유지되는 조건을 명시한다. 이는 좋은 설계 원칙만으로 끝내지 않고 구체적 불변조건과 실패 사례로 보여줘야 한다.
2. **의존 문맥을 보존하는 리팩터링:** 선택한 연결 조각의 외부 입력, 타입의 의존 순서, 지역 가정과 분기 경계를 분석하여 공유 정의와 호출로 바꾼다. 변환 실패 시 원문을 유지하며, 바뀐 공개 타입과 데이터 반환값의 의미를 검사한다. 이 부분은 P2 구현과 별도 검증이 필요하다.
3. **사람의 검토 효과:** 혼합 계층 편집이 텍스트·목표 이력·선언 그래프와 비교하여 오류 발견, 수정, 재사용에 미치는 효과를 측정한다. 줄어든 화면 노드 수보다 실제 수행 시간과 오판률을 중심으로 평가한다.

주제별 가능 제목은 다음과 같다.

- 시스템·사용자 연구: **GLEAN: Hierarchical Mixed Text and Graph Editing for Lean Proofs**
- 리팩터링 연구: **Scope-Preserving Component Extraction for Dependent Proof Graphs**

둘 모두 아직 검증할 연구 방향이다. 논문 제목에 신뢰성·검토 시간 단축·범용 변환을 결과처럼 포함하려면 해당 근거를 먼저 만들어야 한다.

### OOP를 Lean에 맞게 구체화하기

사용자가 제안한 OOP의 장점은 **캡슐화, 명시적 계약, 합성, 재사용**으로 구체화하는 것이 좋다. 공개 입력에는 값과 가정을, 공개 결과에는 타입 또는 명제를 두고 내부는 긴 Lean 코드나 하위 그래프로 표현한다. 같은 정의를 호출해도 각 호출의 실제 인자와 지역 문맥은 구별한다.

상속이나 변경 가능한 객체 상태를 늘리는 것보다 의존 함수와 증명 모듈에 맞추는 편이 적합하다는 설계 판단이다. 예를 들어 `i : Fin n`의 포트를 밖으로 내보내면 `n`의 바인딩과 필요한 가정도 계약에 포함해야 한다. 그룹으로 둘러싸는 조작만으로 이 문제는 해결되지 않는다. 타입클래스 인스턴스와 universe도 단순한 표시 문자열로 처리할 수 없다.

## 검증해야 할 불변조건

아래는 새로운 정리가 증명되었다는 선언이 아니라, 연구용 명세와 실험으로 확인할 조건이다.

- **보기와 의미의 분리:** 의미 문서 `D`가 같다면 숨김·접기·격리 상태 `v`를 바꿔도 생성 Lean 프로그램의 의미가 같아야 한다. 생성 코드 자체가 동일하게 유지되는 설계라면 그보다 강한 동일성도 검사할 수 있다.
- **추출 전후 계약 보존:** 추출한 조각을 호출로 바꿔도 공개 목표와 외부에서 쓰는 결과의 의미가 보존되어야 한다. 이름 충돌·새 순환·지역 가정 탈출은 원자적으로 거부한다.
- **관찰의 출처 일치:** 목표와 타입 관찰은 소스·위치·프로젝트 환경에 연결한다. 이전 버전의 녹색 표시나 북마크는 현재 버전의 검증 결과로 승격하지 않는다.
- **검증과 의미 검토의 구분:** Lean 증명 검사 성공과 자연어 수학에 대한 충실성은 구별한다. 사용자가 목표와 정의를 잘못 지정한 경우도 별도의 검토 과제로 다룬다.

`Nat`을 반환하는 블록이 원래 `0`을 내보냈는데 추출 후 `1`을 내보내도 두 블록의 출력 타입은 같다. 따라서 타입 검사 성공만으로 리팩터링의 의미 보존을 주장할 수 없다. 반환값은 정의적 동등성이나 적절한 등식·관찰 조건 등 명시한 기준으로 비교해야 한다. `Prop` 증거와 계산에 쓰는 데이터를 구별하는 이유다.

Lean의 커널 재검사와 공리 확인은 별도의 신뢰 기반을 다룬다. 사람의 의도와의 일치를 보장하지는 않으며, GLEAN의 환경 식별도 모든 의존 바이너리의 완전한 attestation을 뜻하지 않는다. [Lean 공식 증명 검증 문서](https://lean-lang.org/doc/reference/latest/ValidatingProofs/), [GLEAN의 검사 범위](/Users/moonone/GLEAN/GLEAN.md).

## 논문으로 발전시키기 위한 비교 실험

### 비교 대상과 과제

| 과제 | 주 비교 대상 | 주요 측정값 |
| --- | --- | --- |
| 하위 증명이 어느 가정에 의존하는지 찾기 | VS Code Lean infoview, Paperproof | 정답률, 시간, 범위 오해 |
| 긴 증명의 일부를 수정하고 영향 확인 | 텍스트 편집, GLEAN 전체, 계층 기능을 뺀 GLEAN | 완료율, 수정 시간, 잘못된 연결·반복 검사 |
| 의미가 다른 정의나 약해진 정리 발견 | 텍스트·선언 탐색, Lean Atlas, GLEAN | 의미 오류 탐지율, 정상 사례 오경보, 확신 수준 |
| 선택 조각을 재사용 정의로 추출 | 수동 Lean 리팩터링, `extract_goal`을 이용한 흐름, P2 GLEAN | 의미 보존, 필요한 입력 누락, 실패 시 원문 보존 |
| 숨긴 오류와 오래된 검증 기록 해석 | GLEAN 전체, 전역 상태·출처 표시를 뺀 버전 | 미완성 증명을 완성으로 판단하는 비율 |

도구마다 다룰 수 있는 표현 수준이 다르므로 모든 과제에 같은 도구를 강제로 적용하지 않는다. 전체 시스템 비교와 기능을 하나씩 제거한 비교를 함께 두어 계층 편집, 격리, 출처 표시 중 무엇이 효과를 냈는지 구분한다.

### 증명과 참가자 구성

π 한 사례에 더해 실제 mathlib와 AI 생성·수정 증명에서 대수·해석·조합·귀납·존재 증인·의존 타입 사례를 구성한다. 초기 파일럿은 예를 들어 15–30개 사례로 시작할 수 있지만 이 수치는 달성 결과나 필수 표본 크기가 아니다. 원문을 그대로 넣은 사례와 사람이 부분 그래프로 작성한 사례를 구별하고, 변환 준비 시간도 포함한다.

Lean 경험이 많은 사람과 수학 배경은 있으나 Lean 경험이 적은 사람을 구분한다. 순서 효과를 통제하고 충분한 연습을 제공한다. 본 실험의 참가자 수는 파일럿의 효과 크기와 변동성으로 정하며, 숙련도별 결과와 신뢰구간을 보고한다.

오류 데이터에는 실제 타입 오류, 분기 가정의 범위 탈출, 숨긴 오류, 과거 검증 재사용, 같은 타입의 잘못된 반환값, 의도보다 약한 정리, 이름은 그럴듯하지만 의미가 다른 정의를 포함한다. 정상 사례도 섞어 오류 탐지와 오경보를 함께 측정한다. 사람이 만든 오류의 정답 판정은 AI 검토자와 독립적으로 마련한다.

### 현재 근거에 추가할 것

기능 테스트 외에 입력 파일·정확한 Lean/mathlib 버전·기대 목표·원본과 변환 결과를 재현 가능한 자료로 저장한다. 그래프가 커질 때의 분석·검사·탐색 지연과 메모리도 별도로 측정한다. 인위적으로 긴 코드의 바이트 수를 수학적 복잡성이나 실제 대형 프로젝트 지원과 동일시하지 않는다.

## 개발 우선순위에 대한 판단

1. **혼합 계층 편집의 실제 수학 사례와 파일럿부터 확보한다.** 현재 기능으로 가능한 과제에서 사용자가 어디서 막히는지 관찰한다. 추가 UI 기능을 늘리기 전에 연구 효과의 방향을 확인한다.
2. **P2의 의존 문맥 보존 추출을 기술적 중심으로 삼는다.** `extract_goal`의 문맥 처리와 `Expr` 기반 정보를 참고하되 선택 그래프의 원자적 치환과 계약 보존을 독립적으로 명세한다.
3. **의미 검토 범위를 계산할 때 Atlas와 비교하거나 연동한다.** 단순 직접 의존 격리를 새로운 의미 분석 알고리즘으로 소개하지 않는다.
4. **범용 자동 변환은 P3로 유지한다.** 실제 선언, tactic 목표 이력, 증명 항을 각각 다루는 어댑터로 접근하고, 미지원 구간은 원문으로 남긴다. LLM이 그럴듯하게 재구성한 그림과 Lean에서 확인한 관계를 구별한다.

현재 단계에서는 **Lean을 위한 계층적 혼합 편집 시스템의 데모와 설계 사례**라는 주장이 가장 방어 가능하다. 더 강한 연구 기여를 위해서는 의존 문맥을 보존하는 리팩터링의 명세·구현과 사용자 검토 효과 중 적어도 하나를 비교 근거로 완성해야 한다.

## 핵심 문헌 목록

본문의 링크가 각 기능의 근거이며, 아래는 논문과 공개 도구를 다시 찾기 위한 목록이다.

1. Joachim Breitner. *Visual theorem proving with the Incredible Proof Machine*. ITP 2016. [기관 페이지 및 DOI](https://pp.ipd.kit.edu/publication.php?id=breitner16incredible&lang=en).
2. Gudmund Grov, Aleks Kissinger, Yuhui Lin. *A Graphical Language for Proof Strategies*. LPAR 2013. [논문](https://arxiv.org/abs/1302.6890).
3. Gudmund Grov, Yuhui Lin. *The Tinker tool for graphical tactic development*. STTT, 2017 온라인 발표. [공식 문헌 목록](https://ggrov.github.io/tinker/).
4. Daniel Melcer, Stephen Chang. *ProofViz: An Interactive Visual Proof Explorer*. TFP 2021. [저자 논문 페이지](https://www.cs.umb.edu/~stchang/tfp2021/index.html).
5. Wojciech Nawrocki, Edward W. Ayers, Gabriel Ebner. *An Extensible User Interface for Lean 4*. ITP 2023. [논문](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ITP.2023.24).
6. Pablo Donato, Pierre-Yves Strub, Benjamin Werner. *A drag-and-drop proof tactic*. CPP 2022. [논문과 학회 서지 정보](https://arxiv.org/abs/2210.11820).
7. Banri Yanahama, Akiyoshi Sannai. *Lean Atlas: An Integrated Proof Environment for Scalable Human-AI Collaborative Formalization*. 2026 프리프린트. [논문](https://arxiv.org/abs/2604.16347).
8. Rafael Cabral 등. *ProofFlow: A Dependency Graph Approach to Faithful Proof Autoformalization*. 2025 arXiv 버전. [논문](https://arxiv.org/abs/2510.15981).
9. Cyrus Omar, Ian Voysey, Ravi Chugh, Matthew Hammer. *Live Functional Programming with Typed Holes*. POPL 2019. [학회 논문 페이지](https://popl19.sigplan.org/details/POPL-2019-Research-Papers/13/Live-Functional-Programming-with-Typed-Holes).
10. *Proof Interfaces for Exploratory Mathematics*. 2026 프리프린트·SPLASH-E 비아카이브 작업. [논문](https://arxiv.org/abs/2610.02449).

지속 개발 도구: [Paperproof](https://github.com/Paper-Proof/paperproof), [ProofWidgets4](https://github.com/leanprover-community/ProofWidgets4), [Untangle](https://github.com/dignissimus/Untangle), [LeanBlueprint](https://github.com/PatrickMassot/leanblueprint), [Trellis](https://www.math.cmu.edu/~wes/trellis.php), [Visual Lean](https://www.agapebloom.com/vlean/), mathlib의 [`extract_goal`](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Tactic/ExtractGoal.html)과 [`#explode`](https://leanprover-community.github.io/mathlib4_docs/Mathlib/Tactic/Explode.html).
