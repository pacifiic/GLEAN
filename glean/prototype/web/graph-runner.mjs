// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
const terminal=new Set(['valid','invalid','incomplete','error','cancelled']);
export class GraphRunner {
 constructor({post,pause=ms=>new Promise(r=>setTimeout(r,ms))}){this.post=post;this.pause=pause;this.generation=0;this.job=null;this.closing=Promise.resolve();}
 cancel(){this.generation++;const job=this.job;this.job=null;if(job)this.closing=this.closing.catch(()=>{}).then(()=>this.post('/api/graph/check/cancel',{jobId:job})).catch(()=>{});return this.closing;}
 async run(request,deliver,onProgress=()=>{}){const closing=this.cancel(),token=this.generation;await closing;if(token!==this.generation)return;let data=await this.post('/api/graph/check/start',request);
   if(token!==this.generation){if(data?.jobId)await this.post('/api/graph/check/cancel',{jobId:data.jobId});return;}
   if(!data?.jobId||terminal.has(data.status)){deliver(data);return;}this.job=data.jobId;onProgress(data);
   while(token===this.generation&&!terminal.has(data.status)){await this.pause(220);if(token!==this.generation)return;data=await this.post('/api/graph/check/poll',{jobId:this.job});if(!data)throw new Error('검사 작업이 만료되었습니다.');if(token===this.generation&&!terminal.has(data.status))onProgress(data);}
   if(token===this.generation){this.job=null;deliver(data);}
 }
}
