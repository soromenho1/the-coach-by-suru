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
    return {target,plan,hasMeals:items.length>0,totals:items.length?Object.fromEntries(['kcal','protein_g','fat_g','carbohydrate_g'].map(k=>[k,sum(items,k)])):null};
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
  async function load(client,account,W,day){
    if(account?.role!=='student')throw Error('Este painel pertence ao aluno.');
    const s=account.id,[from,to]=bounds(day);
    const results=await Promise.allSettled([
      (async()=>{const [modern,legacy]=await Promise.all([
        rows(()=>client.from('hydration_logs').select('id,amount_ml,logged_at').eq('student_id',s).eq('local_date',day).order('id')),
        rows(()=>client.from('water_logs').select('id,amount_ml,logged_at').eq('student_id',s).gte('logged_at',from).lt('logged_at',to).order('id'))]);
        const ids=new Set(modern.map(r=>r.id));return {ml:sum([...modern,...legacy.filter(r=>!ids.has(r.id))],'amount_ml')};})(),
      (async()=>{const [plans,targets]=await Promise.all([
        rows(()=>client.from('meal_plans').select('id,name,status,week_start,week_end,target:nutrition_targets!meal_plans_nutrition_target_id_fkey(final_calorie_target,protein_g,fat_g,carbohydrate_g,final_water_ml,calculated_water_ml),days:meal_plan_days(day_date,meals:meal_plan_meals(items:meal_plan_items(kcal,protein_g,fat_g,carbohydrate_g)))').eq('student_id',s).eq('status','approved').lte('week_start',day).gte('week_end',day).order('approved_at',{ascending:false}).order('id')),
        rows(()=>client.from('nutrition_targets').select('id,effective_from,effective_until,final_calorie_target,protein_g,fat_g,carbohydrate_g,final_water_ml,calculated_water_ml').eq('student_id',s).lte('effective_from',day).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).order('id'))]);return nutrition(plans,targets,day);})(),
      (async()=>{const plans=await W.plans(client,account,s),plan=plans.find(p=>W.available(p,day));
        const [detail,sessions]=await Promise.all([plan?W.planDetail(client,account,s,plan.id):null,rows(()=>client.from('workout_sessions').select('id,workout_id,started_at,finished_at').eq('student_id',s).order('started_at',{ascending:false}).order('id'))]);
        return {plan,...sequence(detail?.workouts||[],sessions),completed:sessions.filter(r=>r.finished_at&&new Date(r.finished_at)>=new Date(from)&&new Date(r.finished_at)<new Date(to)).length};})(),
      (async()=>{const data=await rows(()=>client.from('cardio_logs').select('id,type,duration_minutes,created_at').eq('student_id',s).eq('cardio_date',day).order('created_at',{ascending:false}).order('id'));return {minutes:sum(data,'duration_minutes'),rows:data};})()
    ]);
    return Object.fromEntries(['water','nutrition','training','cardio'].map((k,i)=>[k,results[i].status==='fulfilled'?results[i].value:{error:true}]));
  }
  async function save(client,account,kind,payload,current=()=>true){
    if(account?.role!=='student'||!current())throw Error('A sessão mudou. Reabre o painel.');
    const hydration=kind==='water';if(!hydration&&kind!=='cardio')throw Error('Registo inválido.');
    const amount=Number(hydration?payload.amount_ml:payload.duration_minutes);
    if(!Number.isInteger(amount)||(hydration?![250,500,1000].includes(amount):amount<1||amount>1440))throw Error('Indica uma duração entre 1 e 1440 minutos.');
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
  function mount(container,{client,account,valid,open,openTraining}){
    const W=window.CoachWorkouts;
    let data=null,busy=false,pending=null,revision=0,day=dayOf();
    const current=()=>container.isConnected&&valid();
    const icon={water:'💧',nutrition:'🍴',training:'🏋️',cardio:'❤️'};
    const button=(label,action,attrs='')=>`<button type="button" class="sd-button" data-sd="${action}" ${attrs}>${label}</button>`;
    const progress=(value,target,color)=>target>0&&value!=null?`<progress class="sd-progress ${color}" value="${Math.min(value,target)}" max="${target}" aria-label="${esc(fmt(value)+' de '+fmt(target))}"></progress>`:'';
    function notice(text,error=false){if(!current())return;const n=container.querySelector('[data-sd-message]');if(n){n.textContent=text;n.setAttribute('role',error?'alert':'status');}}
    function render(){
      if(!current())return;
      const w=data?.water,n=data?.nutrition,t=data?.training,c=data?.cardio;
      const goal=n?.target?.final_water_ml??n?.target?.calculated_water_ml;
      const label=(v,key,unit)=>!data?'A carregar…':v?.error?'Não foi possível carregar':fmt(v?.[key],unit);
      const water=w&&!w.error?litres(w.ml):'—';
      const calories=n?.totals?.kcal;
      const card=(kind,title,content,action,extra='')=>`<article class="sd-card ${kind}"><button class="sd-card-link" type="button" data-sd="${action}" aria-label="${esc(title)}"><span class="sd-icon" aria-hidden="true">${icon[kind]}</span><span class="sd-arrow" aria-hidden="true">›</span><h3>${title}</h3>${content}</button>${extra}</article>`;
      container.innerHTML=`<div class="student-home"><p class="sd-date">${new Date(day+'T12:00:00').toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'})}</p>
        <section class="sd-hero"><span class="sd-eyebrow">UM DIA DE CADA VEZ</span><h2>O teu progresso<br>começa aqui.</h2><p>Treina. Alimenta-te.<br>Cuida de ti.</p><span class="sd-hero-art" aria-hidden="true">＋</span></section>
        <div class="sd-grid">
        ${card('water','Água',`<p class="sd-value">${data?water:'A carregar…'} <small>/ ${goal?litres(goal):'objetivo por definir'}</small></p>${progress(w?.ml,goal,'water')}`,'water',`<div class="sd-quick" aria-label="Registar água">${[250,500,1000].map(ml=>button(ml===1000?'1 L':ml+' ml','water-add',`data-ml="${ml}" aria-label="Registar ${ml===1000?'1 litro':ml+' ml'} de água" ${busy?'disabled':''}`)).join('')}</div>`)}
        ${card('nutrition','Nutrição',`<p class="sd-value">${!data?'A carregar…':n?.error?'Indisponível':calories==null?'Sem plano para hoje':fmt(calories)+' kcal'}</p><small>Planeadas${n?.target?' · meta '+fmt(n.target.final_calorie_target,'kcal'):''}</small>${progress(calories,n?.target?.final_calorie_target,'nutrition')}<p class="sd-macros">P ${fmt(n?.totals?.protein_g,'g')} · H ${fmt(n?.totals?.carbohydrate_g,'g')} · G ${fmt(n?.totals?.fat_g,'g')}</p>`,'nutrition')}
        ${card('training','Plano de treino',`<p class="sd-value">${!data?'A carregar…':t?.error?'Indisponível':esc(t?.current?.name||'Sem treino disponível')}</p><small>${t?.session?'Sessão em curso':esc(t?.plan?.name||'Consulta os teus planos')}</small>`,'plan',button(t?.session?'Retomar treino':'Iniciar treino','start',!t?.current||t.error?'disabled':''))}
        ${card('cardio','Cardio',`<p class="sd-value">${label(c,'minutes','min')}</p><small>Realizados hoje</small>`,'cardio',button('Registar cardio','cardio'))}
        </div>
        <div data-sd-message role="status" aria-live="polite"></div>
        <section class="sd-recorder" data-sd-recorder hidden></section>
        <div class="sd-section-heading"><h2>Resumo do dia</h2>${button('Atualizar','refresh')}</div>
        <section class="sd-summary" aria-label="Resumo do dia"><div><span aria-hidden="true">💧</span><b>${water}</b><small>Água</small></div><div><span aria-hidden="true">🍴</span><b>${fmt(calories)}</b><small>kcal planeadas</small></div><div><span aria-hidden="true">🏋️</span><b>${fmt(t?.completed)}</b><small>Treinos concluídos</small></div><div><span aria-hidden="true">❤️</span><b>${fmt(c?.minutes,'min')}</b><small>Cardio</small></div></section>
        <div class="sd-section-heading"><h2>Próximos treinos</h2>${button('Ver plano','plan')}</div>
        <p class="sd-muted">Sequência do plano, sem datas agendadas.</p>
        <section class="sd-upcoming">${(t?.upcoming||[]).map((workout,i)=>`<button type="button" data-sd="workout" data-id="${esc(workout.id)}"><span class="sd-workout-icon" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><span><b>${esc(workout.name)}</b><small>${esc(t.plan?.name)}</small></span><span aria-hidden="true">›</span></button>`).join('')||`<p class="sd-muted">${!data?'A carregar…':t?.error?'Não foi possível carregar os treinos.':t?.current?'Não existem outros treinos neste plano.':'Ainda não tens um plano ativo.'}</p>`}</section>
        <details class="sd-more"><summary>Mais acompanhamento</summary><div>${[['anam','Anamnese'],['evals','Avaliação física'],['progress','Evolução'],['checkin','Check-in semanal']].map(([a,l])=>button(l,a)).join('')}</div></details>
        <nav class="sd-nav" aria-label="Navegação do aluno">${[['refresh','⌂','Início'],['nutrition','🍴','Nutrição'],['plan','🏋️','Treino'],['cardio','♡','Cardio'],['more','•••','Mais']].map(([a,i,l])=>`<button type="button" data-sd="${a}" ${a==='refresh'?'aria-current="page"':''}><span aria-hidden="true">${i}</span>${l}</button>`).join('')}</nav></div>`;
      if(data&&Object.values(data).some(v=>v.error))notice('Alguns dados não carregaram. Usa Atualizar para tentar novamente.',true);
    }
    async function refresh(){const ticket=++revision;day=dayOf();const result=await load(client,account,W,day);if(current()&&ticket===revision){data=result;render();}}
    function recorder(kind){
      const el=container.querySelector('[data-sd-recorder]');el.hidden=false;
      el.innerHTML=kind==='water'?`<h3>Registar água</h3><p>Consumo de hoje: ${!data?'a carregar…':data.water.error?'indisponível':litres(data.water.ml)}</p><p>Usa os botões de 250 ml, 500 ml ou 1 L no cartão Água.</p>${button('Fechar','close')}`:
        `<h3>Registar cardio</h3><form data-sd-cardio><label>Atividade<select name="type" aria-label="Atividade">${['Caminhada','Corrida','Bicicleta','Outro'].map(v=>`<option>${v}</option>`).join('')}</select></label><label>Duração (minutos)<input class="input" name="minutes" type="number" min="1" max="1440" step="1" required></label><button class="sd-button" type="submit">Guardar cardio</button>${button('Fechar','close')}</form><h4>Registos de hoje</h4>${data?.cardio?.error?'<p>Não foi possível carregar os registos.</p>':data?.cardio?.rows?.map(r=>`<p>${esc(r.type||'Cardio')} · ${fmt(r.duration_minutes,'min')}</p>`).join('')||'<p>Ainda sem registos.</p>'}`;
      el.scrollIntoView({behavior:'smooth',block:'center'});el.querySelector('select,button')?.focus();
    }
    async function record(kind,values){
      if(busy||!current())return;
      if(pending&&(pending.kind!==kind||JSON.stringify(pending.values)!==JSON.stringify(values))){notice('Há um registo por confirmar. Repete o mesmo registo antes de acrescentar outro.',true);return;}
      busy=true;container.querySelectorAll('[data-sd="water-add"],form[data-sd-cardio] button').forEach(b=>b.disabled=true);
      pending=pending||{kind,values,id:crypto.randomUUID(),day:dayOf()};
      try{await save(client,account,kind,{...values,id:pending.id,day:pending.day},current);pending=null;if(!current())return;await refresh();notice(kind==='water'?'Água registada.':'Cardio registado.');}
      catch(e){notice('Não foi possível confirmar o registo. Repete para tentar novamente, sem duplicar. '+(e.message||''),true);}
      finally{busy=false;if(current())container.querySelectorAll('[data-sd="water-add"],form[data-sd-cardio] button').forEach(b=>b.disabled=false);}
    }
    container.addEventListener('click',async event=>{
      const b=event.target.closest('[data-sd]');if(!b||!current()||busy)return;
      const a=b.dataset.sd;
      if(a==='water-add')return record('water',{amount_ml:Number(b.dataset.ml)});
      if(a==='water'||a==='cardio')return recorder(a);
      if(a==='close'){container.querySelector('[data-sd-recorder]').hidden=true;return;}
      if(a==='refresh')return refresh().catch(()=>notice('Não foi possível atualizar. Tenta novamente.',true));
      if(a==='more'){const el=container.querySelector('.sd-more');el.open=true;el.scrollIntoView({behavior:'smooth'});return;}
      if(a==='workout')return openTraining({type:'workout',id:b.dataset.id});
      if(a==='start'){
        busy=true;b.disabled=true;
        try{const session=data.training.session||await W.start(client,account,account.id,data.training.current.id,crypto.randomUUID(),dayOf(),current);if(current())openTraining({type:'session',id:session.id});}
        catch(e){notice(W.message(e,'iniciar treino'),true);}finally{busy=false;if(current())b.disabled=false;}return;
      }
      open(a);
    });
    container.addEventListener('submit',event=>{if(!event.target.matches('[data-sd-cardio]'))return;event.preventDefault();const f=event.target;const minutes=Number(f.elements.minutes.value);if(!Number.isInteger(minutes)||minutes<1||minutes>1440){notice('Indica uma duração entre 1 e 1440 minutos.',true);return;}record('cardio',{type:f.elements.type.value,duration_minutes:minutes});});
    render();refresh().catch(()=>notice('Não foi possível carregar o painel.',true));
  }
  return {dayOf,bounds,nutrition,sequence,load,save,mount};
});
