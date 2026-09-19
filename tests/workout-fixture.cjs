const W=require('../workouts.js');
const trainer={id:'00000000-0000-4000-8000-000000000001',role:'trainer',full_name:'Treinador Teste'};
const maria={id:'00000000-0000-4000-8000-000000000002',role:'student',full_name:'Maria'};
const other={id:'00000000-0000-4000-8000-000000000003',role:'student',full_name:'Outro aluno'};
function fixture(){
 const tables={profiles:[trainer,maria,other],trainer_students:[{trainer_id:trainer.id,student_id:maria.id,active:true}],assessments:[],...Object.fromEntries(Object.keys(W.columns).map(t=>[t,[]]))};
 const state={actor:trainer,deny:null,lose:null,calls:[],tables};
 const ownsPlan=id=>tables.workout_plans.find(p=>p.id===id)?.student_id;
 const ownsWorkout=id=>ownsPlan(tables.workouts.find(w=>w.id===id)?.plan_id);
 const associated=s=>tables.trainer_students.some(r=>r.student_id===s&&r.trainer_id===state.actor.id&&r.active);
 function allowed(table,row,write){
  const a=state.actor;
  if(table==='profiles')return !write&&(row.id===a.id||associated(row.id));
  if(table==='trainer_students')return !write&&(row.trainer_id===a.id||row.student_id===a.id);
  if(table==='assessments')return !write&&(row.student_id===a.id||associated(row.student_id));
  if(table==='workout_plans')return write?associated(row.student_id):row.student_id===a.id||associated(row.student_id);
  if(table==='workouts')return write?associated(ownsPlan(row.plan_id)):ownsPlan(row.plan_id)===a.id||associated(ownsPlan(row.plan_id));
  if(table==='exercises')return write?associated(ownsWorkout(row.workout_id)):ownsWorkout(row.workout_id)===a.id||associated(ownsWorkout(row.workout_id));
  if(table==='workout_sessions')return write?row.student_id===a.id&&ownsWorkout(row.workout_id)===a.id:row.student_id===a.id||associated(row.student_id);
  if(table==='set_logs'){
   const s=tables.workout_sessions.find(s=>s.id===row.session_id),e=tables.exercises.find(e=>e.id===row.exercise_id);
   return write?s?.student_id===a.id&&e?.workout_id===s.workout_id&&ownsWorkout(s.workout_id)===a.id:s&&(s.student_id===a.id||associated(s.student_id));
  }
  return false;
 }
 state.execute=q=>{
  state.calls.push(q);const table=q.table,deny={code:'42501',message:'new row violates row-level security policy'};
  if(state.deny===table)return {error:deny,data:null};
  const match=r=>q.filters.every(([k,op,v])=>op==='in'?v.includes(r[k]):op==='is'?r[k]===v:r[k]===v);
  if(q.insert){
   const items=Array.isArray(q.insert)?q.insert:[q.insert];
   if(items.some(r=>!allowed(table,r,true)))return {error:deny};
   if(items.some(r=>tables[table].some(x=>x.id===r.id)))return {error:{code:'23505',message:'duplicate key'}};
   for(const row of items){for(const col of Object.keys(row))if(!W.columns[table].split(',').includes(col))throw Error('Unknown schema column '+col);tables[table].push({...(table==='workout_sessions'?{started_at:new Date().toISOString(),finished_at:null,notes:null}:{}),...(table==='workout_plans'?{created_at:new Date().toISOString()}:{}),...row});}
   if(state.lose===table){state.lose=null;throw Error('Lost response after commit');}
   return {data:null,error:null};
  }
  if(q.update){
   if(['set_logs','exercises','workouts'].includes(table))return {error:deny};
   const rows=tables[table].filter(match).filter(r=>allowed(table,r,true));
   if(rows.some(r=>!allowed(table,{...r,...q.update},true)))return {error:deny};
   rows.forEach(r=>Object.assign(r,q.update));return {data:rows,error:null};
  }
  let rows=tables[table].filter(match).filter(r=>allowed(table,r,false));
  rows=[...rows].sort((a,b)=>{for(const [key,opt]of q.orders){let result;if(a[key]==null&&b[key]!=null)result=opt.nullsFirst?-1:1;else if(b[key]==null&&a[key]!=null)result=opt.nullsFirst?1:-1;else {result=typeof a[key]==='number'?a[key]-b[key]:String(a[key]??'').localeCompare(String(b[key]??''));if(opt.ascending===false)result=-result;}if(result)return result;}return 0;});
  if(q.range)rows=rows.slice(q.range[0],q.range[1]+1);
  return {data:q.single?rows[0]||null:rows,error:null};
 };
 state.client={from(table){const q={table,filters:[],orders:[]};const b={select(){return b;},eq(k,v){q.filters.push([k,'eq',v]);return b;},is(k,v){q.filters.push([k,'is',v]);return b;},in(k,v){q.filters.push([k,'in',v]);return b;},order(k,o={}){q.orders.push([k,o]);return b;},range(a,z){q.range=[a,z];return b;},maybeSingle(){q.single=true;return b;},insert(v){q.insert=v;return b;},update(v){q.update=v;return b;},then(resolve,reject){return Promise.resolve().then(()=>state.execute(q)).then(resolve,reject);}};return b;}};
 return state;
}
module.exports={fixture,trainer,maria,other};
