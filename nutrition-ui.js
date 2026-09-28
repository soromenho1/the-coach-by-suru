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
  container.canLeave=()=>!busy&&(!dirty||window.confirm('Descartar alterações por guardar?'));
  const today=()=>ctx?.calculated_on||new Date().toISOString().slice(0,10);
  const canPrepare=()=>['READY','DIABETES_DRAFT'].includes(ctx?.review_status);
  const clinicalRequired=()=>ctx?.reasons?.includes('diabetes');
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
    container.innerHTML='<style>#nutritionArea .row>*{min-width:0}#nutritionArea small{overflow-wrap:anywhere}#nutritionArea input,#nutritionArea select{font-size:16px;min-width:0}#nutritionArea fieldset{min-width:0;border:1px solid #dbe3ed;border-radius:12px;margin:12px 0;padding:12px}#nutritionArea button:disabled{opacity:.55}#nutritionArea .n-totals{line-height:1.6}#nutritionArea summary{padding:12px 0;cursor:pointer}</style>'+`<div class="tc-module-back">${button('Voltar','back')}</div>`+
      (coach&&container.closest('.trainer-app')?'':`<p class="muted">${esc(studentName||account.full_name||'Aluno')}</p><h2>Nutrição</h2>`)+`<div data-n-message role="status" aria-live="polite" tabindex="-1"></div>`+content;
  }
  function targetHtml(t){
    if(!t)return '<p>Ainda não existem metas nutricionais guardadas.</p>';
    return `<h3>${esc(goals[t.goal_type]||t.goal_type)}</h3>${t.calculation_input_snapshot?.clinical_review_required?'<p class="notice">Estimativa associada a um plano com revisão obrigatória do professor.</p>':''}<div class="tc-nutrient-grid">${[['Energia',t.final_calorie_target,'kcal','peach'],['Proteína',t.protein_g,'g','blue'],['Hidratos',t.carbohydrate_g,'g','mint'],['Gordura',t.fat_g,'g','lavender']].map(([label,value,unit,color])=>`<div class="tc-nutrient ${color}"><span>${label}</span><strong>${fmt(value)}</strong><small>${unit}</small></div>`).join('')}</div><p class="tc-water-target">Água · ${fmt(t.final_water_ml??t.calculated_water_ml,'ml')}</p>
      <details><summary>Ver cálculo e origem</summary><p>TMB: ${fmt(t.bmr_kcal,'kcal')} · Fator: ${fmt(t.activity_factor)} · TDEE: ${fmt(t.tdee_kcal,'kcal')}</p>
      <p>Meta calculada: ${fmt(t.calculated_calorie_target,'kcal')} · Ajuste: ${fmt(t.final_calorie_target-t.calculated_calorie_target,'kcal')}</p>
      <p>${esc(t.override_reason||'Sem ajuste manual.')} · ${esc(t.effective_from||today())}</p>
      <p>${esc(t.calculation_input_snapshot?.weight_source||'')} · ${esc(t.calculation_input_snapshot?.height_source||'')}</p></details>`;
  }
  function reviewHtml(){
    if(ctx.review_status==='READY')return '';
    if(ctx.review_status==='DIABETES_DRAFT')return `<div class="card notice"><b>Diabetes — revisão obrigatória do professor</b><p>${coach?'Podes preparar alimentos e quantidades segundo a orientação registada. Os rascunhos só ficam disponíveis ao aluno após aprovação pelo professor associado ao aluno.':'Só são apresentados planos aprovados pelo professor e correspondentes à informação clínica atual.'} Não alterar medicação ou doses de insulina com base numa proposta da app.</p></div>`;
    return `<div class="card notice"><b>${ctx.review_status==='INCOMPLETE'?'Completar informação':'Requer revisão profissional'}</b>
      <p>${esc([...(ctx.missing||[]),...(ctx.reasons||[])].join(' · '))}</p><p>O cálculo automático e a aprovação estão bloqueados enquanto esta situação estiver pendente. As respostas devem refletir a situação atual do aluno.</p></div>`;
  }
  function clinicalHtml(){
    if(!clinicalRequired())return '';
    const d=ctx.clinical?.data||{},meals=d.meals||[];
    const yesNo=[['','Selecionar'],['yes','Sim'],['no','Não']];
    return `<details class="card" ${!ctx.clinical?'open':''}><summary>Diabetes: informação para a revisão clínica</summary><form data-n-form="clinical">
      <p>Regista respostas confirmadas com o aluno e a orientação alimentar do profissional de saúde. Se não existir orientação sobre horários e hidratos, completa essa orientação antes de gerar. Estes dados não autorizam alterações de medicação.</p>
      ${select('diabetes_type','Tipo de diabetes',d.diabetes_type,[['','Selecionar'],['type1','Tipo 1'],['type2','Tipo 2'],['other','Outro tipo confirmado']],'required')}
      ${area('medication','Medicação atual e informação relevante (ou “sem medicação”, se confirmado)',d.medication,'required maxlength="4000"')}
      ${select('insulin_or_hypo_medication','Usa insulina ou medicação com risco de hipoglicemia?',d.insulin_or_hypo_medication,yesNo,'required')}
      ${select('hypoglycemia','Teve episódios de hipoglicemia recentes?',d.hypoglycemia,yesNo,'required')}
      ${area('routine','Rotina de refeições, treino e informação sobre os episódios, se aplicável',d.routine,'required maxlength="4000"')}
      ${area('guidance','Orientação clínica existente e cuidados a respeitar',d.guidance,'required maxlength="4000"')}
      ${input('guidance_author','Profissional que forneceu a orientação',d.guidance_author,'text','required maxlength="4000"')}
      ${input('guidance_date','Data dessa orientação',d.guidance_date,'date','required')}
      ${select('clinical_meals','Número de refeições na orientação',meals.length||Math.min(6,Math.max(3,ctx.profile?.meals_per_day||4)),[3,4,5,6].map(n=>[n,n]))}
      <p>Preenche as primeiras refeições de acordo com o número escolhido. Os limites abaixo são os da orientação recebida, não sugestões automáticas da app.</p>
      ${Array.from({length:6},(_,i)=>`<fieldset><legend>Refeição ${i+1}${i>=3?' (se aplicável)':''}</legend>${input('clinical_time_'+i,'Horário',meals[i]?.time,'time')}
      <div class="row">${input('clinical_min_'+i,'Hidratos mínimos (g)',meals[i]?.carbs_min,'number','min="0" max="300" step="0.1"')}${input('clinical_max_'+i,'Hidratos máximos (g)',meals[i]?.carbs_max,'number','min="0" max="300" step="0.1"')}</div></fieldset>`).join('')}
      <button class="btn green" type="submit">Guardar informação para revisão</button></form></details>`;
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
      <div data-n-preview></div>${button('Pré-visualizar cálculo','preview',canPrepare()?'':'disabled')}<button class="btn green" type="submit" ${!canPrepare()?'disabled':''}>Guardar meta</button></form></details>`;
  }
  function targetOptions(value){
    const entries=targets.filter(t=>t.trainer_id===account.id);
    const linked=plans.map(p=>p.target).find(t=>t?.id===value);
    if(linked&&!entries.some(t=>t.id===linked.id))entries.push(linked);
    return [['','Selecionar meta'],...entries.map(t=>[t.id,`${t.effective_from} · ${fmt(t.final_calorie_target,'kcal')} · ${goals[t.goal_type]||t.goal_type}`])];
  }
  function generationHelp(){
    return `<details><summary>Alimentos e regras da geração</summary><p>A geração usa a meta guardada e as preferências atuais, para 3 a 6 refeições por dia. Escolhe alimentos de um catálogo limitado e ajusta porções; não gera dietas terapêuticas. Os valores são estimativas CoFID 2021. Revê os sete dias antes de guardar e aprovar.</p><p>Padrões: Variado, Vegetariano, Vegano ou Pescetariano. Nas preferências, usa nomes separados por vírgulas. Texto não reconhecido bloqueia a geração para não ignorar restrições.</p><p>${esc(window.CoachNutritionGenerator?.catalog.map(f=>f.name).join('; ')||'Catálogo indisponível. Atualiza a página.')}</p></details>`;
  }
  async function generateDays(targetId,mealsPerDay,weekStart){
    if(!window.CoachNutritionGenerator)throw Error('Atualiza a página para carregar o gerador de alimentos.');
    const fresh=await rpc('nutrition_context');
    const {data:target,error}=await client.from('nutrition_targets').select('*').eq('id',targetId||'00000000-0000-0000-0000-000000000000').eq('student_id',studentId).eq('trainer_id',account.id).maybeSingle();
    if(error)throw error;
    if(!current())throw Error('Esta página já não está ativa.');
    const days=window.CoachNutritionGenerator.generate({context:fresh,target,mealsPerDay,weekStart,trainerId:account.id});
    ctx=fresh;
    return {days,target};
  }
  function totalsHtml(d,target){
    const t=N.totals(d);
    return `<p class="n-totals">Total: <b>${fmt(t.kcal,'kcal')}</b> · P ${fmt(t.protein_g,'g')} · G ${fmt(t.fat_g,'g')} · H ${fmt(t.carbohydrate_g,'g')}
      ${target?`<br>Meta: ${fmt(target.final_calorie_target,'kcal')} · Diferença: ${fmt(t.kcal-target.final_calorie_target,'kcal')}`:''}</p>`;
  }
  function mealCarbsHtml(m,i){
    const g=clinicalRequired()?ctx.clinical?.data?.meals?.[i]:null;
    return `<b>Hidratos da refeição: ${fmt(N.totals({meals:[m]}).carbohydrate_g,'g')}</b>${g?`<br>Orientação registada: ${fmt(g.carbs_min)}–${fmt(g.carbs_max,'g')} · ${esc(g.time)}`:''}`;
  }
  function readPlan(p){
    return `<article class="card tc-meal-plan"><span class="tag">${esc(states[p.status]||p.status)}</span><h3 style="margin-top:12px">${esc(p.name)}</h3><p>${esc(p.week_start)} → ${esc(p.week_end)}${p.objective?' · '+esc(p.objective):''}</p>
      ${(p.days||[]).map(d=>`<details><summary>Dia ${d.position} · ${esc(d.day_date)}</summary>${totalsHtml(d,p.target)}${(d.meals||[]).map(m=>`<h4>${esc(m.name)} ${esc(m.scheduled_time?.slice(0,5)||'')}</h4><p><b>Hidratos da refeição: ${fmt(N.totals({meals:[m]}).carbohydrate_g,'g')}</b></p><p>${esc(m.notes)}</p>${m.items?.length?m.items.map(x=>`<div class="card"><b>${esc(x.display_name)}</b><p>${fmt(x.quantity)} ${esc(x.unit)}${x.grams?` · ${fmt(x.grams,'g')}`:''}</p><p>${fmt(x.kcal,'kcal')} · P ${fmt(x.protein_g,'g')} · G ${fmt(x.fat_g,'g')} · H ${fmt(x.carbohydrate_g,'g')}</p><small>Fonte: ${esc(x.nutrition_source)} · ${esc(x.source_checked_on)} ${esc(x.source_version)}</small></div>`).join(''):'<p>Sem alimentos.</p>'}`).join('')}</details>`).join('')}
      ${coach&&(p.trainer_id===account.id||ctx.can_clinical_review)&&['draft','pending_review'].includes(p.status)?button('Editar plano','edit',`data-plan="${esc(p.id)}"`)+button(p.status==='draft'?'Enviar para revisão':clinicalRequired()?'Autorizar plano e disponibilizar ao aluno':'Aprovar e disponibilizar ao aluno',p.status==='draft'?'review':'approve',`data-plan="${esc(p.id)}" ${!canPrepare()||(p.status==='pending_review'&&clinicalRequired()&&!ctx.can_clinical_review)?'disabled':''}`,'green')+(p.status==='pending_review'&&clinicalRequired()&&!ctx.can_clinical_review?'<p>Aguarda aprovação de um professor associado ao aluno.</p>':''):''}</article>`;
  }
  function render(){
    if(!current())return;
    if(draft)return renderEditor();
    shell(`<div class="card notice"><p>Estimativas nutricionais para revisão pelo treinador. Situações clínicas exigem acompanhamento profissional.</p></div>${reviewHtml()}
      <section class="card tc-target"><p class="tc-eyebrow">META NUTRICIONAL MAIS RECENTE</p>${targetHtml(targets[0])}</section><div class="tc-nutrition-settings">${coach?profileHtml()+clinicalHtml()+targetForm():''}</div>
      <div class="tc-section-title"><h3>Planos alimentares</h3><span class="tc-count">${plans.length} nesta página</span></div>${coach?'<p class="muted">Planos semanais, refeições e quantidades, organizados para cada objetivo.</p>':''}<div class="tc-meal-plans">${plans.length?plans.map(readPlan).join(''):'<div class="card tc-empty"><h3>Alimentar a evolução.</h3><p>Ainda não existem planos alimentares disponíveis.</p></div>'}</div>
      <div class="row">${offset?button('Mais recentes','previous'):''}${plans.length===20?button('Mais antigos','next'):''}</div>
      ${coach?`<details class="card tc-create-meal"><summary>Criar plano semanal</summary><form data-n-form="create">${input('name','Nome do plano','Plano alimentar','text','maxlength="150" required')}${input('week_start','Primeiro dia',today(),'date','required')}${input('objective','Objetivo do plano','','text','maxlength="1000"')}${input('meals_per_day','Número de refeições por dia',ctx.profile?.meals_per_day||4,'number','min="1" max="12" step="1" required')}${select('nutrition_target_id','Meta associada',targets.find(t=>t.trainer_id===account.id)?.id,targetOptions())}${select('fill_mode','Preenchimento','automatic',[['automatic','Gerar alimentos e quantidades para revisão'],['manual','Preencher manualmente']])}${generationHelp()}<button class="btn green" type="submit">Criar rascunho semanal</button></form></details>`:''}`);
  }
  function catalogPicker(i){
    const C=window.CoachFoodCatalog;
    if(!C)return '<p>Catálogo indisponível. Atualiza a página.</p>';
    return `<details class="card"><summary>Procurar alimento no catálogo</summary><p>${C.status.count.toLocaleString('pt-PT')} alimentos USDA · valores por 100 g de parte comestível.</p><p class="muted">PortFIR: importação pendente do ficheiro oficial. USDA mantém os nomes originais em inglês; podes pesquisar também termos comuns em português, como frango, arroz ou leite. Confirma se o alimento está cru ou cozinhado. Os hidratos USDA são totais e incluem fibra.</p><label>Pesquisar alimento<input class="input" type="search" data-catalog-search="${i}" placeholder="Ex.: arroz cozido / rice cooked" autocomplete="off"></label><div data-catalog-results="${i}" aria-live="polite"></div></details>
    <details class="card" data-label-panel="${i}"><summary>Adicionar produto pelo rótulo</summary><p>Transcreve os valores por <b>100 g</b>. Para rótulos por 100 ml, usa o preenchimento manual em ml, sem converter ml em gramas.</p>${input('label_name_'+i,'Nome do produto','','text','data-label="name" maxlength="200"')}${input('label_brand_'+i,'Marca / produto exato','','text','data-label="brand" maxlength="200"')}${input('label_checked_'+i,'Data de consulta do rótulo',today(),'date','data-label="checked"')}${[['kcal','Calorias por 100 g'],['protein_g','Proteína por 100 g'],['fat_g','Gordura por 100 g'],['carbohydrate_g','Hidratos por 100 g']].map(([k,l])=>input('label_'+k+'_'+i,l,'','text',`data-label="${k}" inputmode="decimal"`)).join('')}${button('Adicionar rótulo à refeição','catalog-label',`data-meal="${i}"`)}</details>`;
  }
  function catalogResults(query,i){
    const C=window.CoachFoodCatalog,results=C?.search(query)||[];
    const el=container.querySelector(`[data-catalog-results="${i}"]`);if(!el)return;
    el.innerHTML=query.trim().length<2?'<p>Escreve pelo menos duas letras.</p>':results.length?results.map(f=>`<div class="card"><b>${esc(f.name)}</b><p>${fmt(f.kcal,'kcal')} · P ${fmt(f.protein_g,'g')} · G ${fmt(f.fat_g,'g')} · H totais ${fmt(f.carbohydrate_g,'g')} / 100 g</p><small>${esc(f.version)}</small>${button('Adicionar 100 g','catalog-add',`data-meal="${i}" data-food-id="${esc(f.id)}"`)}</div>`).join('')+'<p>Mostramos até 20 resultados. Especifica alimento e preparação para refinar.</p>':'<p>Sem resultados. Experimenta o nome em inglês ou introduz os dados de um rótulo confirmado.</p>';
  }
  function renderEditor(){
    const d=draft.days[dayIndex],target=targets.find(t=>t.id===draft.nutrition_target_id)||draft.target;
    const mealField=(i,k)=>`data-meal="${i}" data-field="${k}"`;
    const itemField=(i,j,k)=>`data-meal="${i}" data-item="${j}" data-field="${k}"`;
    shell(`<div class="tc-section-title"><h3>Editar plano</h3><span class="tc-count">Dia ${dayIndex+1} de ${draft.days.length}</span></div><p data-n-dirty>${dirty?'Alterações por guardar.':'Sem alterações por guardar.'}</p><form data-n-form="edit">
      ${input('name','Nome do plano',draft.name,'text','data-plan-field="name" maxlength="150" required')}${input('objective','Objetivo do plano',draft.objective,'text','data-plan-field="objective" maxlength="1000"')}
      ${select('nutrition_target_id','Meta associada',draft.nutrition_target_id,targetOptions(draft.nutrition_target_id),'data-plan-field="nutrition_target_id"')}
      ${button('Gerar alimentos para os sete dias','generate-foods')}${generationHelp()}
      ${select('day','Dia da semana',dayIndex,draft.days.map((day,i)=>[i,`Dia ${i+1} · ${day.day_date}`]),'data-n-day')}
      <div data-n-totals>${totalsHtml(d,target)}</div>
      <p class="muted">Nos alimentos do catálogo e rótulos por 100 g, alterar Quantidade recalcula os nutrientes mantendo a fonte. Valores USDA usam hidratos totais (incluem fibra). Alterar nutrientes manualmente desliga o recálculo desse alimento. Nos alimentos manuais, introduz os nutrientes para a quantidade indicada, calculados a partir da fonte consultada.</p>
      ${d.meals.map((m,i)=>`<fieldset><legend>Refeição ${i+1}</legend><p data-n-meal-total="${i}">${mealCarbsHtml(m,i)}</p>${input('meal_name_'+i,'Nome da refeição',m.name,'text',mealField(i,'name')+' maxlength="150" required')}${input('meal_time_'+i,clinicalRequired()?'Horário conforme orientação':'Horário (opcional)',m.scheduled_time?.slice(0,5)||'','time',mealField(i,'scheduled_time'))}${area('meal_notes_'+i,'Notas para o aluno',m.notes,mealField(i,'notes')+' maxlength="2000"')}
        ${catalogPicker(i)}${m.items.map((x,j)=>`<fieldset><legend>Alimento ${j+1}</legend>${input('food_'+i+'_'+j,'Alimento',x.display_name,'text',itemField(i,j,'display_name')+' maxlength="200" required')}
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
    if(ds.catalogSearch!==undefined){catalogResults(el.value,Number(ds.catalogSearch));return;}
    if(ds.planField){draft[ds.planField]=el.value;markDirty();}
    if(ds.field){
      const meal=draft.days[dayIndex].meals[Number(ds.meal)];const obj=ds.item===undefined?meal:meal.items[Number(ds.item)];obj[ds.field]=el.value;
      const G=window.CoachNutritionGenerator;
      const C=window.CoachFoodCatalog,external=C?.match(obj)||C?.matchLabel(obj);
      const f=external||G?.catalog.find(f=>obj.source_version===`CoFID 2021 · ${f.id}`&&obj.display_name===f.name&&obj.nutrition_source===G.source&&obj.unit==='g');
      if(ds.field==='quantity'&&f){
        try{
          const item=(external?C:G).portion(f,N.number(el.value,'Quantidade',0.001,100000));Object.assign(obj,item);
          for(const field of ['grams','kcal','protein_g','fat_g','carbohydrate_g']){
            const input=container.querySelector(`[data-meal="${ds.meal}"][data-item="${ds.item}"][data-field="${field}"]`);if(input)input.value=obj[field];
          }
        }catch{/* Preserve partially typed quantities; save validates them. */}
      }
      if(['kcal','protein_g','fat_g','carbohydrate_g'].includes(ds.field)&&f){obj.source_version='';const version=container.querySelector(`[data-meal="${ds.meal}"][data-item="${ds.item}"][data-field="source_version"]`);if(version)version.value='';}
      markDirty();
    }
    const totals=container.querySelector('[data-n-totals]');if(totals)totals.innerHTML=totalsHtml(draft.days[dayIndex],targets.find(t=>t.id===draft.nutrition_target_id));
    container.querySelectorAll('[data-n-meal-total]').forEach(el=>{const i=Number(el.dataset.nMealTotal);el.innerHTML=mealCarbsHtml(draft.days[dayIndex].meals[i],i);});
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
      if(!canPrepare())return;
      try{const v=Object.fromEntries(new FormData(el.closest('form')));const t=N.targets({...ctx.input,...v,on:ctx.calculated_on});container.querySelector('[data-n-preview]').innerHTML=targetHtml({...t,goal_type:v.goal_type,override_reason:v.override_reason});}
      catch(e){message(e.message,true);}return;
    }
    if(a==='edit'){draft=copy(p);dayIndex=0;dirty=false;return renderEditor();}
    if(a==='close-editor'){if(dirty&&!window.confirm('Descartar alterações por guardar?'))return;draft=null;dirty=false;return render();}
    if(a==='generate-foods'&&draft)return guarded(async()=>{
      const count=draft.days[0]?.meals.length;
      if(draft.days.some(day=>day.meals.length!==count))throw Error('Para gerar, usa o mesmo número de refeições nos sete dias.');
      if(draft.days.some(day=>day.meals.some(meal=>meal.items.length))&&!window.confirm('Substituir os alimentos, horários e notas dos sete dias por uma nova proposta? Só será gravada quando carregares em Guardar plano.'))return;
      const generated=await generateDays(draft.nutrition_target_id,count,draft.week_start);
      draft.days=generated.days;draft.target=generated.target;dayIndex=0;dirty=true;renderEditor();
      message('Alimentos gerados para os sete dias. Revê as quantidades e os totais e carrega em Guardar plano. Ainda não foram gravados.');
    });
    if(a==='review'||a==='approve')return guarded(async()=>{
      let clinical_note;
      if(a==='approve'&&clinicalRequired()){
        if(!ctx.can_clinical_review)throw Error('A aprovação exige um professor com associação ativa ao aluno.');
        clinical_note=window.prompt('Regista a revisão do professor: adequação dos sete dias, horários e hidratos à medicação, risco de hipoglicemia e rotina do aluno.');
        if(clinical_note===null)return;
        if(clinical_note.trim().length<10)throw Error('Descreve a revisão antes de aprovar.');
      }
      if(a==='approve'&&!window.confirm('Confirmas que reveste alimentos, quantidades, fontes e totais dos sete dias? O plano ficará disponível ao aluno.'))return;
      await rpc(a==='review'?'nutrition_review_meal_plan':'nutrition_approve_meal_plan',{id:p.id,revision:p.revision,...(clinical_note?{clinical_note,clinical_confirmation:true}:{})});await load();message(a==='review'?'Plano completo enviado para revisão.':'Plano aprovado e disponível ao aluno.');
    });
    if(!draft)return;
    const d=draft.days[dayIndex];
    if(a==='catalog-add'||a==='catalog-label'){
      try{if(!d.meals[i]||d.meals[i].items.length>=30)throw Error('Cada refeição permite até 30 alimentos.');const C=window.CoachFoodCatalog;let food;
        if(a==='catalog-add')food=C.get(el.dataset.foodId);
        else {const panel=container.querySelector(`[data-label-panel="${i}"]`);const values=Object.fromEntries([...panel.querySelectorAll('[data-label]')].map(e=>[e.dataset.label,e.value]));food=C.label(values);}
        d.meals[i].items.push(C.portion(food,100));markDirty();renderEditor();message('Alimento adicionado ao rascunho. Ajusta a quantidade e guarda o plano.');
      }catch(e){message(e.message,true);}return;
    }
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
      }else if(kind==='clinical'){
        const data=Object.fromEntries(['diabetes_type','medication','insulin_or_hypo_medication','hypoglycemia','routine','guidance','guidance_author','guidance_date'].map(k=>[k,v[k]]));
        data.meals=Array.from({length:Number(v.clinical_meals)},(_,i)=>({time:v['clinical_time_'+i],carbs_min:N.number(v['clinical_min_'+i],'Hidratos mínimos',0,300),carbs_max:N.number(v['clinical_max_'+i],'Hidratos máximos',0,300)}));
        await rpc('nutrition_save_clinical',{revision:ctx.clinical?.revision||0,data});
      }else if(kind==='target'){
        if(!canPrepare())throw Error('Conclui a triagem e a informação clínica necessária.');
        const t=N.targets({...ctx.input,...v,on:ctx.calculated_on});
        if((t.calorie_delta||v.goal_type==='custom')&&v.override_reason.trim().length<3)throw Error('Justifica o ajuste da meta calórica.');
        await rpc('nutrition_save_target',request('target',{...v,context_hash:ctx.context_hash}));delete requests.target;
      }else if(kind==='create'){
        N.date(v.week_start);
        const automatic=v.fill_mode==='automatic';delete v.fill_mode;
        const generated=automatic?await generateDays(v.nutrition_target_id,v.meals_per_day,v.week_start):null;
        const created=await rpc('nutrition_create_meal_plan',request('create',v));delete requests.create;offset=0;
        if(generated){
          draft={...created,days:generated.days,target:generated.target};dayIndex=0;dirty=true;renderEditor();
          message('Rascunho criado. Os alimentos dos sete dias estão prontos para revisão, mas ainda não foram gravados. Carrega em Guardar plano para os guardar.');return;
        }
      }else if(kind==='edit'){
        await rpc('nutrition_edit_meal_plan',N.planPayload(draft,today()));draft=null;dirty=false;
      }
      await load();message('Guardado com sucesso.');
    });
  });
  load();
};
