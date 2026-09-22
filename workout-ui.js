/* Isolated workout screens mounted inside the existing authenticated application. */
window.mountCoachWorkouts = function(container, {client, account, studentId, valid, back}) {
  const W=window.CoachWorkouts,A=window.CoachAssessments;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const coach=W.isCoach(account),student=account.role==='student'&&account.id===studentId;
  const fmt=A.format;
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const date=value=>value?new Date(value.length===10?value+'T12:00:00':value).toLocaleDateString('pt-PT'):'—';
  const btn=(label,action,id='',style='dark')=>`<button type="button" class="btn ${style}" data-w-action="${action}" data-id="${esc(id)}">${label}</button>`;
  const field=(name,label,value='',type='text',mode='')=>`<label style="min-width:0;display:block">${label}<input class="input" name="${name}" type="${type}" ${mode?`inputmode="${mode}"`:''} value="${esc(value)}" style="font-size:16px;min-width:0;max-width:100%"></label>`;
  const notes=(label='Notas',value='')=>`<label>${label}<textarea name="notes" rows="2" style="font-size:16px">${esc(value)}</textarea></label>`;
  const form=(kind,title,fields,parent='')=>`<form class="card" data-kind="${kind}" data-parent="${esc(parent)}" data-draft="${window.crypto.randomUUID()}" novalidate><h3>${title}</h3>${fields}<div class="w-message" role="status" aria-live="polite" tabindex="-1"></div><button type="submit" class="btn green">${kind==='finish'?'Terminar treino':kind==='set'?'Guardar série':'Guardar'}</button></form>`;
  const pair=(a,b)=>`<div class="row">${a}${b}</div>`;
  let finishing=false;
  const pendingWrites=new Set();
  let revision=0,route={type:'plans'},ctx=null;
  const busy=new WeakSet();
  const current=token=>()=>valid()&&revision===token;
  const notice=text=>text?`<div class="card" role="status">${esc(text)}</div>`:'';
  const nav=()=>btn('Voltar','back','','light');
  function previous(){if(route.type==='exercise')return show(route.parent);if(route.type==='plans')return back();if(route.type==='plan'||route.type==='history')return show({type:'plans'});if(route.type==='workout')return show({type:'plan',id:ctx.plan.id});if(route.type==='session')return show({type:'history'});}
  function planForm(){return form('plan','Novo plano',field('name','Nome do plano')+field('objective','Objetivo')+pair(field('start_date','Data de início',today(),'date'),field('end_date','Data de fim (opcional)','','date'))+'<label>Estado<select name="active" style="font-size:16px"><option value="true">Ativo</option><option value="false">Inativo</option></select></label>');}
  function workoutForm(id){return form('workout','Novo treino',field('name','Nome do treino')+field('position','Ordem',1,'text','numeric'),id);}
  function exerciseForm(id){return form('exercise','Adicionar exercício',field('name','Nome do exercício')+pair(field('position','Ordem',1,'text','numeric'),field('sets','Séries (1–100)',3,'text','numeric'))+field('reps','Repetições alvo (ex.: 8–12)','8–12')+pair(field('target_weight','Carga alvo (kg)','','text','decimal'),field('target_rir','RIR alvo','','text','decimal'))+field('rest_seconds','Descanso (segundos)','','text','numeric')+notes(),id);}
  function record(log){return `${fmt(log.weight,'kg')} × ${fmt(log.reps)} reps${log.rir!=null?' · RIR '+fmt(log.rir):''}${log.pr?' · PR 🏆':''}`;}
  function previousRecords(exercise,history,exclude){const p=W.progress(history,exercise.id,exclude);return p.last?`<p class="muted">Último registo: ${esc(record(p.last))} · ${date(p.last.date)}</p><details><summary>Últimos registos · melhor carga ${fmt(p.best,'kg')}</summary>${p.logs.slice(0,10).map(l=>`<div class="check"><span>${date(l.date)} · S${l.set_number}</span><b>${esc(record(l))}</b></div>`).join('')}</details>`:'<p class="muted">Ainda não há registos anteriores para este exercício.</p>';}
  function exerciseCard(e,history){return `<div class="card"><h3>${esc(e.name)}</h3><p>${fmt(e.sets)} séries prescritas · ${esc(e.reps||'—')} reps</p><p class="muted">Carga alvo: ${fmt(e.target_weight,'kg')} · RIR: ${fmt(e.target_rir)} · Descanso: ${fmt(e.rest_seconds,'s')}</p>${e.notes?`<p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(e.notes)}</p>`:''}${previousRecords(e,history)}</div>`;}
  function savedSet(log,exercise,history,sessionId){const p=W.progress(history,exercise.id,sessionId);const completed=W.progress(history,exercise.id).logs.find(l=>l.id===log.id);const pr=completed?completed.pr:log.completed===true&&log.weight!=null&&p.best!==null&&Number(log.weight)>p.best;return `<div class="card" data-saved="${esc(exercise.id)}-${log.set_number}"><b>Série ${log.set_number} guardada ✓</b><p>${esc(record({...log,pr}))}</p>${log.notes?`<p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(log.notes)}</p>`:''}</div>`;}
  function exerciseList(exercises,logs=[]){return '<div class="card" style="padding:0;overflow:hidden">'+exercises.map((e,i)=>`<button type="button" data-w-action="exercise" data-id="${esc(e.id)}" style="display:flex;align-items:center;gap:16px;width:100%;padding:20px;text-align:left;background:white;border:0;${i?'border-top:1px solid #edf1f5;':''}font:inherit;color:inherit;cursor:pointer"><span style="color:#71839b;font-size:14px">${String(i+1).padStart(2,'0')}</span><span style="flex:1;min-width:0;overflow-wrap:anywhere"><strong style="display:block">${esc(e.name)}</strong><span class="muted" style="display:block;margin-top:5px">${fmt(e.sets)} séries × ${esc(e.reps||'—')} reps</span>${logs.length?`<small class="muted">${logs.filter(l=>l.exercise_id===e.id).length}/${fmt(e.sets)} séries guardadas</small>`:''}</span><span aria-hidden="true" style="color:#20ad75;font-size:26px">›</span></button>`).join('')+'</div>';}
  function setForm(e,n,sessionId){return form('set',`Série ${n} · ${esc(e.name)}`,pair(field('weight','Carga (kg)','','text','decimal'),field('reps','Repetições','','text','numeric'))+field('rir','RIR (opcional)','','text','decimal')+notes()+`<input type="hidden" name="exercise_id" value="${esc(e.id)}"><input type="hidden" name="set_number" value="${n}">`+(n>e.sets?btn('Remover série extra','remove-set','','light'):''),sessionId);}
  function count(e){return ctx.logs.filter(l=>l.exercise_id===e.id&&l.completed===true).length;}
  function updateCount(e){const el=Array.from(container.querySelectorAll('[data-set-count]')).find(el=>el.dataset.setCount===e.id);if(el)el.textContent=`${count(e)} séries registadas`;}
  async function persistSet(f,live){
    const v=Object.fromEntries(new FormData(f)),parent=f.dataset.parent;
    const id=await W.logId(parent,v.exercise_id,Number(v.set_number),window.crypto);
    const result=await W.saveSet(client,account,studentId,parent,v.exercise_id,Number(v.set_number),v,id,live);
    if(live()){
      const exercise=ctx.detail.exercises.find(e=>e.id===v.exercise_id);
      if(!ctx.logs.some(l=>l.id===result.row.id))ctx.logs.push(result.row);
      f.outerHTML=savedSet(result.row,exercise,ctx.history,parent)+notice(result.recovered?'Esta série já estava guardada. Mantivemos o registo existente.':'Série guardada com sucesso.');
      updateCount(exercise);
    }
    return result;
  }
  function sessionHtml(data,history){
    const done=!!data.session.finished_at,writable=student&&!done;
    const exercises=data.detail?.exercises||[];
    let html=`<h2>${esc(data.detail?.workout.name||'Sessão de treino')}</h2><p class="muted">${date(data.session.started_at)} · ${done?'Concluído':'Em curso'}</p>`;
    if(writable)html+='<div class="card notice">Guarda cada série antes de sair. As séries guardadas ficam disponíveis após recarregar e não podem ser editadas nesta versão. Usa 0 kg para exercícios sem carga externa.</div>';
    for(const e of exercises){
      html+=`<section data-session-exercise="${esc(e.id)}">`+exerciseCard(e,history)+`<p data-set-count="${esc(e.id)}">${data.logs.filter(l=>l.exercise_id===e.id&&l.completed===true).length} séries registadas</p>`;
      if(writable){
        const numbers=new Set(Array.from({length:Math.min(e.sets||0,100)},(_,i)=>i+1));
        data.logs.filter(l=>l.exercise_id===e.id).forEach(l=>numbers.add(l.set_number));
        for(const n of [...numbers].sort((a,b)=>a-b)){const log=data.logs.find(l=>l.exercise_id===e.id&&l.set_number===n);html+=log?savedSet(log,e,history,data.session.id):setForm(e,n,data.session.id);}
        html+=btn('+ Adicionar série','add-set',e.id,'light');
      }else html+=data.logs.filter(l=>l.exercise_id===e.id).map(l=>savedSet(l,e,history,data.session.id)).join('');
      html+='</section>';
    }
    const orphaned=data.logs.filter(l=>!exercises.some(e=>e.id===l.exercise_id));
    if(orphaned.length)html+='<div class="card"><h3>Registos de exercícios já indisponíveis</h3>'+orphaned.map(l=>`<p>Série ${l.set_number}: ${esc(record(l))}</p>`).join('')+'</div>';
    if(writable)html+=form('finish','Concluir sessão',notes('Notas da sessão',data.session.notes||'')+'<p class="muted">As séries prescritas são um objetivo. Ao terminar, guardamos as séries válidas; séries vazias ou incompletas não são gravadas.</p>',data.session.id);
    if(done&&data.session.notes)html+=`<div class="card"><h3>Notas da sessão</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(data.session.notes)}</p></div>`;
    return html;
  }
  async function show(next,message=''){
    if(!valid())return;route=next;const token=++revision;const live=current(token);
    container.innerHTML=nav()+notice(message)+'<div class="card" role="status">A carregar treinos…</div>';
    try{
      let html='';
      if(next.type==='plans'){
        const plans=await W.plans(client,account,studentId);
        html='<h2>Planos de treino</h2>'+(coach?btn('Planos mensais · rever e aprovar','monthly','','green'):'')+btn('Histórico de sessões','history','','light')+(plans.length?plans.map(p=>`<div class="card"><h3>${esc(p.name)}</h3><span class="tag">${p.active?'ATIVO':'INATIVO'}</span><p class="muted" style="margin-top:12px">${esc(p.objective||'Objetivo por definir')}</p><p class="muted">${date(p.start_date)} → ${date(p.end_date)}</p>${btn('Abrir plano','plan',p.id)}</div>`).join(''):'<div class="card">Ainda não existem planos de treino.</div>')+(coach?planForm():'');
      }else if(next.type==='plan'){
        const data=await W.planDetail(client,account,studentId,next.id);if(!live())return;ctx=data;
        html=`<h2>${esc(data.plan.name)}</h2><p class="muted">${esc(data.plan.objective||'')}</p>`+(coach?btn(data.plan.active?'Desativar plano':'Ativar plano','toggle',data.plan.id,'light'):'')+(data.workouts.length?data.workouts.map(w=>`<div class="card"><h3>${esc(w.name)}</h3>${btn('Abrir treino','workout',w.id)}</div>`).join(''):'<div class="card">Ainda não existem treinos neste plano.</div>')+(coach?workoutForm(next.id):'');
      }else if(next.type==='workout'){
        const data=await W.workout(client,account,studentId,next.id);const history=await W.history(client,account,studentId);if(!live())return;ctx={...data,history,startId:window.crypto.randomUUID()};
        html=`<h2>${esc(data.workout.name)}</h2>`+(data.exercises.length?exerciseList(data.exercises):'<div class="card">Ainda não existem exercícios neste treino.</div>')+(coach?exerciseForm(next.id):'');
        if(student)html+=W.available(data.plan,today())&&data.exercises.length?btn('Iniciar treino / Retomar','start',next.id,'green'):'<div class="card notice">Treino indisponível: confirma o período e estado do plano ou aguarda os exercícios do treinador.</div>';
      }else if(next.type==='exercise'){
        if(next.parent.type==='session'){
          const data=await W.session(client,account,studentId,next.parent.id),history=await W.history(client,account,studentId);if(!live())return;ctx={...data,history};
          if(!data.detail?.exercises.some(e=>e.id===next.id))throw new Error('Exercício indisponível.');
          html=sessionHtml(data,history,next.id);
        }else{
          const data=await W.workout(client,account,studentId,next.parent.id),history=await W.history(client,account,studentId);if(!live())return;ctx={...data,history,startId:window.crypto.randomUUID()};
          const e=data.exercises.find(e=>e.id===next.id);if(!e)throw new Error('Exercício indisponível.');
          html=exerciseCard(e,history)+(student&&W.available(data.plan,today())?btn('Registar cargas · Iniciar / Retomar','start',next.parent.id,'green'):'');
        }
      }else if(next.type==='history'){
        const history=await W.history(client,account,studentId);
        html='<h2>Histórico de sessões</h2>'+(history.sessions.length?history.sessions.map(s=>`<div class="card"><h3>${date(s.started_at)}</h3><span class="tag">${s.finished_at?'CONCLUÍDO':'EM CURSO'}</span>${btn(s.finished_at?'Consultar sessão':'Abrir sessão','session',s.id)}</div>`).join(''):'<div class="card">Ainda não existem sessões de treino.</div>');
      }else if(next.type==='session'){
        const data=await W.session(client,account,studentId,next.id),history=await W.history(client,account,studentId);if(!live())return;ctx={...data,history};html=sessionHtml(data,history);
      }
      if(live())container.innerHTML=nav()+notice(message)+html;
    }catch(error){if(live())container.innerHTML=nav()+`<div class="card" role="alert">${esc(W.message(error,'carregar o treino'))}</div>`+btn('Tentar novamente','retry','','light');}
  }
  container.addEventListener('click',async event=>{
    const target=event.target.closest('[data-w-action]');if(!target||!valid())return;
    const action=target.dataset.wAction,id=target.dataset.id;
    if(finishing)return;
    if(action==='remove-set'){const f=target.closest('form[data-kind="set"]');if(f&&!busy.has(f))f.remove();return;}
    if(action==='add-set'&&student&&!ctx.session?.finished_at){
      const e=ctx.detail.exercises.find(e=>e.id===id),section=target.closest('[data-session-exercise]');
      if(!e||!section)return;
      const numbers=[e.sets,...ctx.logs.filter(l=>l.exercise_id===id).map(l=>l.set_number),...Array.from(section.querySelectorAll('[name="set_number"]'),el=>Number(el.value))];
      const n=Math.max(...numbers)+1;if(n>2147483647)return;
      target.insertAdjacentHTML('beforebegin',setForm(e,n,ctx.session.id));return;
    }
    if(action==='monthly'&&coach){++revision;container.innerHTML='<div id="monthlyArea"></div>';return window.mountCoachMonthly(container.querySelector('#monthlyArea'),{client,account,studentId,valid,back:()=>show({type:'plans'})});}
    if(action==='back')return previous();if(action==='retry')return show(route);
    if(action==='exercise')return show({type:'exercise',id,parent:{...route}});
    if(['plans','plan','workout','session','history'].includes(action))return show({type:action,id});
    if(busy.has(target))return;busy.add(target);target.disabled=true;
    const token=revision,live=current(token);
    try{
      if(action==='toggle'&&coach){await W.setActive(client,account,studentId,id,!ctx.plan.active,live);if(live())await show(route,'Estado do plano atualizado.');}
      if(action==='start'&&student){const exerciseId=route.type==='exercise'?route.id:null;const session=await W.start(client,account,studentId,id,ctx.startId,today(),live);if(live())await show(exerciseId?{type:'exercise',id:exerciseId,parent:{type:'session',id:session.id}}:{type:'session',id:session.id});}
    }catch(error){if(live()){let message=container.querySelector('#workoutActionError');if(!message){message=document.createElement('div');message.id='workoutActionError';message.className='card';message.setAttribute('role','alert');target.after(message);}message.textContent=W.message(error,'atualizar o treino');}}
    finally{busy.delete(target);target.disabled=false;}
  });
  container.addEventListener('submit',async event=>{
    const f=event.target;if(!f.dataset.kind)return;event.preventDefault();if(!valid()||busy.has(f)||finishing)return;
    const token=revision,live=current(token),kind=f.dataset.kind,parent=f.dataset.parent;
    const v=Object.fromEntries(new FormData(f));const status=f.querySelector('.w-message'),submit=f.querySelector('[type="submit"]');
    busy.add(f);submit.disabled=true;status.setAttribute('role','status');status.textContent='A guardar no Supabase…';
    try{
      let result;
      if(kind==='plan')result=await W.createPlan(client,account,studentId,v,f.dataset.draft,live);
      else if(kind==='workout')result=await W.createWorkout(client,account,studentId,parent,v,f.dataset.draft,live);
      else if(kind==='exercise')result=await W.createExercise(client,account,studentId,parent,v,f.dataset.draft,live);
      else if(kind==='set'){
        const write=persistSet(f,live);pendingWrites.add(write);
        try{await write;}finally{pendingWrites.delete(write);}return;
      }else if(kind==='finish'){
        finishing=true;
        await Promise.all([...pendingWrites]);if(!live())return;
        const drafts=Array.from(container.querySelectorAll('form[data-kind="set"]'));
        const ready=drafts.filter(d=>{try{W.logValues(Object.fromEntries(new FormData(d)));return true;}catch{return false;}});
        const incomplete=(ctx.detail?.exercises||[]).some(e=>count(e)+ready.filter(d=>d.elements.exercise_id.value===e.id).length<e.sets)||drafts.length>ready.length;
        if(incomplete&&!window.confirm('Tens exercícios/séries por completar. Queres terminar o treino na mesma?')){status.textContent='';return;}
        for(const d of ready){await persistSet(d,live);if(!live())return;}
        await W.finish(client,account,studentId,parent,v.notes,live);if(live())await show({type:'session',id:parent},'Treino concluído e guardado com sucesso.');return;
      }
      if(live())await show(route,result?.recovered?'Este registo já estava guardado. Mantivemos os dados existentes.':'Guardado com sucesso.');
    }catch(error){if(live()){status.setAttribute('role','alert');status.textContent=W.message(error,'guardar o registo');status.focus();}}
    finally{if(kind==='finish')finishing=false;busy.delete(f);submit.disabled=false;}
  });
  show({type:'plans'});
};
