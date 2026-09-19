/* Supabase workout service: only columns confirmed by the owner's schema export. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(require('./assessments.js'));
  else root.CoachWorkouts=factory(root.CoachAssessments);
})(typeof window==='object'?window:globalThis,function(A){
  'use strict';
  const columns={
    workout_plans:'id,student_id,trainer_id,name,objective,active,created_at,start_date,end_date',
    workouts:'id,plan_id,name,position',
    exercises:'id,workout_id,name,sets,reps,rest_seconds,notes,position,target_weight,target_rir',
    workout_sessions:'id,student_id,workout_id,started_at,finished_at,notes',
    set_logs:'id,session_id,exercise_id,set_number,weight,reps,rir,completed,notes'
  };
  const fail=(text,field)=>Object.assign(new Error(text),{code:'WORKOUT',field});
  function number(value,label,{required=false,integer=false,min=0,max=Infinity}={}){
    const raw=String(value??'').trim();
    if(!raw&&!required)return null;
    if(!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw))throw fail(`${label}: indica um número sem valores negativos, com vírgula ou ponto decimal.`);
    const n=Number(raw.replace(',','.'));
    if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw fail(`${label}: indica ${integer?'um inteiro':'um número'} entre ${min} e ${max===Infinity?'um valor válido':max}.`);
    return n;
  }
  const text=value=>String(value??'').trim()||null;
  function named(value){const name=text(value);if(!name)throw fail('Preenche o nome.','name');return name;}
  function date(value){const raw=text(value);if(!raw)return null;const d=new Date(raw+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||raw.startsWith('0000-')||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==raw)throw fail('Indica uma data válida.');return raw;}
  function planValues(v){
    const start_date=date(v.start_date),end_date=date(v.end_date);
    if(start_date&&end_date&&end_date<start_date)throw fail('A data de fim não pode ser anterior à data de início.');
    return {name:named(v.name),objective:text(v.objective),start_date,end_date,active:v.active===true||v.active==='true'};
  }
  const workoutValues=v=>({name:named(v.name),position:number(v.position,'Ordem',{required:true,integer:true,min:1,max:2147483647})});
  function exerciseValues(v){
    const reps=String(v.reps??'').trim();
    if(!/^\d+(?:\s*[-–]\s*\d+)?$/.test(reps))throw fail('Repetições alvo: usa um inteiro ou intervalo, por exemplo 8–12.');
    const range=reps.split(/[-–]/).map(n=>number(n,'Repetições alvo',{required:true,integer:true,min:1,max:2147483647}));
    if(range.length===2&&range[1]<range[0])throw fail('O intervalo de repetições deve estar em ordem crescente.');
    return {...workoutValues(v),sets:number(v.sets,'Séries',{required:true,integer:true,min:1,max:100}),reps,
      target_weight:number(v.target_weight,'Carga alvo'),target_rir:number(v.target_rir,'RIR alvo'),
      rest_seconds:number(v.rest_seconds,'Descanso',{integer:true,max:2147483647}),notes:text(v.notes)};
  }
  const logValues=v=>({weight:number(v.weight,'Carga (kg)',{required:true}),reps:number(v.reps,'Repetições',{required:true,integer:true,min:1,max:2147483647}),rir:number(v.rir,'RIR'),notes:text(v.notes),completed:true});
  function check(current){if(!current())throw fail('A página ou sessão mudou. Abre novamente o treino.');}
  async function all(query){const rows=[];for(let offset=0;;offset+=500){const {data,error}=await query().range(offset,offset+499);if(error)throw error;if(!Array.isArray(data))throw fail('Resposta inválida do Supabase.');rows.push(...data);if(data.length<500)return rows;}}
  async function one(query){const {data,error}=await query.maybeSingle();if(error)throw error;if(!data)throw fail('O registo não está disponível ou não tens acesso.');return data;}
  const select=(c,t)=>c.from(t).select(columns[t]);
  const isCoach=a=>a&&['trainer','admin'].includes(a.role);
  function own(a,s){if(a?.role!=='student'||a.id!==s)throw fail('Só o próprio aluno pode registar o treino.');}
  async function access(c,a,s,writing=false){await A.assertAccess(c,a,s,writing);}
  async function plans(c,a,s){await access(c,a,s);return all(()=>select(c,'workout_plans').eq('student_id',s).order('created_at',{ascending:false}).order('id'));}
  async function plan(c,a,s,id,writing=false){await access(c,a,s,writing);return one(select(c,'workout_plans').eq('id',id).eq('student_id',s));}
  async function workout(c,a,s,id,writing=false){
    await access(c,a,s,writing);
    const w=await one(select(c,'workouts').eq('id',id));
    const p=await plan(c,a,s,w.plan_id,writing);
    return {workout:w,plan:p,exercises:await all(()=>select(c,'exercises').eq('workout_id',id).order('position',{nullsFirst:false}).order('id'))};
  }
  async function planDetail(c,a,s,id){const p=await plan(c,a,s,id);return {plan:p,workouts:await all(()=>select(c,'workouts').eq('plan_id',id).order('position',{nullsFirst:false}).order('id'))};}
  async function insert(c,table,payload,scope){
    const {error}=await c.from(table).insert(payload);
    if(error&&error.code!=='23505')throw error;
    // Same UUID is retained on retries. Never overwrite an existing row.
    const row=await one(scope(select(c,table).eq('id',payload.id)));
    if(error)return {row,recovered:true};
    return {row,recovered:false};
  }
  async function createPlan(c,a,s,v,id,current=()=>true){const values=planValues(v);await access(c,a,s,true);check(current);return insert(c,'workout_plans',{...values,id,student_id:s,trainer_id:a.id},q=>q.eq('student_id',s));}
  async function setActive(c,a,s,id,active,current=()=>true){await plan(c,a,s,id,true);check(current);const {data,error}=await c.from('workout_plans').update({active:!!active}).eq('id',id).eq('student_id',s).select(columns.workout_plans);if(error)throw error;if(!data?.length)throw fail('Não foi possível atualizar o estado do plano.');return data[0];}
  async function createWorkout(c,a,s,planId,v,id,current=()=>true){const values=workoutValues(v);await plan(c,a,s,planId,true);check(current);return insert(c,'workouts',{...values,id,plan_id:planId},q=>q.eq('plan_id',planId));}
  async function createExercise(c,a,s,workoutId,v,id,current=()=>true){const values=exerciseValues(v);await workout(c,a,s,workoutId,true);check(current);return insert(c,'exercises',{...values,id,workout_id:workoutId},q=>q.eq('workout_id',workoutId));}
  function available(p,today){return p.active===true&&(!p.start_date||p.start_date<=today)&&(!p.end_date||p.end_date>=today);}
  async function start(c,a,s,workoutId,id,today,current=()=>true){
    own(a,s);const detail=await workout(c,a,s,workoutId);
    if(!available(detail.plan,today))throw fail('Este plano está inativo ou fora do período definido.');
    if(!detail.exercises.length||detail.exercises.some(e=>!Number.isInteger(e.sets)||e.sets<1||e.sets>100))throw fail('O treinador precisa de definir os exercícios e séries deste treino.');
    const existing=await all(()=>select(c,'workout_sessions').eq('student_id',s).eq('workout_id',workoutId).is('finished_at',null).order('started_at',{ascending:false}).order('id'));
    if(existing.length)return existing[0];
    check(current);return (await insert(c,'workout_sessions',{id,student_id:s,workout_id:workoutId},q=>q.eq('student_id',s))).row;
  }
  async function session(c,a,s,id){
    await access(c,a,s);const row=await one(select(c,'workout_sessions').eq('id',id).eq('student_id',s));
    const detail=row.workout_id?await workout(c,a,s,row.workout_id):null;
    const logs=await all(()=>select(c,'set_logs').eq('session_id',id).order('set_number').order('id'));
    return {session:row,detail,logs};
  }
  // A reproducible UUID per prescribed set prevents duplicates across retries/tabs.
  async function logId(sessionId,exerciseId,setNumber,cryptoApi){
    const bytes=new Uint8Array(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(`${sessionId}:${exerciseId}:${setNumber}`))).slice(0,16);
    bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
    const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }
  async function saveSet(c,a,s,sessionId,exerciseId,setNumber,v,id,current=()=>true){
    own(a,s);const values=logValues(v);const ctx=await session(c,a,s,sessionId);
    if(ctx.session.finished_at)throw fail('Esta sessão já foi concluída.');
    const exercise=ctx.detail?.exercises.find(e=>e.id===exerciseId);
    if(!exercise||!Number.isInteger(setNumber)||setNumber<1||setNumber>exercise.sets)throw fail('Esta série não pertence ao treino da sessão.');
    const existing=ctx.logs.find(l=>l.exercise_id===exerciseId&&l.set_number===setNumber);
    if(existing)return {row:existing,recovered:true};
    check(current);return insert(c,'set_logs',{...values,id,session_id:sessionId,exercise_id:exerciseId,set_number:setNumber},q=>q.eq('session_id',sessionId).eq('exercise_id',exerciseId));
  }
  async function finish(c,a,s,id,notes,current=()=>true){
    own(a,s);const ctx=await session(c,a,s,id);
    if(ctx.session.finished_at)return ctx.session;
    const ex=ctx.detail?.exercises;
    if(!ex?.length||ex.some(e=>!Number.isInteger(e.sets)||e.sets<1||e.sets>100||Array.from({length:e.sets},(_,i)=>i+1).some(n=>!ctx.logs.some(l=>l.exercise_id===e.id&&l.set_number===n&&l.completed===true))))throw fail('Guarda todas as séries antes de concluir o treino.');
    check(current);const {error}=await c.from('workout_sessions').update({finished_at:new Date().toISOString(),notes:text(notes)}).eq('id',id).eq('student_id',s).is('finished_at',null);
    if(error)throw error;
    const row=await one(select(c,'workout_sessions').eq('id',id).eq('student_id',s));
    if(!row.finished_at)throw fail('Não foi possível confirmar a conclusão. Tenta novamente.');return row;
  }
  async function history(c,a,s){
    await access(c,a,s);const sessions=await all(()=>select(c,'workout_sessions').eq('student_id',s).order('started_at',{ascending:false,nullsFirst:false}).order('id'));
    const logs=[];for(let i=0;i<sessions.length;i+=100){const ids=sessions.slice(i,i+100).map(r=>r.id);logs.push(...await all(()=>select(c,'set_logs').in('session_id',ids).order('id')));}
    return {sessions,logs};
  }
  function progress(history,exerciseId,excludeSession){
    const sessions=new Map(history.sessions.filter(s=>s.finished_at&&s.id!==excludeSession).map(s=>[s.id,s]));
    const logs=history.logs.filter(l=>l.exercise_id===exerciseId&&l.completed===true&&sessions.has(l.session_id))
      .map(l=>({...l,date:sessions.get(l.session_id).started_at})).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||a.session_id.localeCompare(b.session_id)||a.set_number-b.set_number||a.id.localeCompare(b.id));
    let best=null;
    for(const log of logs){const weight=log.weight===null?null:Number(log.weight);log.pr=weight!==null&&Number.isFinite(weight)&&best!==null&&weight>best;if(weight!==null&&Number.isFinite(weight))best=best===null?weight:Math.max(best,weight);}
    return {best,last:logs.at(-1)||null,logs:logs.reverse()};
  }
  const message=(error,operation)=>error?.code==='WORKOUT'?error.message:A.message(error,operation);
  return {columns,number,date,planValues,workoutValues,exerciseValues,logValues,available,plans,planDetail,workout,createPlan,setActive,createWorkout,createExercise,start,session,saveSet,finish,history,progress,logId,message,isCoach};
});
