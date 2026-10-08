// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
/** Coalesce edits; the caller still owns revision checks and cancellation of running requests. */
export class ComputeGate {
  constructor({run,delay=450}){this.run=run;this.delay=delay;this.mode='manual';this.timer=null;}
  setMode(mode){if(!['manual','auto'].includes(mode))throw new Error('Unknown execution mode');this.cancel();this.mode=mode;}
  changed(){this.cancel();this.timer=setTimeout(()=>{this.timer=null;this.run(this.mode==='auto'?'kernel':'preview');},this.delay);}
  cancel(){clearTimeout(this.timer);this.timer=null;}
  dispose(){this.cancel();}
}
