(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.CoachStudentDashboard=api;root.mountStudentDashboard=api.mount;}
})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,u='')=>n==null?'—':Number(n).toLocaleString('pt-PT',{maximumFractionDigits:1})+(u?' '+u:'');
  const litres=ml=>ml==null?'—':(Number(ml)/1000).toLocaleString('pt-PT',{maximumFractionDigits:2})+' L';
  function dayOf(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function bounds(day){const d=new Date(day+'T00:00:00'),end=new Date(d);end.setDate(d.getDate()+1);return [d.toISOString(),end.toISOString()];}
  async function rows(build){const out=[];for(let n=0;;n+=500){const r=await build().range(n,n+499);if(r.error)throw r.error;if(!Array.isArray(r.data))throw Error('Resposta inválida.');out.push(...r.data);if(r.data.length<500)return out;}}
  const sum=(rs,key)=>rs.reduce((s,r)=>s+(Number(r[key])||0),0);
  function nutrition(plans,targets,day){
    const plan=plans.find(p=>p.status==='approved'&&p.week_start<=day&&p.week_end>=day);
    const date=plan?.days?.find(d=>d.day_date===day);
    const items=(date?.meals||[]).flatMap(m=>m.items||[]);
    const target=plan?.target||targets.find(t=>t.effective_from<=day&&(!t.effective_until||t.effective_until>=day));
    return {target,plan,meals:date?.meals||[],hasMeals:items.length>0,totals:items.length?Object.fromEntries(['kcal','protein_g','fat_g','carbohydrate_g'].map(k=>[k,sum(items,k)])):null};
  }
  function hydrationGoal(n,assessments=[]){
    const explicit=n?.target?.final_water_ml??n?.target?.calculated_water_ml;
    if(Number(explicit)>0)return {ml:Number(explicit),estimated:false};
    const latest=assessments.find(a=>Number(a.weight)>0&&Number(a.weight)<=500);
    return latest?{ml:Math.ceil(Number(latest.weight)*35/250)*250,estimated:true,weight:Number(latest.weight),date:latest.assessment_date}:null;
  }
  function sequence(workouts,sessions){
    const sorted=[...workouts].sort((a,b)=>(a.position??Infinity)-(b.position??Infinity)||a.id.localeCompare(b.id));
    const active=sessions.find(s=>!s.finished_at);
    const last=sessions.find(s=>s.finished_at&&sorted.some(w=>w.id===s.workout_id));
    const activeIndex=sorted.findIndex(w=>w.id===active?.workout_id);
    const start=activeIndex>=0?activeIndex:last?(sorted.findIndex(w=>w.id===last.workout_id)+1)%Math.max(sorted.length,1):0;
    const queue=[...sorted.slice(start),...sorted.slice(0,start)];
    const current=active?sorted.find(w=>w.id===active.workout_id)||{id:active.workout_id,name:'Treino em curso'}:queue[0];
    return {current,session:active,upcoming:queue.filter(w=>w.id!==current?.id).slice(0,3)};
  }
  async function load(client,account,W,day,studentId=account.id){
    const isStudent=account?.role==='student';
    if((isStudent&&studentId!==account.id)||!['student','trainer','admin'].includes(account?.role))throw Error('Este painel pertence ao aluno.');
    // Validate the association before any student data is requested.
    const permittedPlans=isStudent?null:await W.plans(client,account,studentId);
    const s=studentId,[from,to]=bounds(day);
    const week=new Date(day+'T12:00:00');week.setDate(week.getDate()-6);const weekStart=dayOf(week);
    const results=await Promise.allSettled([
      (async()=>{if(!isStudent)return {restricted:true,ml:null,rows:[]};const [modern,legacy]=await Promise.all([
        rows(()=>client.from('hydration_logs').select('id,amount_ml,logged_at').eq('student_id',s).eq('local_date',day).order('id')),
        rows(()=>client.from('water_logs').select('id,amount_ml,logged_at').eq('student_id',s).gte('logged_at',from).lt('logged_at',to).order('id'))]);
        const ids=new Set(modern.map(r=>r.id)),logs=[...modern,...legacy.filter(r=>!ids.has(r.id))];return {ml:sum(logs,'amount_ml'),rows:logs};})(),
      (async()=>{const [plans,targets]=await Promise.all([
        rows(()=>client.from('meal_plans').select('id,name,status,week_start,week_end,target:nutrition_targets!meal_plans_nutrition_target_id_fkey(final_calorie_target,protein_g,fat_g,carbohydrate_g,final_water_ml,calculated_water_ml),days:meal_plan_days(day_date,meals:meal_plan_meals(id,name,position,scheduled_time,notes,items:meal_plan_items(id,display_name,quantity,unit,grams,position,kcal,protein_g,fat_g,carbohydrate_g)))').eq('student_id',s).eq('status','approved').lte('week_start',day).gte('week_end',day).order('approved_at',{ascending:false}).order('id')),
        rows(()=>client.from('nutrition_targets').select('id,effective_from,effective_until,final_calorie_target,protein_g,fat_g,carbohydrate_g,final_water_ml,calculated_water_ml').eq('student_id',s).lte('effective_from',day).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).order('id'))]);const n=nutrition(plans,targets,day);n.waterGoal=hydrationGoal(n);
        if(!n.waterGoal){try{const assessments=await rows(()=>client.from('assessments').select('id,weight,assessment_date,created_at').eq('student_id',s).lte('assessment_date',day).order('assessment_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}));n.waterGoal=hydrationGoal(n,assessments);}catch{n.waterGoalError=true;}}
        return n;})(),
      (async()=>{const plans=permittedPlans||await W.plans(client,account,s),plan=plans.find(p=>W.available(p,day));
        const [detail,sessions]=await Promise.all([plan?W.planDetail(client,account,s,plan.id):null,rows(()=>client.from('workout_sessions').select('id,workout_id,started_at,finished_at').eq('student_id',s).order('started_at',{ascending:false}).order('id'))]);
        const seq=sequence(detail?.workouts||[],sessions);const currentDetail=seq.current?await W.workout(client,account,s,seq.current.id):null;
        return {plan,...seq,workouts:detail?.workouts||[],exercises:currentDetail?.exercises||[],completed:sessions.filter(r=>r.finished_at&&new Date(r.finished_at)>=new Date(from)&&new Date(r.finished_at)<new Date(to)).length};})(),
      (async()=>{const data=await rows(()=>client.from('cardio_logs').select('id,type,duration_minutes,cardio_date,created_at').eq('student_id',s).gte('cardio_date',weekStart).lte('cardio_date',day).order('created_at',{ascending:false}).order('id'));const today=data.filter(r=>r.cardio_date===day);return {minutes:sum(today,'duration_minutes'),rows:today,week:data};})()
    ]);
    return Object.fromEntries(['water','nutrition','training','cardio'].map((k,i)=>[k,results[i].status==='fulfilled'?results[i].value:{error:true}]));
  }
  async function save(client,account,kind,payload,current=()=>true){
    if(account?.role!=='student'||!current())throw Error('A sessão mudou. Reabre o painel.');
    const hydration=kind==='water';if(!hydration&&kind!=='cardio')throw Error('Registo inválido.');
    const amount=Number(hydration?payload.amount_ml:payload.duration_minutes);
    if(!Number.isInteger(amount)||(hydration?![250,330,500,1000].includes(amount):amount<1||amount>1440))throw Error(hydration?'Escolhe 250, 330, 500 ou 1000 ml.':'Indica uma duração entre 1 e 1440 minutos.');
    if(!hydration&&!['Caminhada','Corrida','Bicicleta','Outro'].includes(payload.type))throw Error('Seleciona o tipo de atividade.');
    const table=hydration?'hydration_logs':'cardio_logs';
    const values=hydration?{id:payload.id,student_id:account.id,local_date:payload.day,amount_ml:amount}:{id:payload.id,student_id:account.id,cardio_date:payload.day,type:payload.type,duration_minutes:amount};
    const result=await client.from(table).insert(values);
    if(result.error){
      // A lost response can still represent a successful insert. Retry the same UUID only.
      const check=await client.from(table).select('*').eq('id',payload.id).eq('student_id',account.id).maybeSingle();
      if(check.error||!check.data||Object.keys(values).some(k=>String(check.data[k])!==String(values[k])))throw result.error;
    }
    return values;
  }
  const paths={water:'M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z M8 15c0 2 1 3 3 4',nutrition:'M4 3v6a3 3 0 0 0 6 0V3 M7 3v19 M17 22V3c-4 3-4 10 0 10',training:'M3 8v8 M6 5v14 M18 5v14 M21 8v8 M6 12h12',cardio:'M20 4c-3-2-6 0-8 2-2-2-5-4-8-2-5 4 0 10 8 17 8-7 13-13 8-17Z M4 12h4l2-4 3 8 2-4h5',home:'M3 11 12 3l9 8v10h-6v-7H9v7H3Z',back:'M15 4 7 12l8 8 M7 12h15',calendar:'M4 5h16v16H4Z M8 2v6 M16 2v6 M4 10h16 M8 14h3',bell:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Z M10 21h4 M12 2v2',glass:'M6 3h12l-2 18H8Z M8 8h8',walk:'M14 4h.01 M13 8l-3 5 4 3 1 6 M10 13l-3 7 M13 8l3 4h4 M10 9 6 12',bike:'M7 9h9l3 9 M7 9l5 9h-8l5-12 M14 5h4 M6 15a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M19 15a4 4 0 1 0 0 8 4 4 0 0 0 0-8',more:'M4 12h.01 M12 12h.01 M20 12h.01',play:'M8 4v16l12-8Z',fire:'M12 2c2 6-4 7-2 11 2-1 3-3 4-4 7 8 3 13-2 13-7 0-10-7-4-13 0 4 2 4 2 4'};
  const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(paths[k]||paths.more).split(' M').map((p,i)=>`<path d="${i?'M':''}${p}"/>`).join('')}</svg>`;
  const sorted=a=>[...(a||[])].sort((a,b)=>(a.position||0)-(b.position||0));
  function mount(container,{client,account,studentId=account.id,studentName=account.full_name||'Aluno',valid,open,openTraining,back,initialScreen='home'}){
    const W=window.CoachWorkouts,own=account.role==='student'&&account.id===studentId;
    let data=null,busy=false,pending=null,revision=0,day=dayOf(),screen=initialScreen,moreOpen=false,tab='today',chosen=null,cardioType='Caminhada';
    const current=()=>container.isConnected&&valid();
    const btn=(label,action,attrs='',cls='')=>`<button type="button" class="sd-button ${cls}" data-sd="${action}" ${attrs}>${label}</button>`;
    const progress=(v,g,color)=>g>0&&v!=null?`<progress class="sd-progress ${color}" value="${Math.min(v,g)}" max="${g}" aria-label="${esc(fmt(v)+' de '+fmt(g))}"></progress>`:'';
    const empty=text=>`<p class="sd-empty">${text}</p>`;
    const heading=(title,link='',action='')=>`<div class="sd-section-heading"><h2>${title}</h2>${link?btn(link+' ›',action,'','sd-text'):''}</div>`;
    const tabs=entries=>`<div class="sd-tabs">${entries.map(([id,label])=>btn(label,'tab',`data-tab="${id}" aria-pressed="${tab===id}"`)).join('')}</div>`;
    const waterButtons=()=>`<div class="sd-water-quick">${[250,330,500,1000].map(ml=>btn(`${icon('glass')}<span>+ ${ml===1000?'1.000':ml} ml</span>`,'water-add',`data-ml="${ml}" aria-label="Registar ${ml===1000?'1 litro':ml+' ml'} de água" ${!own||busy?'disabled':''}`)).join('')}</div>`;
    function notice(text,error=false){if(!current())return;const n=container.querySelector('[data-sd-message]');if(n){n.textContent=text;n.setAttribute('role',error?'alert':'status');}}
    function bars(values,labels,unit,color){const max=Math.max(...values,1);return `<div class="sd-chart ${color}" role="img" aria-label="${esc(labels.map((l,i)=>l+': '+fmt(values[i],unit)).join('; '))}">${values.map((v,i)=>`<div><span>${fmt(v)}</span><i style="height:${Math.round(v/max*100)}px"></i><small>${labels[i]}</small></div>`).join('')}</div>`;}
    function main(){
      const w=data?.water,n=data?.nutrition,t=data?.training,c=data?.cardio,goal=n?.waterGoal?.ml??n?.target?.final_water_ml??n?.target?.calculated_water_ml,cal=n?.totals?.kcal;
      const card=(kind,title,text,sub,bar)=>`<article class="sd-card ${kind}"><button class="sd-card-link" type="button" data-sd="${kind}" aria-label="${title}"><span class="sd-icon">${icon(kind)}</span><span class="sd-arrow">›</span><h3>${title}</h3><p class="sd-value">${text}</p>${sub?`<small>${sub}</small>`:''}${bar||''}</button></article>`;
      return `<header class="sd-brand-row"><div class="sd-brand">THE<br><strong>COACH</strong><small>BY SURU</small></div><div>${btn(icon('bell'),'updates','aria-label="Novidades"','sd-icon-button')}<span class="sd-avatar" aria-label="${esc(studentName)}">${esc(studentName[0])}</span></div></header>
        ${!own?`<div class="sd-coach-strip">${btn('‹ Alunos','back-coach','','sd-text')}<span>Vista do aluno · consulta</span></div>`:''}
        <h1 class="sd-greeting">${own?'Olá, ':''}${esc(studentName.split(' ')[0])}</h1><p class="sd-tagline">Disciplina hoje, resultados amanhã.</p>
        <section class="sd-hero"><h2>O teu<br>progresso<br>começa aqui</h2><p>Treina. Alimenta-te.<br>Cuida de ti.</p></section>
        <div class="sd-grid">
        ${card('water','Água',w?.error?'Indisponível':`${litres(w?.ml)} / ${goal?litres(goal):'—'}`,w?.restricted?'Visível na conta do aluno':'',progress(w?.ml,goal,'water'))}
        ${card('nutrition','Nutrição',n?.error?'Indisponível':cal==null?'Sem plano':`${fmt(cal)} / ${fmt(n?.target?.final_calorie_target)} kcal`,'Planeadas para hoje',progress(cal,n?.target?.final_calorie_target,'nutrition'))}
        ${card('training','Plano de treino',esc(t?.current?.name||(!data?'A carregar…':t?.error?'Indisponível':'Sem plano ativo')),t?.session?'Sessão em curso':'Treino atual','')}
        ${card('cardio','Cardio',c?.error?'Indisponível':fmt(c?.minutes,'min'),'Realizados hoje','')}
        </div>
        ${heading('Resumo do dia','Ver tudo','summary')}
        <section class="sd-summary">${[['water',litres(w?.ml),'Água'],['fire',fmt(cal),'kcal planeadas'],['training',fmt(t?.completed),'Treinos'],['cardio',fmt(c?.minutes,'min'),'Cardio']].map(([i,v,l])=>`<div><span class="${i}">${icon(i)}</span><b>${v}</b><small>${l}</small></div>`).join('')}</section>
        ${heading('Próximos treinos','Ver plano','training')}
        <div class="sd-upcoming">${[t?.current,...t?.upcoming||[]].filter(Boolean).slice(0,2).map(workout=>`<button type="button" data-sd="workout-preview" data-id="${esc(workout.id)}"><span class="sd-workout-thumb"></span><span><b>${esc(workout.name)}</b><small>${esc(t?.plan?.name||'Plano de treino')}</small></span><span class="sd-play">${icon('play')}</span></button>`).join('')||empty(data?'Ainda não tens um plano ativo.':'A carregar…')}</div>
        <details class="sd-more" ${moreOpen?'open':''}><summary>Mais acompanhamento</summary>${[['anam','Anamnese'],['evals','Avaliação física'],['progress','Evolução'],['checkin','Check-in semanal'],['plan','Gerir planos de treino'],['nutrition-full','Plano alimentar completo']].map(([a,l])=>btn(l,a)).join('')}${btn('Atualizar','refresh')}${btn('Terminar sessão','logout')}</details>`;
    }
    let waterInfo=false,waterGoal=false,reminders=false,reminderTimer=null;
    const reminderKey='suru-water-reminders:'+account.id;
    try{reminders=own&&window.localStorage.getItem(reminderKey)==='true';}catch{}
    function scheduleReminder(){
      if(reminderTimer)window.clearTimeout(reminderTimer);
      if(!reminders||!own||!current())return;
      reminderTimer=window.setTimeout(()=>{if(!current())return;if(reminders){notice('Lembrete de hidratação: verifica o teu consumo e regista a água que bebeste.');scheduleReminder();}},3600000);
    }
    const mlText=v=>v==null?'—':Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
    function waterPage(){
      const w=data?.water,goal=data?.nutrition?.waterGoal?.ml??data?.nutrition?.target?.final_water_ml??data?.nutrition?.target?.calculated_water_ml;
      const consumed=w&&!w.error&&!w.restricted?w.ml:null,percent=goal>0&&consumed!=null?Math.round(consumed/goal*100):null,left=goal>0&&consumed!=null?Math.max(0,goal-consumed):null;
      const buckets=Array(12).fill(0);for(const r of w?.rows||[]){const hour=new Date(r.logged_at).getHours();if(Number.isFinite(hour))buckets[Math.floor(hour/2)]+=Number(r.amount_ml)||0;}
      const first=buckets.slice(0,3).some(v=>v>0)?0:3,values=buckets.slice(first),top=Math.max(500,Math.ceil(Math.max(...values)/250)*250);
      return `<section class="sd-water-scene"><div class="sd-water-intro"><h2>Pequenos hábitos,<br>grandes resultados.</h2><p>Mantém-te hidratado<br>e com mais energia.</p></div><div class="sd-ring sd-water-ring" style="--percent:${Math.min(percent||0,100)}" role="img" aria-label="${consumed==null?'Consumo indisponível':mlText(consumed)+' ml consumidos'}${goal?' de '+mlText(goal)+' ml':''}"><div>${icon('water')}<b>${mlText(consumed)}<span> ml</span></b><p>${goal?'de '+mlText(goal)+' ml':'Objetivo por definir'}</p><strong>${percent==null?'—':percent+'%'}</strong></div></div></section>
      ${waterInfo?`<section class="sd-water-info"><b>A tua hidratação</b><p>Regista a água que bebeste nos botões abaixo. O círculo compara o consumo registado com o objetivo do teu plano alimentar. O gráfico mostra os registos de hoje, agrupados em intervalos de duas horas.</p>${btn('Fechar informação','water-info')}</section>`:''}
      ${w?.restricted?empty('O consumo de água é privado e pode ser consultado na conta do aluno.'):w?.error?empty('Não foi possível carregar o consumo. Tenta atualizar.'):''}${own?waterButtons():''}
      ${data?.nutrition?.waterGoal?.estimated?`<section class="sd-water-info"><b>Meta estimada pelo peso</b><p>${fmt(data.nutrition.waterGoal.weight,'kg')} · avaliação de ${esc(data.nutrition.waterGoal.date)} · 35 ml/kg, arredondado para cima de 250 em 250 ml: ${mlText(goal)} ml/dia.</p><p>Estimativa para revisão pelo treinador. Uma indicação individual de hidratação ou restrição de líquidos deve prevalecer.</p>${btn('Rever nas metas nutricionais','nutrition-full')}</section>`:''}
      <section class="sd-water-stats" aria-label="Resumo de hidratação">${[['◎','Objetivo diário',goal],['water','Consumido',consumed],['◷','Falta',left]].map(([i,l,v])=>`<div><span class="sd-water-stat-icon">${i==='water'?icon(i):i}</span><div><small>${l}</small><b>${mlText(v)}${v==null?'':' ml'}</b></div></div>`).join('')}</section>
      <section class="sd-water-chart-panel"><div class="sd-section-heading"><h2>Hoje</h2>${btn('›','water-history','aria-label="Ver registos de água"','sd-text')}</div>${consumed==null?empty('Sem dados de consumo disponíveis.'):`<div class="sd-water-chart"><div class="sd-water-axis"><span>${mlText(top)}</span><span>${mlText(top/2)}</span><span>0</span></div><div class="sd-water-columns" role="img" aria-label="${values.map((v,i)=>String((i+first)*2).padStart(2,'0')+' horas: '+v+' ml').join('; ')}">${values.map((v,i)=>`<div><i style="height:${v/top*100}%" title="${v} ml"></i><small>${String((i+first)*2).padStart(2,'0')}h</small></div>`).join('')}</div></div>`}
      <details class="sd-history"><summary>Registos de hoje</summary>${(w?.rows||[]).slice().sort((a,b)=>String(b.logged_at).localeCompare(String(a.logged_at))).map(r=>`<p>${new Date(r.logged_at).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})} · ${fmt(r.amount_ml,'ml')}</p>`).join('')||empty('Ainda sem registos.')}</details></section>
      <div class="sd-water-options"><button type="button" class="sd-water-option" data-sd="water-reminders" role="switch" aria-checked="${reminders}" aria-label="Lembretes de hidratação" ${!own?'disabled':''}><span class="sd-water-option-icon">${icon('bell')}</span><span><b>Lembretes</b><small>Avisos nesta área,<br>a cada hora.</small></span><span class="sd-switch ${reminders?'on':''}"><i></i></span></button><button type="button" class="sd-water-option" data-sd="water-goal" aria-label="Consultar objetivo de água" aria-expanded="${waterGoal}"><span class="sd-water-option-icon">◎</span><span><b>Objetivo</b><small>${goal?mlText(goal)+' ml/dia':'Por definir no plano'}</small></span><span class="sd-water-chevron">›</span></button></div>
      ${waterGoal?`<section class="sd-water-info"><b>Objetivo do teu plano</b><p>${goal?'O teu objetivo atual é '+mlText(goal)+' ml por dia.':'Ainda não existe um objetivo de água no plano.'} ${data?.nutrition?.waterGoal?.estimated?'Esta meta é estimada pelo último peso registado e pode ser ajustada nas metas nutricionais.':'O objetivo é definido nas metas nutricionais pelo treinador.'}</p>${btn('Consultar plano alimentar','nutrition-full')}</section>`:''}
      <aside class="sd-water-tip">${icon('water')}<div><b>Dica do Coach</b><p>Distribui a água ao longo do dia e acompanha o objetivo definido no teu plano.</p></div></aside>`;
    }
    function nutritionPage(){
      const n=data?.nutrition,cal=n?.totals?.kcal,target=n?.target;
      return `<section class="sd-panel"><p>Calorias de hoje <small class="sd-muted">· planeadas</small></p><p class="sd-big">${fmt(cal)} <small>/ ${fmt(target?.final_calorie_target)} kcal</small></p>${progress(cal,target?.final_calorie_target,'nutrition')}</section>
      <section class="sd-panel sd-macro-grid">${[['protein_g','Proteína','protein'],['carbohydrate_g','Hidratos','carbs'],['fat_g','Gordura','fat']].map(([key,label,color])=>`<div><div class="sd-macro-arc ${color}"></div><small>${label}</small><b>${fmt(n?.totals?.[key],'g')}</b></div>`).join('')}</section>
      ${heading('Refeições','Ver plano','nutrition-full')}
      <div class="sd-meals">${sorted(n?.meals).map((m,i)=>`<details class="sd-meal"><summary><img class="sd-food-icon" src="suru-meal-${i%4}.png" alt="" loading="lazy"><span><b>${esc(m.name||'Refeição '+(i+1))}</b><small>${esc(sorted(m.items).map(x=>x.display_name).join(', ')||'Sem alimentos')}</small><small>${fmt(sum(m.items||[],'kcal'),'kcal')}${m.scheduled_time?' · '+esc(m.scheduled_time.slice(0,5)):''}</small></span><span>›</span></summary><div class="sd-meal-content">${sorted(m.items).map(x=>`<p><b>${esc(x.display_name)}</b><br>${fmt(x.quantity)} ${esc(x.unit)} · ${fmt(x.kcal,'kcal')}<br><small>P ${fmt(x.protein_g,'g')} · H ${fmt(x.carbohydrate_g,'g')} · G ${fmt(x.fat_g,'g')}</small></p>`).join('')}${m.notes?`<p>${esc(m.notes)}</p>`:''}</div></details>`).join('')||empty(n?.error?'Não foi possível carregar o plano.':'Não há refeições aprovadas para este dia.')}</div>
      ${btn(own?'Consultar plano alimentar':'Rever plano alimentar','nutrition-full','','sd-primary')}<p class="sd-footnote">Valores do plano aprovado. Fotografias ilustrativas; consulta os alimentos e quantidades de cada refeição.</p>`;
    }
    function trainingPage(){
      const t=chosen||data?.training;
      return `${tabs([['today','Hoje'],['sequence','Sequência'],['plan','Plano']])}${tab==='today'?`
      <section class="sd-training-hero"><div><h2>${esc(t?.current?.name||'Sem treino disponível')}</h2><p>${esc(t?.plan?.objective||t?.plan?.name||'O teu plano de treino')}</p><small>${fmt(t?.exercises?.length)} exercícios${t?.session?' · Sessão em curso':''}</small>${btn(own?(t?.session?'Retomar treino':'Iniciar treino'):'Consultar treino','start',!t?.current||busy?'disabled':'','sd-start')}</div></section>
      ${heading('Exercícios','Ver plano','plan')}<div class="sd-exercises">${(t?.exercises||[]).map((e,i)=>`<details><summary><b>${i+1}</b><span class="sd-exercise-icon">${icon('training')}</span><span><b>${esc(e.name)}</b><small>${fmt(e.sets)} × ${esc(e.reps)}</small></span><span>›</span></summary><p>${e.target_weight!=null?'Carga: '+fmt(e.target_weight,'kg')+' · ':''}${e.rest_seconds!=null?'Descanso: '+fmt(e.rest_seconds,'s'):''}</p>${e.notes?`<p>${esc(e.notes)}</p>`:''}</details>`).join('')||empty(t?.error?'Não foi possível carregar os exercícios.':'Ainda sem exercícios disponíveis.')}</div>`:
      `<p class="sd-muted">${tab==='sequence'?'Ordem dos treinos do plano. Não existem datas agendadas.':esc(t?.plan?.name||'Sem plano ativo')}</p><div class="sd-upcoming">${(tab==='sequence'?[t?.current,...t?.upcoming||[]].filter(Boolean):t?.workouts||[]).map(w=>`<button type="button" data-sd="workout-preview" data-id="${esc(w.id)}"><span class="sd-workout-thumb"></span><b>${esc(w.name)}</b><span>›</span></button>`).join('')}</div>${btn('Abrir planos e histórico','plan','','sd-primary')}`}`;
    }
    function cardioPage(){
      const c=data?.cardio,week=c?.week||[],values=[],labels=[];
      for(let i=6;i>=0;i--){const date=new Date(day+'T12:00:00');date.setDate(date.getDate()-i);values.push(sum(week.filter(r=>r.cardio_date===dayOf(date)),'duration_minutes'));labels.push(date.toLocaleDateString('pt-PT',{weekday:'short'}).replace('.',''));}
      return `${tabs([['today','Hoje'],['week','Semana'],['history','Histórico']])}<section class="sd-panel sd-cardio-total"><div><p>${tab==='today'?'Tempo de hoje':'Últimos 7 dias'}</p><strong>${c?.error?'—':fmt(tab==='today'?c?.minutes:sum(week,'duration_minutes'))} <small>min</small></strong></div><span class="sd-icon cardio">${icon('walk')}</span></section>
      ${own&&tab==='today'?`<h3 class="sd-label">Tipo de atividade</h3><div class="sd-activities">${[['Caminhada','walk'],['Corrida','walk'],['Bicicleta','bike'],['Outro','more']].map(([a,i])=>btn(`${icon(i)}<span>${a}</span>`,'activity',`data-type="${a}" aria-pressed="${a===cardioType}"`)).join('')}</div>${btn('Registar cardio +','cardio-record','','sd-primary')}<div data-sd-recorder hidden></div>`:''}
      ${heading(tab==='history'?'Registos dos últimos 7 dias':'Registos de hoje')}
      <div class="sd-cardio-list">${(tab==='history'?week:c?.rows||[]).map(r=>`<article class="sd-panel"><span class="sd-icon cardio">${icon(r.type==='Bicicleta'?'bike':'walk')}</span><div><b>${esc(r.type||'Cardio')}</b><p>${fmt(r.duration_minutes,'min')}</p><small>${r.cardio_date===day?'Hoje':esc(r.cardio_date)} · ${new Date(r.created_at).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}</small></div></article>`).join('')||empty(c?.error?'Não foi possível carregar os registos.':'Ainda sem registos.')}</div>
      ${heading('Últimos 7 dias')}${bars(values,labels,'min','cardio')}`;
    }
    function render(){
      if(!current())return;
      moreOpen=container.querySelector('.sd-more')?.open??moreOpen;
      const title={water:'Água',nutrition:'Nutrição',training:'Plano de Treino',cardio:'Cardio'}[screen];
      container.innerHTML=`<div class="student-home ${screen==='home'?'sd-home':'sd-detail'}" data-screen="${screen}">${screen==='water'?`<header class="sd-water-header">${btn(icon('back'),'home','aria-label="Voltar ao início"','sd-water-round')}<div><h1>ÁGUA</h1><span>HIDRATAÇÃO</span></div>${btn('ⓘ','water-info',`aria-label="Informação sobre hidratação" aria-expanded="${waterInfo}"`,'sd-water-round')}</header>`:title?`<header class="sd-page-header">${btn(icon('back'),'home','aria-label="Voltar ao início"','sd-icon-button')}<h1>${title}</h1><span class="sd-header-date" title="${day}">${icon('calendar')}</span></header>`:''}<div data-sd-message role="status" aria-live="polite"></div>${screen==='home'?main():screen==='water'?waterPage():screen==='nutrition'?nutritionPage():screen==='training'?trainingPage():cardioPage()}
      <nav class="sd-nav" aria-label="Navegação do aluno">${[['home','home','Início'],['nutrition','nutrition','Nutrição'],['training','training','Treino'],['cardio','cardio','Cardio'],['more','more','Mais']].map(([a,i,l])=>`<button type="button" data-sd="${a}" ${screen===a?'aria-current="page"':''}>${icon(i)}<span>${l}</span></button>`).join('')}</nav></div>`;
      if(data&&Object.values(data).some(v=>v.error))notice('Alguns dados não carregaram. Usa Atualizar para tentar novamente.',true);
    }
    async function refresh(){const ticket=++revision;day=dayOf();const result=await load(client,account,W,day,studentId);if(current()&&ticket===revision){data=result;render();}}
    function navigate(next){screen=next;tab='today';chosen=null;render();window.scrollTo({top:0,behavior:'instant'});}
    async function record(kind,values){
      if(busy||!current()||!own)return;
      if(pending&&(pending.kind!==kind||JSON.stringify(pending.values)!==JSON.stringify(values))){notice('Há um registo por confirmar. Repete o mesmo registo antes de acrescentar outro.',true);return;}
      busy=true;notice('A guardar registo…');container.querySelectorAll('[data-sd="water-add"],form[data-sd-cardio] button').forEach(b=>b.disabled=true);
      pending=pending||{kind,values,id:crypto.randomUUID(),day:dayOf()};
      try{await save(client,account,kind,{...values,id:pending.id,day:pending.day},current);pending=null;if(!current())return;await refresh();notice(kind==='water'?'Água registada.':'Cardio registado.');}
      catch(e){notice('Não foi possível confirmar o registo. Repete para tentar novamente, sem duplicar. '+(e.message||''),true);}
      finally{busy=false;if(current())container.querySelectorAll('[data-sd="water-add"],form[data-sd-cardio] button').forEach(b=>b.disabled=false);}
    }
    container.addEventListener('click',async event=>{
      const b=event.target.closest('[data-sd]');if(!b||!current()||busy)return;const a=b.dataset.sd;
      if(['home','water','nutrition','training','cardio'].includes(a))return navigate(a);
      if(a==='back-coach')return back?.();
      if(a==='water-add')return record('water',{amount_ml:Number(b.dataset.ml)});
      if(a==='water-info'){waterInfo=!waterInfo;render();return;}
      if(a==='water-goal'){waterGoal=!waterGoal;render();return;}
      if(a==='water-reminders'&&own){reminders=!reminders;try{window.localStorage.setItem(reminderKey,String(reminders));}catch{}scheduleReminder();render();notice(reminders?'Lembretes ativos a cada hora enquanto esta área estiver aberta.':'Lembretes desativados.');return;}
      if(a==='water-history'){container.querySelector('.sd-history').open=true;return;}
      if(a==='activity'){cardioType=b.dataset.type;render();return;}
      if(a==='tab'){tab=b.dataset.tab;render();return;}
      if(a==='cardio-record'&&own){const el=container.querySelector('[data-sd-recorder]');el.hidden=false;el.innerHTML=`<form data-sd-cardio class="sd-panel"><label>Atividade<select name="type" aria-label="Atividade">${['Caminhada','Corrida','Bicicleta','Outro'].map(v=>`<option ${v===cardioType?'selected':''}>${v}</option>`).join('')}</select></label><label>Duração (minutos)<input class="input" name="minutes" type="number" min="1" max="1440" step="1" required></label><button class="sd-button sd-primary" type="submit">Guardar cardio</button></form>`;el.querySelector('input').focus();return;}
      if(a==='refresh')return refresh().catch(()=>notice('Não foi possível atualizar. Tenta novamente.',true));
      if(a==='more'||a==='summary'||a==='updates'){if(screen!=='home')navigate('home');const el=container.querySelector(a==='more'?'.sd-more':a==='summary'?'.sd-summary':'.sd-upcoming');if(a==='more')el.open=true;el.scrollIntoView({behavior:'smooth'});return;}
      if(a==='workout-preview'){
        busy=true;try{const detail=await W.workout(client,account,studentId,b.dataset.id);if(current()){chosen={...data.training,current:detail.workout,plan:detail.plan,exercises:detail.exercises,session:data.training.session?.workout_id===detail.workout.id?data.training.session:null};screen='training';tab='today';render();window.scrollTo(0,0);}}catch(e){notice(W.message(e,'consultar treino'),true);}finally{busy=false;}return;
      }
      if(a==='workout')return openTraining({type:'workout',id:b.dataset.id});
      if(a==='start'){
        const training=chosen||data.training;
        if(!own)return openTraining({type:'workout',id:training.current.id});busy=true;b.disabled=true;
        try{const session=training.session||await W.start(client,account,studentId,training.current.id,crypto.randomUUID(),dayOf(),current);if(current())openTraining({type:'session',id:session.id});}
        catch(e){notice(W.message(e,'iniciar treino'),true);}finally{busy=false;if(current())b.disabled=false;}return;
      }
      open(a==='nutrition-full'?'nutrition':a);
    });
    container.addEventListener('submit',event=>{if(!event.target.matches('[data-sd-cardio]'))return;event.preventDefault();const f=event.target,minutes=Number(f.elements.minutes.value);if(!Number.isInteger(minutes)||minutes<1||minutes>1440){notice('Indica uma duração entre 1 e 1440 minutos.',true);return;}record('cardio',{type:f.elements.type.value,duration_minutes:minutes});});
    scheduleReminder();render();refresh().catch(()=>notice('Não foi possível carregar o painel.',true));
  }
  return {dayOf,bounds,nutrition,hydrationGoal,sequence,load,save,mount};
});
