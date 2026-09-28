(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CoachTrainerDashboard=api;
})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths={home:'M3 11 12 3l9 8v10h-6v-7H9v7H3Z',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-4',training:'M3 8v8 M6 5v14 M18 5v14 M21 8v8 M6 12h12',nutrition:'M4 3v6a3 3 0 0 0 6 0V3 M7 3v19 M17 22V3c-4 3-4 10 0 10',progress:'M4 3v17h17 M8 15l4-5 4 2 5-7',calendar:'M4 5h16v16H4Z M8 2v6 M16 2v6 M4 10h16 M8 14h3',logout:'M9 4H3v16h6 M8 12h13 M17 8l4 4-4 4',arrow:'M4 12h16 M15 7l5 5-5 5',refresh:'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-2l2 3 M4 16l2 3a7 7 0 0 0 12-2'};
  const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[k]||paths.arrow}"/></svg>`;
  const name=s=>s.full_name?.trim()||'Utilizador';
  const initials=s=>name(s).split(/\s+/).slice(0,2).map(v=>v[0]).join('');
  const dayOf=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const date=v=>new Date(v+'T12:00:00').toLocaleDateString('pt-PT',{day:'numeric',month:'short'});
  const action=(label,key,ico,cls='')=>`<button type="button" class="td-button ${cls}" data-td="${key}" aria-label="${label}">${icon(ico)}<span>${label}</span></button>`;
  async function read(client,ids,table,columns,filter,valid){
    const out=[];
    for(let i=0;i<ids.length;i+=100){
      for(let offset=0;;offset+=500){
        if(!valid())throw Error('Sessão alterada.');
        const result=await filter(client.from(table).select(columns).in('student_id',ids.slice(i,i+100))).order('id').range(offset,offset+499);
        if(result.error||!Array.isArray(result.data))throw Error('Dados indisponíveis.');
        out.push(...result.data.filter(r=>ids.includes(r.student_id)));
        if(result.data.length<500)break;
      }
    }
    return out;
  }
  async function load(client,account,students,now=new Date(),valid=()=>true){
    if(!['trainer','admin'].includes(account?.role))throw Error('Área reservada ao treinador.');
    // IDs come only from the existing authenticated active-association loader. RLS remains authoritative.
    const ids=[...new Set(students.map(s=>s.id))],day=dayOf(now),end=new Date(now);
    end.setHours(0,0,0,0);end.setDate(end.getDate()+1);
    const start=new Date(now);start.setHours(0,0,0,0);
    const result=await Promise.allSettled([
      read(client,ids,'workout_plans','id,student_id,active,start_date,end_date',q=>q.eq('active',true),valid),
      read(client,ids,'workout_sessions','id,student_id,started_at,finished_at',q=>q.gte('started_at',start.toISOString()).lt('started_at',end.toISOString()),valid),
      read(client,ids,'assessments','id,student_id,assessment_date',q=>q.gte('assessment_date',day.slice(0,7)+'-01').lte('assessment_date',day),valid)
    ]);
    const data=Object.fromEntries(['plans','sessions','assessments'].map((key,i)=>[key,result[i].status==='fulfilled'?result[i].value:null]));
    if(data.plans)data.plans=data.plans.filter(p=>(!p.start_date||p.start_date<=day)&&(!p.end_date||p.end_date>=day));
    return data;
  }
  function frame(account,{active='home',title='Área do treinador',content=''}){
    const full=name(account);
    return `<div class="td-layout"><aside class="td-sidebar"><div class="td-brand">THE COACH<small>by Suru</small></div><p class="td-nav-label">O TEU ESPAÇO</p><nav aria-label="Navegação do treinador">${[['Visão geral','home','home'],['Alunos','list','users'],['Treinos','plan','training'],['Nutrição','nutrition','nutrition'],['Progresso','progress','progress'],['Calendário','calendar','calendar']].map(([label,key,ico])=>action(label,key,ico,key===active?'is-current':'').replace(key===active?'data-td="'+key+'"':'__none__','data-td="'+key+'" aria-current="page"')).join('')}</nav><div class="td-sidebar-bottom"><div class="td-coach"><span class="td-avatar">${esc(initials(account))}</span><div><b>${esc(full)}</b><small>${account.role==='admin'?'Administrador':'Treinador'}</small></div></div>${action('Terminar sessão','logout','logout')}</div></aside>
    <div class="td-main"><header class="td-top"><span>${esc(title)}</span><span class="td-date">${new Date().toLocaleDateString('pt-PT',{day:'numeric',month:'long',year:'numeric'})}</span></header>${content}</div></div>`;
  }
  function shell(account){
    const first=name(account).split(/\s+/)[0];
    return frame(account,{title:account.role==='admin'?'Área de administração':'Área do treinador',content:`<section class="td-greeting"><div><h1>Olá, ${esc(first)} 👋</h1><p>Vamos ajudar os teus alunos a ir mais longe.<br>Acompanha, planeia e inspira — tudo num só lugar.</p></div>${action('Atualizar','refresh','refresh','td-refresh')}</section>
    <section class="td-hero" aria-label="O teu acompanhamento faz a diferença"><div><span class="td-eyebrow">CADA ALUNO. UM NOVO OBJETIVO.</span><h2>O próximo passo<br>começa contigo.</h2><p>Transforma dedicação em evolução.<br>Estamos juntos em cada conquista.</p><button type="button" data-td="list">Acompanhar alunos ${icon('arrow')}</button></div></section>
    <section aria-label="Ações principais" class="td-actions">${[['users','Gerir alunos','Todos os teus alunos, mais perto.','list','blue'],['training','Criar treinos','Planos à medida de cada objetivo.','plan','peach'],['nutrition','Criar nutrição','Alimentação que acompanha a evolução.','nutrition','mint'],['progress','Ver progresso','Cada conquista conta.','progress','lavender']].map(([ico,title,copy,key,color])=>`<button type="button" class="td-action ${color}" data-td="${key}" aria-label="${title}"><span class="td-action-icon">${icon(ico)}</span><h2>${title}</h2><p>${copy}</p><span class="td-action-arrow">${icon('arrow')}</span></button>`).join('')}</section>
    <div data-td-status role="status" aria-live="polite"></div><section class="td-metrics" aria-label="Resumo dos alunos" data-td-metrics></section>
    <div class="td-columns"><section class="td-panel"><div class="td-section-head"><h2>Alunos recentes</h2><button type="button" data-td="list">Ver todos <span aria-hidden="true">↗</span></button></div><p class="td-caption">Atividade registada este mês</p><div data-td-students></div></section><section class="td-panel" id="trainer-calendar" tabindex="-1"><div class="td-section-head"><h2>Calendário de hoje</h2>${icon('calendar')}</div><p class="td-caption">${new Date().toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'})}</p><div data-td-calendar></div><p class="td-footnote">Sessões iniciadas hoje. A agenda de marcações ainda não está disponível.</p></section></div>
    <footer class="td-banner"><div><span class="td-eyebrow">THE COACH by Suru</span><h2>Treinos melhores. Resultados reais.</h2><p>O teu conhecimento. A dedicação deles. Uma equipa.</p></div><span class="td-banner-icon">${icon('training')}</span></footer><p class="td-signoff">Feito para acompanhar. Pensado para evoluir.</p>`});
  }
  function mountNavigation(container,{valid,navigate,canLeave=()=>true}){
    const nav=container.querySelector('.td-sidebar nav'),active=nav.querySelector('[aria-current=page]');
    if(active&&nav.scrollWidth>nav.clientWidth)nav.scrollLeft=Math.max(0,active.offsetLeft-nav.offsetLeft-12);
    container.addEventListener('click',event=>{
      const button=event.target.closest('[data-td]');
      if(!button||!valid()||!canLeave())return;
      navigate(button.dataset.td);
    });
  }
  function mountDirectory(container){
    const search=container.querySelector('[data-student-search]');
    const normal=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt');
    search.addEventListener('input',()=>{
      const query=normal(search.value.trim());let count=0;
      container.querySelectorAll('[data-student-card]').forEach(card=>{card.hidden=!normal(card.dataset.studentCard).includes(query);if(!card.hidden)count++;});
      container.querySelector('[data-search-count]').textContent=count+' '+(count===1?'aluno':'alunos');
      container.querySelector('[data-search-empty]').hidden=count!==0;
    });
  }
  function mount(container,{client,account,students,valid,open,profile,logout}){
    let data=null,revision=0;
    const current=()=>container.isConnected&&valid();
    const slot=key=>container.querySelector(`[data-td-${key}]`);
    function render(){
      if(!current())return;
      const stats=[[students.length,'Alunos associados','users','Associações ativas'],[data?.plans?.length,'Planos de treino ativos','training','Dentro do período de validade'],[data?.sessions?.length,'Treinos hoje','calendar','Sessões iniciadas hoje'],[data?.assessments?.length,'Avaliações este mês','progress','Acompanhamento físico']];
      slot('metrics').innerHTML=stats.map(([n,label,ico,detail],i)=>`<article class="td-metric"><span class="td-metric-icon ${['blue','peach','mint','lavender'][i]}">${icon(ico)}</span><div><strong>${n==null?'—':n.toLocaleString('pt-PT')}</strong><h2>${label}</h2><small>${data&&n==null?'Indisponível':detail}</small></div></article>`).join('');
      const activity=new Map();
      for(const r of data?.assessments||[])activity.set(r.student_id,[activity.get(r.student_id)||'',r.assessment_date].sort().pop());
      for(const r of data?.sessions||[])activity.set(r.student_id,dayOf(new Date(r.started_at)));
      const ordered=[...students].sort((a,b)=>(activity.get(b.id)||'').localeCompare(activity.get(a.id)||'')||name(a).localeCompare(name(b),'pt'));
      slot('students').innerHTML=ordered.slice(0,4).map(s=>`<button type="button" class="td-student" data-td-student="${esc(s.id)}"><span class="td-avatar">${esc(initials(s))}</span><span><b>${esc(name(s))}</b><small>${activity.has(s.id)?'Último registo · '+esc(date(activity.get(s.id))):'Aluno associado'}</small></span><span class="td-chevron" aria-hidden="true">›</span></button>`).join('')||'<div class="td-empty">Ainda não tens alunos associados.<small>Os alunos aparecem aqui quando forem associados à tua conta.</small></div>';
      slot('calendar').innerHTML=!data?'<p class="td-empty">A carregar sessões…</p>':data.sessions===null?'<p class="td-empty">Não foi possível carregar as sessões. Usa Atualizar para tentar novamente.</p>':data.sessions.length?[...data.sessions].sort((a,b)=>a.started_at.localeCompare(b.started_at)).map(s=>`<button type="button" class="td-session" data-td-student="${esc(s.student_id)}" data-td-destination="plan"><time>${new Date(s.started_at).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}</time><span><b>${esc(name(students.find(p=>p.id===s.student_id)||{}))}</b><small>Sessão de treino · ${s.finished_at?'Concluída':'Em curso'}</small></span><span class="td-session-dot ${s.finished_at?'done':''}"></span></button>`).join(''):'<div class="td-empty">Um novo dia para evoluir.<small>Ainda não há sessões de treino registadas hoje.</small></div>';
    }
    async function refresh(){
      const ticket=++revision;
      slot('status').textContent='A atualizar o resumo…';
      const next=await load(client,account,students,new Date(),()=>current()&&ticket===revision);
      if(!current()||ticket!==revision)return;
      data=next;render();slot('status').textContent=Object.values(data).some(v=>v===null)?'Alguns dados estão indisponíveis. Usa Atualizar para tentar novamente.':'';
    }
    container.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b||!current())return;
      if(b.dataset.tdStudent)return profile(b.dataset.tdStudent,b.dataset.tdDestination);
      const key=b.dataset.td;
      if(key==='logout')return logout();
      if(key==='refresh')return refresh();
      if(key==='calendar'){const el=container.querySelector('#trainer-calendar');el.scrollIntoView({behavior:'smooth',block:'center'});el.focus({preventScroll:true});return;}
      if(key==='home'){container.querySelector('.td-top').scrollIntoView({behavior:'smooth'});return;}
      if(['list','plan','nutrition','progress'].includes(key))open(key);
    });
    render();refresh();
  }
  return {load,shell,frame,mount,mountNavigation,mountDirectory,dayOf,icon};
});
