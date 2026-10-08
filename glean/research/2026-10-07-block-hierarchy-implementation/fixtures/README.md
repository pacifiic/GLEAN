# 장문 코드 수락 입력

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

- [64KiB급 그래프](code-body-64k.glean.json), [그 본문](code-body-64k.term): 65,530bytes, 1,193행.
- [1MiB급 그래프](code-body-1m.glean.json), [그 본문](code-body-1m.term): 1,048,483bytes, 10,281행.

두 본문은 `n : Nat` 입력으로 실제 `n + 0 = n` 보조증명을 반복 생성하고 마지막에
`exact Nat.add_zero n`을 사용한다. 주석·공백만 늘린 fixture가 아니다. `.term`은 term/`by`
슬롯에 넣을 자료이며 import/최상위 정리를 가진 전체 Lean 파일과 구별한다.

초기 제품 compiler의 8KiB 한도에서 거부된다. 독립 standalone Lean 4.34.1 대조에서는
두 본문이 기본 자원 설정으로 각각 약 2.57초/22.85초에 컴파일되고 공리 없음으로 확인됐다.
64KiB 본문의 잘못된 마지막 단계는 실제 타입 불일치로 거부됐다. 이것은 제품 전체 경로
검증의 완료를 뜻하지 않는다.
전체 경로 한도 확장 후 실제 양성·틀린 마지막 단계·정확한 내부 진단·취소·저장/복구를
각각 확인해야 한다. JSON escaping과 wrapper 비용은 본문 bytes와 별도로 계산한다.

- [corrupt-presentation.glean.json](corrupt-presentation.glean.json)은 유효 mixed proof에 손상된 root 표현과 original marker를 붙인 native S02 입력이다.
- [legacy-v1.glean.json](legacy-v1.glean.json), [legacy-v2-group.glean.json](legacy-v2-group.glean.json)은 기존 compose 증명을 원래 v1 및 legacy v2 group 형식으로 보존한다.
- [declarations-1000.lean](declarations-1000.lean)은 65,203bytes/1,000개의 명시적 Nat 보조정리다. standalone Lean compile exit 0으로 원문의 문법/증명을 확인했다. [expected manifest](declarations-1000.expected.json)는 adapter가 앞으로 대조할 기대 이름/타입/직접 의존이며 실제 adapter 출력으로 세지 않는다.
