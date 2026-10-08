// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
const phases={preparing:'Lean 환경 준비','source-context-elaboration':'원문 모듈 컴파일',elaborating:'그래프 컴파일','expected-signature-elaboration':'목표 시그니처 컴파일','kernel-audit':'독립 커널·공리 재검사'};
export function graphProgress(snapshot){
 if(!snapshot||!['queued','running'].includes(snapshot.status))return null;
 const elapsed=Math.max(0,Math.floor((Number(snapshot.lean?.durationMs)||0)/1000)),budget=snapshot.timeoutSeconds;
 return{title:phases[snapshot.phase]??'Lean 검사 진행 중',detail:`${elapsed}초 경과 · ${Number.isFinite(budget)&&budget>0?'총 제한 '+budget+'초':'제한 미확정'} · 모든 단계가 끝난 뒤 검증 결과를 표시합니다.`};
}
