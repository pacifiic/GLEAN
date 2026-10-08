// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {sourcePosition,positionOffset} from './document.mjs';
const element=(tag,text,className='')=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
export function bodyOffset(source,line,column,encoding='unicode'){
 const row=source.split('\n')[Math.max(0,line-1)]??'',character=encoding==='unicode'?[...row].slice(0,Math.max(0,column-1)).join('').length:Math.max(0,column-1);return positionOffset(source,line-1,character);
}
export function initCodeEditor({host,source,onChange,queryContext=async()=>({}),cancelContext=()=>{}}){
 let queryGeneration=0,folded=false;const tools=element('div',undefined,'typed-code-tools'),search=element('input'),line=element('input'),area=element('div',undefined,'typed-code-area'),numbers=element('pre',undefined,'typed-code-lines'),code=element('textarea'),outline=element('div',undefined,'typed-code-outline'),diagnostics=element('div',undefined,'typed-code-diagnostics'),goals=element('pre',undefined,'typed-code-goals');
 code.className='typed-code-full';code.value=source;code.spellcheck=false;code.setAttribute('aria-label','Lean 코드 본문');search.type='search';search.placeholder='본문 검색';search.setAttribute('aria-label','본문 검색');line.type='number';line.min='1';line.value='1';line.setAttribute('aria-label','본문 줄 번호');
 const button=(text,action)=>{const node=element('button',text,'button quiet small');node.type='button';node.addEventListener('click',action);return node;};
 function unfold(){folded=false;outline.hidden=true;area.hidden=false;}
 function jump(row,column=1,encoding='unicode'){unfold();const offset=bodyOffset(code.value,row,column,encoding);code.setSelectionRange?.(offset,offset);code.selectionStart=offset;code.focus?.();code.scrollTop=Math.max(0,(row-1)*22-(code.clientHeight??160)/2);line.value=String(row);}
 function updateNumbers(){numbers.textContent=code.value.split('\n').map((_,i)=>i+1).join('\n');numbers.scrollTop=code.scrollTop;}
 function fold(){folded=!folded;if(!folded){unfold();return;}area.hidden=true;outline.hidden=false;outline.replaceChildren();const rows=code.value.split('\n');let start=0;
  while(start<rows.length){const current=start,indent=rows[start].match(/^\s*/)[0].length;let end=start+1;if(rows[start].trim()&&end<rows.length&&rows[end].match(/^\s*/)[0].length>indent)while(end<rows.length&&(!rows[end].trim()||rows[end].match(/^\s*/)[0].length>indent))end++;
   if(end-start>1){const group=element('details'),summary=element('summary',`L${start+1}–${end} · ${rows[start].trim()}`);group.open=true;group.append(summary,element('pre',rows.slice(start+1,end).join('\n')),button('이 위치 편집',()=>jump(current+1)));outline.append(group);}else outline.append(element('pre',`L${start+1}  ${rows[start]}`));start=end;
  }
 }
 const read=button('커서의 Lean 목표',async()=>{const generation=++queryGeneration,body=code.value,offset=code.selectionStart??0;read.disabled=true;cancel.hidden=false;goals.hidden=false;goals.textContent='실제 Lean 문맥 조회 중 · 검증 결과와 별도';const current=()=>generation===queryGeneration&&body===code.value;
  try{const result=await queryContext(body,sourcePosition(body,offset),current);if(current())goals.textContent='실제 Lean 목표 · 분석 관찰\n'+((result?.structuredGoals??[]).map(goal=>(goal.hypotheses??[]).map(h=>(h.name??(h.names??[]).join(' '))+' : '+h.type).join('\n')+'\n⊢ '+goal.type).join('\n\n')||result?.renderedGoals||'이 위치에는 열린 목표가 없습니다.');}catch(error){if(current())goals.textContent=error.message;}finally{if(generation===queryGeneration){read.disabled=false;cancel.hidden=true;}}
 });
 const cancel=button('문맥 조회 중단',()=>{queryGeneration++;read.disabled=false;cancel.hidden=true;cancelContext();goals.textContent='문맥 조회 중단됨 · 본문은 보관됩니다.';});cancel.hidden=true;goals.hidden=true;outline.hidden=true;
 tools.append(search,button('다음 찾기',()=>{const needle=search.value;if(!needle)return;const start=(code.selectionEnd??0),found=code.value.indexOf(needle,start),index=found<0?code.value.indexOf(needle):found;if(index>=0){const pos=sourcePosition(code.value,index);jump(pos.line+1,pos.character+1,'utf16');code.setSelectionRange?.(index,index+needle.length);}}),line,button('줄 이동',()=>jump(Number(line.value)||1)),button('들여쓰기 접기',fold),read,cancel);
 code.addEventListener('input',()=>{queryGeneration++;cancelContext();read.disabled=false;cancel.hidden=true;goals.textContent='본문 변경 · 커서의 목표를 다시 읽어 주세요.';updateNumbers();onChange(code.value);});code.addEventListener('scroll',()=>numbers.scrollTop=code.scrollTop);area.append(numbers,code);host.append(tools,area,outline,diagnostics,goals);updateNumbers();
 return{code,jump,updateDiagnostics(items){diagnostics.replaceChildren();for(const d of items??[]){const row=element('div',undefined,'diagnostic error');row.append(element('span',d.message),button(`본문 L${d.bodyLine}:${d.bodyColumn} ↗`,()=>jump(d.bodyLine,d.bodyColumn,d.columnEncoding)));diagnostics.append(row);}},destroy(){queryGeneration++;cancelContext();}};
}
