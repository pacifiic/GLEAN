# GLEAN

Lean을 Grasshopper처럼 노드와 포트로 작성하는 시각적 증명 프로그래밍 환경.

이 저장소는 `leanprover/lean4`의 소스를 기반으로 시작한다. 초기 개발 기준은
안정판 **Lean v4.34.1**, 커밋 `5045d0056413266e57c625dcd7c365b10e377c52`이며,
작업 브랜치는 `glean/bootstrap`이다. Lean의 Apache 2.0 라이선스를 따른다.

## 현재 상태

- 공식 Lean 소스와 Git 이력을 보유한다. 원본 원격 이름은 `upstream`이다.
- `glean/`은 GLEAN 전용 Lake 패키지이며 Lean v4.34.1을 고정한다.
- 함수 적용, 논리곱의 분해·조합, 의존하는 증명 입력을 설명하는 예제가 있다.
- smoke test는 예제의 타입 검사, 잘못된 입력 거부, 추가 공리 없는 증명을 확인한다.
- 노드 편집 UI, 그래프 저장 형식, 그래프에서 증명 항을 생성하는 백엔드는 아직 구현 전이다.

## 로컬 실행

저장소 루트에서:

```bash
./glean/scripts/lake build
./glean/scripts/lake env lean tests/Smoke.lean
```

래퍼는 `.glean-tools/lean-4.34.1-darwin_aarch64/`의 공식 바이너리가 있으면 사용한다.
다른 환경에서는 [공식 설치 안내](https://lean-lang.org/install/)에 따라 elan을 설치하면
`glean/lean-toolchain`에 지정한 버전을 사용할 수 있다.

`.glean-tools/`와 Lake 빌드 산출물은 Git에 포함하지 않는다. 로컬 바이너리는
Lean 공식 릴리스 `lean-4.34.1-darwin_aarch64.tar.zst`에서 설치했으며 SHA-256은
`65f22a4f047738ec742667b3247e836a86ebf06eabc12655c3dee00637e37866`이다.

GLEAN 패키지 실행에는 공식 배포 바이너리를 사용한다. Lean 컴파일러 자체를
소스에서 빌드하는 절차는 `doc/make/index.md`를 따른다.

## 다음 구현 순서

1. **그래프 모델:** 가정, 선언 참조, 함수 적용, 목표, 범위 상자를 정의한다.
2. **Lean 연결:** 지원하는 그래프를 Lean 표현으로 변환하고, 타입 검사 결과를
   노드와 포트에 대응시킨다. 미완성 목표와 완성된 증명을 구분한다.
3. **캔버스:** 노드 추가, 포트 연결, 오류 표시, 코드 미리보기를 제공한다.
4. **의존 타입:** 인자 값에 따라 다른 입력 포트의 요구 타입을 갱신한다.
5. **재사용:** 부분 그래프를 보조정리로 추출하고 새 노드로 불러온다.

처음에는 명제논리와 정리 적용을 지원한다. 임의의 Lean 코드를 손실 없이
그래프로 왕복 변환하거나, 모든 mathlib 선언을 즉시 편집할 수 있다고 가정하지 않는다.
AI가 제안하는 부분 증명도 동일한 Lean 검사 경로를 거친다.

## 코드 위치

| 경로 | 용도 |
| --- | --- |
| `glean/Glean/Examples.lean` | UI가 구성해야 할 증명 항의 기준 예제 |
| `glean/tests/Smoke.lean` | 초기 패키지의 검증 계약 |
| `glean/scripts/lake` | 프로젝트 도구 실행 진입점 |
| `src/Lean/Elab/` | Lean의 구문 해석·타입 추론 코드 |
| `src/Lean/Meta/` | 표현·타입·목표를 다루는 메타프로그래밍 코드 |
| `src/Lean/Server/` | 편집기 및 언어 서버 연동 코드 |

## 참고

- [Lean 4 upstream](https://github.com/leanprover/lean4)
- [Lean의 명제와 증명](https://lean-lang.org/theorem_proving_in_lean4/Propositions-and-Proofs/)
- [ProofWidgets4](https://github.com/leanprover-community/ProofWidgets4)
- [Paperproof](https://github.com/Paper-Proof/paperproof)

초기 구현은 AI 코딩 도구의 도움을 받아 작성했다.
