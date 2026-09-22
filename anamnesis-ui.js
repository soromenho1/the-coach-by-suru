'use strict';
/* Mounted only inside the authenticated app; all server writes go through CoachAnamnesis. */
window.mountCoachAnamnesis=function(container,{client,account,studentId,studentName,valid,back}){
  const N=window.CoachAnamnesis;
  const student=account.role==='student'&&account.id===studentId;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button=(label,action,extra='',style='light')=>`<button type="button" class="btn ${style}" data-an-action="${action}" ${extra}>${label}</button>`;
  const date=value=>{const d=new Date(value);return value&&Number.isFinite(d.getTime())?d.toLocaleString('pt-PT'):'—';};
  let record=null,note=null,answers=N.empty(),step=0,editing=false,dirty=false,busy=false,revision=0;
  const draftId=window.crypto.randomUUID(),noteId=window.crypto.randomUUID();let mutationId=window.crypto.randomUUID();
  const current=token=>()=>valid()&&revision===token;
  function notify(text,isError=false){const node=container.querySelector('#anamMessage');if(node){node.setAttribute('role',isError?'alert':'status');node.textContent=text;if(isError)node.focus();}}
  function unload(event){if(valid()&&dirty){event.preventDefault();event.returnValue='';}}
  window.addEventListener('beforeunload',unload);
  function exit(){++revision;window.removeEventListener('beforeunload',unload);back();}
  function shell(html){container.innerHTML=`<p class="muted">${esc(studentName||account.full_name||'Aluno')}</p><div id="anamMessage" role="status" aria-live="polite" tabindex="-1"></div>`+html;}
  function statusHtml(){return `<div class="card"><span class="tag">${!record?'POR PREENCHER':record.status==='completed'?'CONCLUÍDA':'EM PREENCHIMENTO'}</span><h3 style="margin-top:12px">${!record?'Anamnese por preencher':record.status==='completed'?'Anamnese concluída':'Anamnese em preenchimento'}</h3>${record?.updated_at?`<p class="muted">Atualizada: ${date(record.updated_at)}</p>`:''}</div>`;}
  const get=(root,path)=>path.split('.').reduce((value,key)=>value?.[key],root);
  function set(root,path,value){const parts=path.split('.');const last=parts.pop();let target=root;for(const key of parts)target=target[key]??=(/^\d+$/.test(key)?[]:{});target[last]=value;}
  function fieldHtml(field,data,prefix){
    if(!N.visible(field,data))return '';const path=prefix+'.'+field.key,value=data[field.key],id='an-'+path.replaceAll('.','-');
    const label=esc(field.label)+(field.required?' *':'');
    if(field.type==='list')return `<section class="card"><h3>${label}</h3>${(value||[]).map((item,i)=>`<fieldset style="border:1px solid #dbe3ed;border-radius:12px;padding:12px;min-width:0;margin:12px 0"><legend>${esc(field.itemLabel)} ${i+1}</legend>${field.fields.map(f=>fieldHtml(f,item,path+'.'+i)).join('')}${button('Remover '+field.itemLabel.toLowerCase(),'remove',`data-path="${path}" data-index="${i}"`)}</fieldset>`).join('')}${button('Adicionar '+field.itemLabel.toLowerCase(),'add',`data-path="${path}"`)}</section>`;
    if(field.type==='multi')return `<fieldset style="border:0;padding:0;margin:12px 0;min-width:0" data-multi="${path}"><legend style="font-size:14px;font-weight:700">${label}</legend>${field.options.map((o,i)=>`<label style="display:flex;align-items:center;gap:10px;min-height:44px;font-size:16px;font-weight:400"><input type="checkbox" style="width:20px;height:20px;flex-shrink:0" data-field="${path}" data-type="multi" ${field.exclusive?`data-exclusive="${esc(field.exclusive)}"`:''} value="${esc(o.value)}" ${(value||[]).includes(o.value)?'checked':''}>${esc(o.label)}</label>`).join('')}</fieldset>`;
    const common=`id="${id}" data-field="${path}" data-type="${field.type}" style="font-size:16px;min-width:0;max-width:100%"`;
    let input;
    if(field.type==='select'||field.type==='boolean'){
      const choices=field.type==='boolean'?[{value:'true',label:'Sim'},{value:'false',label:'Não'}]:field.options;
      input=`<select ${common}><option value="">Seleciona…</option>${choices.map(o=>`<option value="${esc(o.value)}" ${String(value)===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select>`;
    }else if(field.type==='textarea')input=`<textarea ${common} rows="3" maxlength="4000">${esc(value)}</textarea>`;
    else input=`<input ${common} class="input" type="${field.type==='date'?'date':'text'}" ${field.type==='number'?`inputmode="${field.integer?'numeric':'decimal'}"`:''} value="${esc(value)}" maxlength="4000">`;
    return `<label for="${id}" style="display:block;min-width:0">${label}${input}</label>`;
  }
  function collect(){
    if(!editing)return;
    const handled=new Set();
    for(const el of container.querySelectorAll('[data-field]')){
      const path=el.dataset.field;if(handled.has(path))continue;handled.add(path);
      let value=el.value;if(el.dataset.type==='boolean')value=value==='true'?true:value==='false'?false:undefined;
      if(el.dataset.type==='multi')value=[...container.querySelectorAll('[data-field]')].filter(e=>e.dataset.field===path&&e.checked).map(e=>e.value);
      set(answers,path,value);
    }
    answers=N.sanitize(answers);
  }
  function wizard(message=''){
    const section=N.sections[step];
    shell(`<p class="muted">Etapa ${step+1} de 12</p><h2 tabindex="-1" id="anamStep">${esc(section.title)}</h2><div class="progress" role="progressbar" aria-label="Progresso da anamnese" aria-valuemin="1" aria-valuemax="12" aria-valuenow="${step+1}"><i style="width:${(step+1)/12*100}%"></i></div><p class="muted" style="margin-top:12px">* Necessário para concluir. Podes guardar respostas incompletas. Cada mudança de etapa é guardada.</p>${step===0?`<div class="card">Nome no perfil: <b>${esc(studentName||account.full_name||'—')}</b><p class="muted">Estas respostas não alteram o teu perfil.</p></div>`:''}${step===3?'<div class="card notice"><b>Saúde e atenção do treinador</b><p>As respostas servem para triagem e revisão pelo treinador. Não constituem diagnóstico nem substituem avaliação médica.</p></div>':''}${step===9?'<div class="card notice">Distingue o que não gostas do que não queres realizar. O que não podes realizar por limitação física pertence à secção de saúde/lesões.</div>':''}<form id="anamForm" novalidate><fieldset id="anamFields" style="border:0;padding:0;min-width:0"><div class="card">${section.fields.map(f=>fieldHtml(f,answers[section.key],section.key)).join('')}</div>${step>0?button('Anterior','previous'):''}${button('Guardar e sair','saveExit')}${step<11?button('Seguinte','next','','green'):'<button type="submit" class="btn green">Concluir anamnese</button>'}</fieldset></form>`);
    if(message)notify(message);
  }
  function readable(fields,data){return fields.filter(f=>N.visible(f,data)).map(f=>{
    const value=data[f.key];
    if(f.type==='list')return `<div class="card"><h3>${esc(f.label)}</h3>${value?.length?value.map((item,i)=>`<h4>${esc(f.itemLabel)} ${i+1}</h4>${readable(f.fields,item)}`).join(''):'<p>Não respondido</p>'}</div>`;
    const text=value===undefined||value===null||value===''||Array.isArray(value)&&!value.length?'Não respondido':value===true?'Sim':value===false?'Não':Array.isArray(value)?value.join(' · '):value;
    return `<div style="margin:12px 0"><b>${esc(f.label)}</b><p style="white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0">${esc(text)}</p></div>`;
  }).join('');}
  function fullHtml(){return '<div>'+N.sections.map((s,i)=>`<details class="card"><summary><b>${i+1}. ${esc(s.title)}</b></summary>${readable(s.fields,answers[s.key])}</details>`).join('')+'</div>';}
  function alertsHtml(){const a=N.alerts(answers,record?.status);const names={green:'🟢 Sem alertas relevantes',yellow:'🟡 Atenção',red:'🔴 Rever antes de treino intenso'};
    return `<section class="card ${a.level==='green'?'':'notice'}" aria-label="Alertas"><h3>${names[a.level]}</h3>${a.items.map(item=>`<div style="margin:12px 0"><b>${item.level==='red'?'🔴':'🟡'} ${esc(item.title)}</b><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(item.detail)}</p></div>`).join('')}<p class="muted">Baseado nas respostas declaradas. Estes alertas não são diagnósticos, não autorizam nem proíbem exercício e não bloqueiam a aplicação. O treinador deve rever a informação.</p></section>`;}
  function overview(message=''){
    editing=false;dirty=false;
    const compatible=N.compatible(record?.answers);
    let html=button('Voltar','back')+statusHtml();
    if(!compatible)html+='<div class="card notice">Esta anamnese usa um formato diferente. É necessária revisão de compatibilidade antes de editar. Os dados existentes foram preservados.</div>';
    else{
      if(student)html+=button(!record?'Começar anamnese':record.status==='completed'?'Editar anamnese':'Continuar anamnese','edit','','green');
      if(record){html+=alertsHtml()+N.summary(answers).map(([title,value])=>`<div class="card"><h3>${esc(title)}</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(value)}</p></div>`).join('')+button('Ver anamnese completa','full')+'<section id="anamFull" hidden>'+fullHtml()+'</section>';}
    }
    if(!student)html+=`<form id="anamNotes" class="card"><h3>Observações do treinador</h3><p class="muted">Guardadas separadamente das respostas do aluno.</p><label for="anamNoteText">Observações<textarea id="anamNoteText" rows="5" maxlength="12000" style="font-size:16px">${esc(note?.notes)}</textarea></label><button type="submit" class="btn green">Guardar observações</button></form>`;
    shell(html);if(message)notify(message);
  }
  async function load(){const token=++revision;shell('<p>A carregar anamnese…</p>');try{
    record=await N.read(client,account,studentId,current(token));if(!current(token)())return;
    if(!student)note=await N.readNotes(client,account,studentId,current(token));if(!current(token)())return;
    answers=N.compatible(record?.answers)?N.sanitize(record?.answers):N.empty();overview();
  }catch(e){if(current(token)()){shell(button('Voltar','back')+button('Tentar novamente','reload'));notify(N.message(e),true);}}}
  async function save(nextStep,complete=false,leave=false){
    if(busy||!student||!valid())return;collect();
    const token=revision;
    try{N.validate(answers,complete);}catch(e){if(Number.isInteger(e.step))step=e.step;wizard();notify(N.message(e),true);return;}
    busy=true;container.querySelector('#anamFields').disabled=true;notify('A guardar no Supabase…');
    try{
      const saved=await N.save(client,account,studentId,answers,{previous:record,id:draftId,mutationId,step:nextStep,complete},current(token));
      if(!current(token)())return;record=saved;answers=N.sanitize(saved.answers);mutationId=window.crypto.randomUUID();dirty=false;
      if(leave)return exit();
      if(complete)return overview('Anamnese concluída e guardada.');
      step=nextStep;wizard('Etapa guardada.');container.querySelector('#anamStep').focus();
    }catch(e){if(current(token)())notify(N.message(e),true);}
    finally{busy=false;if(current(token)()&&container.querySelector('#anamFields'))container.querySelector('#anamFields').disabled=false;}
  }
  container.addEventListener('input',event=>{if(event.target.matches('[data-field],#anamNoteText'))dirty=true;});
  container.addEventListener('change',event=>{
    const el=event.target;if(!editing||busy||!el.dataset.field)return;
    if(el.dataset.type==='multi'&&el.dataset.exclusive&&el.checked){for(const other of container.querySelectorAll('[data-field]'))if(other!==el&&other.dataset.field===el.dataset.field&&(el.value===el.dataset.exclusive||other.value===el.dataset.exclusive))other.checked=false;}
    if(['boolean','select','multi'].includes(el.dataset.type)){const path=el.dataset.field;collect();dirty=true;wizard();container.querySelector(`[data-field="${CSS.escape(path)}"]`)?.focus();}
  });
  container.addEventListener('click',event=>{const target=event.target.closest('[data-an-action]');if(!target||!valid()||busy)return;
    const action=target.dataset.anAction;
    if(action==='back')return exit();if(action==='reload')return load();
    if(action==='edit'&&student){editing=true;step=record?.status==='draft'&&Number.isInteger(record.answers?._meta?.currentStep)?Math.min(11,Math.max(0,record.answers._meta.currentStep)):0;wizard(record?.status==='completed'?'Ao guardar alterações, a anamnese volta a Em preenchimento até voltares a concluir.':'');return;}
    if(action==='full'){const area=container.querySelector('#anamFull');area.hidden=!area.hidden;target.textContent=area.hidden?'Ver anamnese completa':'Ocultar anamnese completa';return;}
    if(action==='next')return save(step+1);if(action==='previous')return save(step-1);if(action==='saveExit')return save(step,false,true);
    if(action==='add'||action==='remove'){collect();const path=target.dataset.path;let items=get(answers,path)||[];if(action==='add'){if(items.length>=20)return notify('Podes registar até 20 itens nesta lista.',true);items.push({});}else items.splice(Number(target.dataset.index),1);set(answers,path,items);dirty=true;wizard();}
  });
  container.addEventListener('submit',async event=>{
    if(!['anamForm','anamNotes'].includes(event.target.id))return;event.preventDefault();if(!valid()||busy)return;
    if(event.target.id==='anamForm')return save(11,true);
    const token=revision,text=container.querySelector('#anamNoteText').value;busy=true;event.target.querySelector('button').disabled=true;container.querySelector('#anamNoteText').disabled=true;notify('A guardar observações…');
    try{const saved=await N.saveNotes(client,account,studentId,text,{previous:note,id:noteId},current(token));if(current(token)()){note=saved;dirty=false;notify('Observações guardadas.');}}
    catch(e){if(current(token)())notify(N.message(e),true);}
    finally{busy=false;if(current(token)()){event.target.querySelector('button').disabled=false;container.querySelector('#anamNoteText').disabled=false;}}
  });
  load();
};
