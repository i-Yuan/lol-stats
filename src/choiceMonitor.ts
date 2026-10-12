import type { ChampionChoiceSnapshot } from './types'
// Single-flight polling; lifecycle generations invalidate responses even after restart.
export function createChoiceMonitor(
 read:()=>Promise<ChampionChoiceSnapshot|null>,
 scope:()=>string,
 publish:(snapshot:ChampionChoiceSnapshot|null,error:string)=>void,
) {
 let generation=0,active=false,busy=false
 return {
  start(){active=true;generation++},
  stop(){active=false;generation++},
  async tick(){
   if(!active||busy)return
   const epoch=generation,key=scope();busy=true
   try{
    const value=await read()
    if(active&&epoch===generation&&key===scope())publish(value,'')
   }catch{
    if(active&&epoch===generation&&key===scope())publish(null,'选人快照刷新失败，请以客户端为准')
   }finally{busy=false}
  },
 }
}
