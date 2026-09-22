window.mountCoachNutrition=function(container,{client,account,studentId,studentName,valid,back}){
  const N=window.CoachNutrition,coach=['trainer','admin'].includes(account.role);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,u='')=>v==null?'—':`${Number(v).toLocaleString('pt-PT',{maximumFractionDigits:1})}${u?' '+u:''}`;
  const copy=v=>JSON.parse(JSON.stringify(v));
  const goals={maintenance:'Manutenção',fat_loss:'Perder gordura',muscle_gain:'Ganhar massa muscular',custom:'Personalizado'};
  const states={draft:'Rascunho',pending_review:'Em revisão',approved:'Aprovado',archived:'Arquivado'};
  let busy=false,alive=true,generation=0,ctx=null,targets=[],plans=[],draft=null,dayIndex=0,offset=0,dirty=false;
  const requests={};
  const current=()=>alive&&container.isConnected&&valid();
  const today=()=>ctx?.calculated_on||new Date().toISOString().slice(0,10);
  function request(kind,payload){
    const signature=JSON.stringify(payload);
    if(requests[kind]?.signature!==signature)requests[kind]={signature,id:crypto.randomUUID()};
    return {...payload,request_id:requests[kind].id};
  }
  const button=(label,action,attrs='',style='light')=>`<button type="button" class="btn ${style}" data-n-action="${action}" ${attrs}>${label}</button>`;
  const input=(name,label,value='',type='text',attrs='')=>`<label>${label}<input class="input" name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  const select=(name,label,value,options,attrs='')=>`<label>${label}<select name="${name}" ${attrs}>${options.map(([v,l])=>`<option value="${esc(v)}" ${String(value??'')===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
  const area=(name,label,value='',attrs='')=>`<label>${label}<textarea name="${name}" ${attrs}>${esc(value)}</textarea></label>`;
  function message(text,error=false){
    if(!current())return;
    const el=container.querySelector('[data-n-message]');
    if(el){el.textContent=text;el.setAttribute('role',error?'alert':'status');if(error)el.focus();}
  }
  function shell(content){
    container.innerHTML='<style>#nutritionArea .row>*{min-width:0}#nutritionArea input,#nutritionArea select{font-size:16px;min-width:0}#nutritionArea fieldset{min-width:0;border:1px solid #dbe3ed;border-radius:12px;margin:12px 0;padding:12px}#nutritionArea button:disabled{opacity:.55}#nutritionArea .n-totals{line-height:1.6}#nutritionArea summary{padding:12px 0;cursor:pointer}</style>'+button('Voltar','back')+
      `<p class="muted">${esc(studentName||account.full_name||'Aluno')}</p><h2>Nutrição</h2><div data-n-message role="status" aria-live="polite" tabindex="-1"></div>`+content;
  }
  function targetHtml(t){
    if(!t)return '<p>Ainda não existem metas nutricionais guardadas.</p>';
    return `<h3>${esc(goals[t.goal_type]||t.goal_type)}</h3><p>${fmt(t.final_calorie_target,'kcal')} · Água: ${fmt(t.final_water_ml??t.calculated_water_ml,'ml')}</p>
      <p>Proteína ${fmt(t.protein_g,'g')} · Gordura ${fmt(t.fat_g,'g')} · Hidratos ${fmt(t.carbohydrate_g,'g')}</p>
      <details><summary>Ver cálculo e origem</summary><p>TMB: ${fmt(t.bmr_kcal,'kcal')} · Fator: ${fmt(t.activity_factor)} · TDEE: ${fmt(t.tdee_kcal,'kcal')}</p>
      <p>Meta calculada: ${fmt(t.calculated_calorie_target,'kcal')} · Ajuste: ${fmt(t.final_calorie_target-t.calculated_calorie_target,'kcal')}</p>
      <p>${esc(t.override_reason||'Sem ajuste manual.')} · ${esc(t.effective_from||today())}</p>
      <p>${esc(t.calculation_input_snapshot?.weight_source||'')} · ${esc(t.calculation_input_snapshot?.height_source||'')}</p></details>`;
  }
  function reviewHtml(){
    if(ctx.review_status==='READY')return '';
    return `<div class="card notice"><b>${ctx.review_status==='INCOMPLETE'?'Completar informação':'Requer revisão profissional'}</b>
      <p>${esc([...(ctx.missing||[]),...(ctx.reasons||[])].join(' · '))}</p><p>O cálculo automático e a aprovação estão bloqueados enquanto esta situação estiver pendente. As respostas devem refletir a situação atual do aluno.</p></div>`;
  }
  function profileHtml(){
    const p=ctx.profile||{},s=p.screening||{};
    return `<details class="card" ${!ctx.profile?'open':''}><summary>Preferências e triagem nutricional</summary><form data-n-form="profile">
      ${input('dietary_pattern','Padrão alimentar',p.dietary_pattern||'','text','maxlength="200"')}
      ${input('meals_per_day','Refeições por dia',p.meals_per_day||4,'number','min="1" max="12" step="1" required')}
      ${area('likes','Alimentos preferidos',p.preferences?.likes||'','maxlength="2000"')}${area('dislikes','Alimentos a evitar por preferência',p.preferences?.dislikes||'','maxlength="2000"')}
      <p class="muted">Confirma estas respostas com o aluno. As restantes respostas de saúde são lidas da anamnese.</p>
      ${[['pregnancy','Gravidez ou amamentação'],['renal','Condição renal'],['eating_disorder','Perturbação alimentar']].map(([k,l])=>select(k,l,typeof s[k]==='boolean'?String(s[k]):'',[['','Selecionar'],['false','Não'],['true','Sim']],'required')).join('')}
      ${area('notes','Notas privadas do treinador',ctx.trainer_notes||'','maxlength="4000"')}<button class="btn green" type="submit">Guardar preferências e triagem</button></form></details>`;
  }
  function targetForm(){
    const inp=ctx.input||{},last=targets[0];
    return `<details class="card"><summary>Calcular nova meta</summary><form data-n-form="target">
      <p>Peso: ${fmt(inp.weightKg,'kg')} (${esc(inp.weight_source)})<br>Altura: ${fmt(inp.heightCm,'cm')} (${esc(inp.height_source)})</p>
      <p class="muted">Data de nascimento e sexo vêm da anamnese. Atualiza os dados na anamnese ou numa avaliação se estiverem incorretos.</p>
      ${select('goal_type','Objetivo',last?.goal_type||'maintenance',Object.entries(goals))}
      <div class="row">${input('activity_factor','Fator de atividade',last?.activity_factor||1.55,'text','inputmode="decimal" required')}${input('strategy_percentage','Défice/superavit (%)',last?.strategy_percentage||0,'text','inputmode="decimal" required')}</div>
      <div class="row">${input('protein_g_per_kg','Proteína (g/kg)',1.6,'text','inputmode="decimal" required')}${input('fat_g_per_kg','Gordura (g/kg)',0.8,'text','inputmode="decimal" required')}</div>
      ${input('hydration_rule_ml_kg','Água (ml/kg)',35,'text','inputmode="decimal" required')}
      ${input('final_calorie_target','Meta calórica final (opcional)','','text','inputmode="decimal"')}${area('override_reason','Motivo do ajuste (obrigatório ao alterar a meta)','','maxlength="1000"')}
      <div data-n-preview></div>${button('Pré-visualizar cálculo','preview')}<button class="btn green" type="submit" ${ctx.review_status!=='READY'?'disabled':''}>Guardar meta</button></form></details>`;
  }
  function targetOptions(value){
    const entries=targets.filter(t=>t.trainer_id===account.id);
    const linked=plans.map(p=>p.target).find(t=>t?.id===value);
    if(linked&&!entries.some(t=>t.id===linked.id))entries.push(linked);
    return [['','Selecionar meta'],...entries.map(t=>[t.id,`${t.effective_from} · ${fmt(t.final_calorie_target,'kcal')} · ${goals[t.goal_type]||t.goal_type}`])];
  }
  function totalsHtml(d,target){
    const t=N.totals(d);
    return `<p class="n-totals">Total: <b>${fmt(t.kcal,'kcal')}</b> · P ${fmt(t.protein_g,'g')} · G ${fmt(t.fat_g,'g')} · H ${fmt(t.carbohydrate_g,'g')}
      ${target?`<br>Meta: ${fmt(target.final_calorie_target,'kcal')} · Diferença: ${fmt(t.kcal-target.final_calorie_target,'kcal')}`:''}</p>`;
  }
  function readPlan(p){
    return `<article class="card"><span class="tag">${esc(states[p.status]||p.status)}</span><h3 style="margin-top:12px">${esc(p.name)}</h3><p>${esc(p.week_start)} → ${esc(p.week_end)} · ${esc(p.objective)}</p>
      ${(p.days||[]).map(d=>`<details><summary>Dia ${d.position} · ${esc(d.day_date)}</summary>${totalsHtml(d,p.target)}${(d.meals||[]).map(m=>`<h4>${esc(m.name)} ${esc(m.scheduled_time?.slice(0,5)||'')}</h4><p>${esc(m.notes)}</p>${m.items?.length?m.items.map(x=>`<div class="card"><b>${esc(x.display_name)}</b><p>${fmt(x.quantity)} ${esc(x.unit)}${x.grams?` · ${fmt(x.grams,'g')}`:''}</p><p>${fmt(x.kcal,'kcal')} · P ${fmt(x.protein_g,'g')} · G ${fmt(x.fat_g,'g')} · H ${fmt(x.carbohydrate_g,'g')}</p><small>Fonte: ${esc(x.nutrition_source)} · ${esc(x.source_checked_on)} ${esc(x.source_version)}</small></div>`).join(''):'<p>Sem alimentos.</p>'}`).join('')}</details>`).join('')}
      ${coach&&p.trainer_id===account.id&&['draft','pending_review'].includes(p.status)?button('Editar plano','edit',`data-plan="${esc(p.id)}"`)+button(p.status==='draft'?'Enviar para revisão':'Aprovar e disponibilizar ao aluno',p.status==='draft'?'review':'approve',`data-plan="${esc(p.id)}" ${ctx.review_status!=='READY'?'disabled':''}`,'green'):''}</article>`;
  }
  function render(){
    if(!current())return;
    if(draft)return renderEditor();
    shell(`<div class="card notice"><p>Estimativas nutricionais para revisão pelo treinador. Situações clínicas exigem acompanhamento profissional.</p></div>${reviewHtml()}
      <section class="card">${targetHtml(targets[0])}</section>${coach?profileHtml()+targetForm():''}
      <h3>Planos alimentares</h3>${plans.length?plans.map(readPlan).join(''):'<p>Ainda não existem planos alimentares disponíveis.</p>'}
      <div class="row">${offset?button('Mais recentes','previous'):''}${plans.length===20?button('Mais antigos','next'):''}</div>
      ${coach?`<details class="card"><summary>Criar plano semanal</summary><form data-n-form="create">${input('name','Nome do plano','Plano alimentar','text','maxlength="150" required')}${input('week_start','Primeiro dia',today(),'date','required')}${input('objective','Objetivo do plano','','text','maxlength="1000"')}${input('meals_per_day','Número de refeições por dia',ctx.profile?.meals_per_day||4,'number','min="1" max="12" step="1" required')}${select('nutrition_target_id','Meta associada',targets.find(t=>t.trainer_id===account.id)?.id,targetOptions())}<button class="btn green" type="submit">Criar rascunho semanal</button></form></details>`:''}`);
  }
  function renderEditor(){
    const d=draft.days[dayIndex],target=targets.find(t=>t.id===draft.nutrition_target_id)||draft.target;
    const mealField=(i,k)=>`data-meal="${i}" data-field="${k}"`;
    const itemField=(i,j,k)=>`data-meal="${i}" data-item="${j}" data-field="${k}"`;
    shell(`<h3>Editar plano</h3><p data-n-dirty>${dirty?'Alterações por guardar.':'Sem alterações por guardar.'}</p><form data-n-form="edit">
      ${input('name','Nome do plano',draft.name,'text','data-plan-field="name" maxlength="150" required')}${input('objective','Objetivo do plano',draft.objective,'text','data-plan-field="objective" maxlength="1000"')}
      ${select('nutrition_target_id','Meta associada',draft.nutrition_target_id,targetOptions(draft.nutrition_target_id),'data-plan-field="nutrition_target_id"')}
      ${select('day','Dia da semana',dayIndex,draft.days.map((day,i)=>[i,`Dia ${i+1} · ${day.day_date}`]),'data-n-day')}
      <div data-n-totals>${totalsHtml(d,target)}</div>
      <p class="muted">Introduz os nutrientes para a quantidade indicada, já calculados a partir do rótulo ou da fonte consultada. A app soma estes valores; não os multiplica pela quantidade.</p>
      ${d.meals.map((m,i)=>`<fieldset><legend>Refeição ${i+1}</legend>${input('meal_name_'+i,'Nome da refeição',m.name,'text',mealField(i,'name')+' maxlength="150" required')}${input('meal_time_'+i,'Horário (opcional)',m.scheduled_time?.slice(0,5)||'','time',mealField(i,'scheduled_time'))}${area('meal_notes_'+i,'Notas para o aluno',m.notes,mealField(i,'notes')+' maxlength="2000"')}
        ${m.items.map((x,j)=>`<fieldset><legend>Alimento ${j+1}</legend>${input('food_'+i+'_'+j,'Alimento',x.display_name,'text',itemField(i,j,'display_name')+' maxlength="200" required')}
          <div class="row">${input('quantity_'+i+'_'+j,'Quantidade',x.quantity,'text',itemField(i,j,'quantity')+' inputmode="decimal" required')}${input('unit_'+i+'_'+j,'Unidade',x.unit,'text',itemField(i,j,'unit')+' maxlength="30" required')}</div>
          ${input('grams_'+i+'_'+j,'Peso em gramas (opcional)',x.grams??'','text',itemField(i,j,'grams')+' inputmode="decimal"')}
          <div class="row">${input('kcal_'+i+'_'+j,'Calorias (kcal)',x.kcal??'','text',itemField(i,j,'kcal')+' inputmode="decimal" required')}${input('protein_'+i+'_'+j,'Proteína (g)',x.protein_g??'','text',itemField(i,j,'protein_g')+' inputmode="decimal" required')}</div>
          <div class="row">${input('carbs_'+i+'_'+j,'Hidratos (g)',x.carbohydrate_g??'','text',itemField(i,j,'carbohydrate_g')+' inputmode="decimal" required')}${input('fat_'+i+'_'+j,'Gordura (g)',x.fat_g??'','text',itemField(i,j,'fat_g')+' inputmode="decimal" required')}</div>
          ${input('source_'+i+'_'+j,'Fonte dos nutrientes',x.nutrition_source,'text',itemField(i,j,'nutrition_source')+' maxlength="300" placeholder="Ex.: rótulo da marca / tabela consultada" required')}
          ${input('checked_'+i+'_'+j,'Data de consulta',x.source_checked_on||today(),'date',itemField(i,j,'source_checked_on')+' required')}${input('version_'+i+'_'+j,'Versão da fonte (opcional)',x.source_version||'','text',itemField(i,j,'source_version')+' maxlength="100"')}
          ${button('Remover alimento','remove-item',`data-meal="${i}" data-item="${j}"`)}</fieldset>`).join('')}
        ${button('Adicionar alimento','add-item',`data-meal="${i}" ${m.items.length>=30?'disabled':''}`)}${button('Remover refeição','remove-meal',`data-meal="${i}" ${d.meals.length===1?'disabled':''}`)}</fieldset>`).join('')}
      ${button('Adicionar refeição','add-meal',d.meals.length>=12?'disabled':'')}${button('Copiar este dia para os outros seis','copy-day')}
      <button type="submit" class="btn green">Guardar plano</button>${button('Fechar editor','close-editor')}</form>`);
  }
  async function rpc(name,v){
    if(!current())throw Error('Esta página já não está ativa.');
    const result=await client.rpc(name,{s:studentId,...(v===undefined?{}:{v})});
    if(result.error)throw result.error;
    if(!current())throw Error('Esta página já não está ativa.');
    return result.data;
  }
  async function load(){
    const ticket=++generation;
    if(!current())return;
    shell('<p role="status">A carregar Nutrição…</p>');
    try{
      const [contextResult,targetResult,planResult]=await Promise.all([
        client.rpc('nutrition_context',{s:studentId}),
        client.from('nutrition_targets').select('*').eq('student_id',studentId).order('effective_from',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(50),
        client.from('meal_plans').select('*,target:nutrition_targets!meal_plans_nutrition_target_id_fkey(*),days:meal_plan_days(*,meals:meal_plan_meals(*,items:meal_plan_items(*)))').eq('student_id',studentId).order('week_start',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+19)
      ]);
      for(const result of [contextResult,targetResult,planResult])if(result.error)throw result.error;
      if(!current()||ticket!==generation)return;
      ctx=contextResult.data;targets=targetResult.data||[];plans=planResult.data||[];
      for(const p of plans){p.days.sort((a,b)=>a.position-b.position);for(const d of p.days){d.meals.sort((a,b)=>a.position-b.position);for(const m of d.meals)m.items.sort((a,b)=>a.position-b.position);}}
      render();
    }catch(e){if(current()&&ticket===generation){shell(button('Tentar novamente','reload'));message('Não foi possível carregar a Nutrição. '+e.message,true);}}
  }
  async function run(operation){
    if(busy||!current())return;
    busy=true;container.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=true);
    try{await operation();}catch(e){message(e.message||'Não foi possível guardar. Podes tentar novamente.',true);}
    finally{busy=false;if(current()){
      // Restore only controls disabled by this operation; permanent limits are reapplied by the next render.
      container.querySelectorAll('[data-n-temporary-disabled]').forEach(el=>{el.disabled=false;delete el.dataset.nTemporaryDisabled;});
    }}
  }
  // Preserve the pre-existing disabled state (review gate, meal/item limits) across failures.
  async function guarded(operation){
    if(busy||!current())return;
    container.querySelectorAll('button,input,textarea,select').forEach(el=>{if(!el.disabled)el.dataset.nTemporaryDisabled='true';});
    return run(operation);
  }
  function markDirty(){dirty=true;const el=container.querySelector('[data-n-dirty]');if(el)el.textContent='Alterações por guardar.';}
  container.addEventListener('input',event=>{
    if(!draft||busy||!current())return;
    const el=event.target,ds=el.dataset;
    if(ds.planField){draft[ds.planField]=el.value;markDirty();}
    if(ds.field){const meal=draft.days[dayIndex].meals[Number(ds.meal)];const obj=ds.item===undefined?meal:meal.items[Number(ds.item)];obj[ds.field]=el.value;markDirty();}
    const totals=container.querySelector('[data-n-totals]');if(totals)totals.innerHTML=totalsHtml(draft.days[dayIndex],targets.find(t=>t.id===draft.nutrition_target_id));
  });
  container.addEventListener('change',event=>{
    if(event.target.matches('[data-n-day]')&&draft&&!busy&&current()){dayIndex=Number(event.target.value);renderEditor();}
  });
  container.addEventListener('click',async event=>{
    const el=event.target.closest('[data-n-action]');if(!el||busy||!current())return;
    const a=el.dataset.nAction,p=plans.find(p=>p.id===el.dataset.plan),i=Number(el.dataset.meal),j=Number(el.dataset.item);
    if(a==='back'){if(dirty&&!window.confirm('Descartar alterações por guardar?'))return;alive=false;++generation;return back();}
    if(a==='reload')return load();
    if(a==='next'||a==='previous'){offset=Math.max(0,offset+(a==='next'?20:-20));return load();}
    if(!coach)return;
    if(a==='preview'){
      try{const v=Object.fromEntries(new FormData(el.closest('form')));const t=N.targets({...ctx.input,...v,on:ctx.calculated_on});container.querySelector('[data-n-preview]').innerHTML=targetHtml({...t,goal_type:v.goal_type,override_reason:v.override_reason});}
      catch(e){message(e.message,true);}return;
    }
    if(a==='edit'){draft=copy(p);dayIndex=0;dirty=false;return renderEditor();}
    if(a==='close-editor'){if(dirty&&!window.confirm('Descartar alterações por guardar?'))return;draft=null;dirty=false;return render();}
    if(a==='review'||a==='approve')return guarded(async()=>{
      if(a==='approve'&&!window.confirm('Confirmas que reveste alimentos, quantidades, fontes e totais dos sete dias? O plano ficará disponível ao aluno.'))return;
      await rpc(a==='review'?'nutrition_review_meal_plan':'nutrition_approve_meal_plan',{id:p.id,revision:p.revision});await load();message(a==='review'?'Plano completo enviado para revisão.':'Plano aprovado e disponível ao aluno.');
    });
    if(!draft)return;
    const d=draft.days[dayIndex];
    if(a==='add-meal'&&d.meals.length<12)d.meals.push({name:'Refeição '+(d.meals.length+1),scheduled_time:null,notes:'',items:[]});
    else if(a==='remove-meal'&&d.meals.length>1)d.meals.splice(i,1);
    else if(a==='add-item'&&d.meals[i].items.length<30)d.meals[i].items.push({display_name:'',quantity:'',unit:'g',grams:'',kcal:'',protein_g:'',fat_g:'',carbohydrate_g:'',nutrition_source:'',source_checked_on:today(),source_version:''});
    else if(a==='remove-item')d.meals[i].items.splice(j,1);
    else if(a==='copy-day'){if(!window.confirm('Substituir as refeições dos outros seis dias pelas deste dia?'))return;draft.days.forEach((other,k)=>{if(k!==dayIndex)other.meals=copy(d.meals);});}
    else return;
    markDirty();renderEditor();
  });
  container.addEventListener('submit',event=>{
    const form=event.target,kind=form.dataset.nForm;if(!kind)return;event.preventDefault();if(!coach||busy||!current())return;
    const v=Object.fromEntries(new FormData(form));
    guarded(async()=>{
      if(kind==='profile'){
        const screening={};for(const key of ['pregnancy','renal','eating_disorder']){if(!['true','false'].includes(v[key]))throw Error('Preenche todas as respostas da triagem.');screening[key]=v[key]==='true';}
        await rpc('nutrition_save_profile',{revision:ctx.profile?.revision||0,dietary_pattern:v.dietary_pattern,meals_per_day:v.meals_per_day,preferences:{likes:v.likes,dislikes:v.dislikes},screening,notes:v.notes});
      }else if(kind==='target'){
        if(ctx.review_status!=='READY')throw Error('Conclui a triagem e resolve a necessidade de revisão profissional.');
        const t=N.targets({...ctx.input,...v,on:ctx.calculated_on});
        if((t.calorie_delta||v.goal_type==='custom')&&v.override_reason.trim().length<3)throw Error('Justifica o ajuste da meta calórica.');
        await rpc('nutrition_save_target',request('target',{...v,context_hash:ctx.context_hash}));delete requests.target;
      }else if(kind==='create'){
        N.date(v.week_start);await rpc('nutrition_create_meal_plan',request('create',v));delete requests.create;offset=0;
      }else if(kind==='edit'){
        await rpc('nutrition_edit_meal_plan',N.planPayload(draft,today()));draft=null;dirty=false;
      }
      await load();message('Guardado com sucesso.');
    });
  });
  load();
};
