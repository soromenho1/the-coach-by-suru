(() => {
  'use strict';
  const SUPABASE_URL = 'https://ihpqwfxxjbpjizuoeqqf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ZQgAYRrde_e2HgEmjXNq6g_SXtaC1gU';
  const root = document.querySelector('#app');
  const assessments = window.CoachAssessments;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brand = () => '<div class="brand">THE COACH<small>by Suru · v0.12.0</small></div>';
  const button = (text, action, style = 'dark') => `<button class="btn ${style}" data-action="${action}">${text}</button>`;
  let view = 0, assessmentDraft = null;
  const page = (html, layout = '') => { ++view; assessmentDraft = null; root.innerHTML = `<main class="app ${layout}">${html}</main>`; };
  const head = (title, back) => `<div class="top">${back ? `<button class="back" data-action="${back}" aria-label="Voltar">‹</button>` : ''}${brand()}</div><h2>${escape(title)}</h2>`;
  const loading = () => page(brand() + '<div class="card" role="status">A carregar a tua área…</div>');
  let sb, account = null, students = [], selected = null, generation = 0, busy = false;
  const coach = () => account && ['trainer', 'admin'].includes(account.role);
  const clear = () => { ++view; assessmentDraft = null; account = null; students = []; selected = null; };
  const name = profile => profile.full_name?.trim() || 'Utilizador';
  function login(message = '') {
    page(`<section class="login-visual" aria-label="The Coach by Suru"><div class="login-logo">THE<span>COACH</span><small>by Suru</small></div><p class="login-motto">MAIS DISCIPLINA.<br>MAIS RESULTADOS.<br>UM TU MAIS FORTE.</p></section><section class="login-content" aria-label="Login"><div class="login-intro"><p class="login-eyebrow">O TEU PRÓXIMO PASSO</p><h1>O teu progresso<br>começa aqui.</h1><p>Entra na tua conta.</p></div><form id="loginForm">${message ? `<p class="login-alert" role="alert">${escape(message)}</p>` : ''}<label for="loginEmail">Email</label><input id="loginEmail" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" required><label for="loginPassword">Palavra-passe</label><div class="login-password"><input id="loginPassword" name="password" type="password" autocomplete="current-password" required><button type="button" class="login-eye" data-action="showPassword" aria-label="Mostrar palavra-passe" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div><details class="login-help"><summary>Precisas de ajuda para entrar?</summary><p>Contacta o teu treinador ou o administrador da app para obteres ajuda com o acesso à tua conta.</p></details><button class="login-submit" type="submit">Entrar <span aria-hidden="true">↗</span></button></form><p class="login-footer">THE COACH by Suru <span>v0.12.0</span></p></section>`, 'login-app');
  }
  function failure(message) {
    clear();
    page(head('Não foi possível abrir a tua área') + `<div class="card" role="alert">${escape(message)}</div>` + button('Tentar novamente', 'retry') + button('Terminar sessão', 'logout', 'light'));
  }
  async function associatedStudents(id) {
    const ids = new Set();
    for (let offset = 0; ; offset += 500) {
      const {data, error} = await sb.from('trainer_students').select('student_id').eq('trainer_id', id).eq('active', true).order('student_id').range(offset, offset + 499);
      if (error || !Array.isArray(data)) throw new Error('Não foi possível carregar os alunos associados. Tenta novamente.');
      data.forEach(row => { if (row.student_id) ids.add(row.student_id); });
      if (data.length < 500) break;
    }
    const result = [], all = [...ids];
    for (let offset = 0; offset < all.length; offset += 100) {
      const {data, error} = await sb.from('profiles').select('id,full_name,role').in('id', all.slice(offset, offset + 100)).eq('role', 'student');
      if (error || !Array.isArray(data)) throw new Error('Não foi possível ler os perfis dos alunos. Tenta novamente.');
      result.push(...data.filter(row => ids.has(row.id) && row.role === 'student'));
    }
    return result.sort((a, b) => name(a).localeCompare(name(b), 'pt'));
  }
  async function enter(user, ticket) {
    try {
      const {data, error} = await sb.from('profiles').select('id,full_name,role').eq('id', user.id).maybeSingle();
      if (ticket !== generation) return;
      if (error) throw new Error('Não foi possível carregar o teu perfil. Tenta novamente.');
      if (!data || data.id !== user.id) throw new Error('A tua conta ainda não tem um perfil disponível. Contacta o administrador.');
      if (!['trainer', 'student', 'admin'].includes(data.role)) throw new Error('O teu perfil não tem uma área válida. Contacta o administrador.');
      const linked = ['trainer', 'admin'].includes(data.role) ? await associatedStudents(user.id) : [];
      if (ticket !== generation) return;
      account = data;
      students = linked;
      dashboard();
    } catch (error) {
      if (ticket === generation) failure(error.message || 'Não foi possível ligar ao serviço. Tenta novamente.');
    }
  }
  function dashboard() {
    if (!account) return;
    selected = null;
    if (coach()) {
      page(window.CoachTrainerDashboard.shell(account), 'trainer-app');
      const ticket = generation, screen = view, actor = account;
      window.CoachTrainerDashboard.mount(root.querySelector('.trainer-app'), {
        client: sb, account, students,
        valid: () => ticket === generation && screen === view && actor === account,
        open: destination => list(destination === 'list' ? '' : destination), profile, logout
      });
    } else {
      selected = account;
      studentPanel();
    }
  }
  function studentPanel(initialScreen='home') {
    page('<section id="studentDashboard"></section>');
    const context=currentContext();
    window.mountStudentDashboard(root.querySelector('#studentDashboard'),{client:sb,account:context.actor,studentId:context.studentId,studentName:name(selected),valid:context.valid,initialScreen,back:list,open:action=>action==='logout'?logout():modulePage(action),openTraining:route=>modulePage('plan',route)});
  }
  function coachPage(title,active,content,subtitle='') {
    const T=window.CoachTrainerDashboard;
    page(T.frame(account,{active,title:account.role==='admin'?'Área de administração':'Área do treinador',content:
      `<div class="tc-page"><header class="tc-heading"><div><p class="tc-eyebrow">${active==='list'?'ACOMPANHAMENTO':active==='plan'?'PLANEAMENTO DE TREINO':active==='progress'?'EVOLUÇÃO DOS ALUNOS':'ACOMPANHAMENTO NUTRICIONAL'}</p><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div><span class="tc-heading-icon ${active==='nutrition'?'mint':active==='plan'?'peach':active==='progress'?'lavender':'blue'}">${T.icon(active==='list'?'users':active==='plan'?'training':active==='progress'?'progress':'nutrition')}</span></header>${content}</div>`}), 'trainer-app');
    const ticket=generation,screen=view;
    T.mountNavigation(root.querySelector('.trainer-app'),{
      valid:()=>ticket===generation&&screen===view&&coach(),
      canLeave:()=>{const area=root.querySelector('#nutritionArea')||root.querySelector('#workoutArea');return !area?.canLeave||area.canLeave();},
      navigate:key=>{if(key==='logout')return logout();if(key==='home'||key==='calendar'){dashboard();if(key==='calendar')root.querySelector('#trainer-calendar')?.scrollIntoView({behavior:'smooth'});return;}list(key==='list'?'':key);}
    });
  }
  function list(destination = '') {
    if (!coach()) return;
    selected = null;
    const purpose = {plan: 'criar ou gerir treinos', nutrition: 'criar ou gerir nutrição', progress: 'ver o progresso'}[destination];
    const initials=s=>name(s).split(/\s+/).slice(0,2).map(v=>v[0]).join('');
    const studentCards=students.map(s=>`<article class="tc-student-card" data-student-card="${escape(name(s))}"><span class="tc-student-badge">Aluno associado</span><button type="button" class="tc-student-profile" data-student="${escape(s.id)}" data-destination="${escape(purpose?destination:'')}"><span class="td-avatar">${escape(initials(s))}</span><h2>${escape(name(s))}</h2><span>${purpose?'Selecionar aluno':'Abrir acompanhamento'} <span aria-hidden="true">↗</span></span></button><div class="tc-student-actions">${[['plan','Treinos'],['nutrition','Nutrição'],['progress','Progresso']].map(([route,label])=>`<button type="button" data-student="${escape(s.id)}" data-destination="${route}">${label}</button>`).join('')}</div></article>`).join('');
    coachPage(purpose?{plan:'Treinos',nutrition:'Nutrição',progress:'Progresso'}[destination]:'Alunos',purpose?destination:'list',
      `<section id="trainerStudents"><div class="tc-directory-toolbar"><label>Pesquisar alunos<input class="input" type="search" data-student-search placeholder="Pesquisar por nome…" autocomplete="off"></label><span class="tc-count" data-search-count role="status">${students.length} ${students.length===1?'aluno':'alunos'}</span></div><div class="tc-student-grid">${studentCards}</div><div class="tc-empty" data-search-empty ${students.length?'hidden':''}><h2>${students.length?'Nenhum aluno encontrado':'Ainda não tens alunos associados'}</h2><p>${students.length?'Experimenta outro nome ou limpa a pesquisa.':'Os alunos aparecem aqui quando forem associados à tua conta.'}</p></div></section>`,
      purpose?`Escolhe um aluno para ${purpose}.`:'Cada aluno tem um caminho. Acompanha todos, num só lugar.');
    window.CoachTrainerDashboard.mountDirectory(root.querySelector('#trainerStudents'));
  }
  function profile(id, destination) {
    if (!coach()) return;
    selected = students.find(s => s.id === id);
    if (!selected) return list();
    if (['plan', 'nutrition', 'progress'].includes(destination)) return modulePage(destination);
    studentPanel();
  }
  const moduleItems = [
    ['🍽️', 'Nutrição', 'Metas, macros e hidratação', 'nutrition'],
    ['🩺', 'Anamnese', 'Saúde, histórico e objetivos', 'anam'],
    ['📏', 'Avaliação física', 'Peso, gordura e perímetros', 'evals'],
    ['📈', 'Evolução', 'Histórico e gráficos', 'progress'],
    ['💧', 'Água', 'Objetivo e consumo diário', 'hydration'],
    ['🏃', 'Cardio', 'Registar sessões', 'cardio'],
    ['📝', 'Check-in semanal', 'Sono, energia, stress e dor', 'checkin']
  ];
  function modules() {
    return '<h3 class="section">Acompanhamento</h3>' + moduleItems.map(m => `<button type="button" class="card module" style="width:100%;border:0;text-align:left;font:inherit;color:inherit" data-action="${m[3]}"><span class="ico">${m[0]}</span><div><b>${m[1]}</b><small>${m[2]}</small></div><span>›</span></button>`).join('');
  }
  function modulePage(action,initialRoute) {
    if (!account || !selected || (coach() ? !students.some(s => s.id === selected.id) : selected.id !== account.id)) return;
    if (action === 'evals' || action === 'progress') return assessmentPage(action);
    if (action === 'anam') {
      page(head('Anamnese') + '<section id="anamnesisArea" style="overflow-wrap:anywhere"></section>');
      const context = currentContext();
      window.mountCoachAnamnesis(root.querySelector('#anamnesisArea'), {client: sb, account: context.actor, studentId: context.studentId, studentName: name(selected), valid: context.valid, back: () => coach() ? profile(context.studentId) : dashboard()});
      return;
    }
    if (action === 'nutrition') {
      const content='<section id="nutritionArea" class="tc-module tc-nutrition" style="overflow-wrap:anywhere"></section>';
      if(coach())coachPage('Nutrição','nutrition',content,name(selected)+' · Alimentação alinhada com os objetivos.');
      else page(head('Nutrição')+content);
      const context = currentContext();
      window.mountCoachNutrition(root.querySelector('#nutritionArea'), {client: sb, account: context.actor, studentId: context.studentId, studentName: name(selected), valid: context.valid, back: () => coach() ? profile(context.studentId) : dashboard()});
      return;
    }
    if (action === 'plan') {
      const content='<section id="workoutArea" class="tc-module tc-workouts" style="overflow-wrap:anywhere"></section>';
      if(coach())coachPage('Plano de treino','plan',content,name(selected)+' · Planeia, acompanha e ajusta cada etapa.');
      else page(head('Plano de treino')+content);
      const context = currentContext();
      window.mountCoachWorkouts(root.querySelector('#workoutArea'), {client: sb, account: context.actor, studentId: context.studentId, valid: context.valid, back: () => coach() ? profile(context.studentId) : dashboard(),initialRoute});
      return;
    }
    const title = action === 'plan' ? 'Plano de treino' : moduleItems.find(m => m[3] === action)?.[1];
    if (!title) return;
    page(head(title, 'backProfile') + `<div class="card"><b>${escape(name(selected))}</b><p class="muted" style="margin-top:12px">Este módulo ainda não está ligado a dados reais. Não existem registos disponíveis nesta versão.</p></div>`);
  }
  function currentContext() {
    const ticket = generation, screen = view, studentId = selected?.id, actor = account;
    return {studentId, actor, valid: () => ticket === generation && screen === view && studentId === selected?.id && account === actor};
  }
  function statsPlaceholder() {
    return '<div id="assessmentStats" aria-live="polite"><div class="grid"><div class="card stat"><b>—</b><span class="muted">Peso</span></div><div class="card stat"><b>—</b><span class="muted">Massa gorda</span></div></div><p class="muted">A carregar a última avaliação…</p></div>';
  }
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : 'Sem data';
  async function refreshStats() {
    const context = currentContext();
    try {
      const rows = await assessments.read(sb, context.actor, context.studentId, true, context.valid);
      if (!context.valid()) return;
      const row = rows[0];
      root.querySelector('#assessmentStats').innerHTML = `<div class="grid"><div class="card stat"><b>${assessments.format(row?.weight, 'kg')}</b><span class="muted">Peso</span></div><div class="card stat"><b>${assessments.format(row?.body_fat, '%')}</b><span class="muted">Massa gorda</span></div></div><p class="muted">${row ? 'Última avaliação: ' + dateLabel(row.assessment_date) : 'Ainda não existem avaliações.'}</p>`;
    } catch (error) {
      if (context.valid()) root.querySelector('#assessmentStats').innerHTML = `<div class="card" role="alert">${escape(assessments.message(error, 'ler a última avaliação'))}${button('Tentar novamente', 'statsRetry', 'light')}</div>`;
    }
  }
  function localDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function assessmentForm() {
    const inputs = assessments.fields.map(([key, label, unit]) => `<label style="min-width:0" for="assessment-${key}">${label} (${unit})<input id="assessment-${key}" name="${key}" class="input" type="text" inputmode="decimal" autocomplete="off" style="font-size:16px;min-width:0" aria-describedby="assessmentHelp"></label>`);
    const pairs = [];
    for (let i = 0; i < inputs.length; i += 2) pairs.push(`<div class="row">${inputs.slice(i, i + 2).join('')}</div>`);
    return `<form id="assessmentForm" class="card" novalidate><h3>Nova avaliação</h3><p class="muted" id="assessmentHelp">Usa vírgula ou ponto decimal. Preenche pelo menos uma medição; os restantes campos são opcionais.</p><label for="assessment-date">Data<input id="assessment-date" class="input" name="assessment_date" type="date" required value="${localDate()}" style="font-size:16px;min-width:0;max-width:100%"></label>${pairs.join('')}<label for="assessment-notes">Observações<textarea id="assessment-notes" name="notes" rows="3" style="font-size:16px"></textarea></label><div id="assessmentMessage" role="status" aria-live="polite" tabindex="-1"></div><button type="submit" class="btn green">Guardar avaliação</button></form>`;
  }
  function assessmentPage(action, notice = '') {
    const title = action === 'evals' ? 'Avaliação física' : 'Evolução';
    page(head(title, 'backProfile') + `<p class="muted">${escape(name(selected))}</p>` +
      (notice ? `<div class="card" role="status">${escape(notice)}</div>` : '') +
      (action === 'evals' && coach() ? assessmentForm() : '') + '<section id="assessmentHistory" aria-live="polite"><div class="card" role="status">A carregar avaliações…</div></section>');
    if (action === 'evals' && coach()) assessmentDraft = {id: window.crypto.randomUUID(), saving: false};
    refreshHistory(action);
  }
  function historyHtml(rows) {
    return '<h3 class="section">Histórico de avaliações</h3>' + rows.map(row => `<details class="card"><summary><b>${escape(dateLabel(row.assessment_date))}</b><p class="muted" style="margin:8px 0 0">Peso: ${assessments.format(row.weight, 'kg')} · Massa gorda: ${assessments.format(row.body_fat, '%')}</p></summary>${assessments.fields.map(([key, label, unit]) => `<div class="check"><span>${label}</span><b>${assessments.format(row[key], unit)}</b></div>`).join('')}${row.notes ? `<h3 class="section">Observações</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(row.notes)}</p>` : ''}</details>`).join('');
  }
  function evolutionHtml(rows) {
    const change = (key, unit) => {
      const delta = assessments.difference(rows, key);
      return delta === null ? '—' : `${delta > 0 ? '+' : ''}${assessments.format(delta, unit)}`;
    };
    const summary = rows.length > 1 ? `<p class="muted">Diferença entre ${dateLabel(rows[rows.length - 1].assessment_date)} e ${dateLabel(rows[0].assessment_date)}. — indica uma medição em falta na primeira ou última avaliação.</p><div class="grid"><div class="card stat"><b>${change('weight', 'kg')}</b><span class="muted">Variação do peso</span></div><div class="card stat"><b>${change('body_fat', 'p.p.')}</b><span class="muted">Variação da massa gorda</span></div></div>` : '<div class="card notice">São necessárias duas avaliações para mostrar a evolução.</div>';
    return summary + '<h3 class="section">Peso e massa gorda</h3>' + rows.map(row => `<div class="card"><b>${escape(dateLabel(row.assessment_date))}</b><div class="check"><span>Peso</span><b>${assessments.format(row.weight, 'kg')}</b></div><div class="check"><span>Massa gorda</span><b>${assessments.format(row.body_fat, '%')}</b></div></div>`).join('');
  }
  async function refreshHistory(action) {
    const context = currentContext();
    try {
      const rows = await assessments.read(sb, context.actor, context.studentId, false, context.valid);
      if (!context.valid()) return;
      root.querySelector('#assessmentHistory').innerHTML = rows.length ? (action === 'progress' ? evolutionHtml(rows) : historyHtml(rows)) : '<div class="card">Ainda não existem avaliações para este aluno.</div>';
    } catch (error) {
      if (context.valid()) root.querySelector('#assessmentHistory').innerHTML = `<div class="card" role="alert">${escape(assessments.message(error, 'ler o histórico de avaliações'))}${button('Tentar novamente', action === 'progress' ? 'progressRetry' : 'historyRetry', 'light')}</div>`;
    }
  }
  async function saveAssessment(form) {
    if (!coach() || !selected || !students.some(s => s.id === selected.id) || !assessmentDraft || assessmentDraft.saving) return;
    const context = currentContext(), draft = assessmentDraft;
    const values = Object.fromEntries([...assessments.fields.map(([key]) => key), 'assessment_date', 'notes'].map(key => [key, form.elements[key].value]));
    const message = form.querySelector('#assessmentMessage'), submit = form.querySelector('button[type="submit"]');
    const showError = error => {
      message.setAttribute('role', 'alert');
      message.textContent = error.field ? error.message : assessments.message(error, 'guardar a avaliação');
      if (error.field) form.elements[error.field]?.focus(); else message.focus();
    };
    try { assessments.validate(values); } catch (error) { showError(error); return; }
    draft.saving = true; submit.disabled = true; submit.textContent = 'A guardar…';
    message.setAttribute('role', 'status'); message.textContent = 'A guardar a avaliação no Supabase…';
    try {
      const result = await assessments.save(sb, context.actor, context.studentId, values, draft, context.valid);
      if (!context.valid()) return;
      assessmentPage('evals', result.recovered ? 'Esta avaliação já tinha sido guardada. O histórico foi atualizado; as alterações desta tentativa não foram gravadas.' : 'Avaliação guardada com sucesso.');
    } catch (error) {
      if (context.valid()) showError(error);
    } finally {
      draft.saving = false;
      if (context.valid()) { submit.disabled = false; submit.textContent = 'Guardar avaliação'; }
    }
  }
  async function logout() {
    ++generation;
    clear();
    loading();
    try {
      const {error} = await sb.auth.signOut({scope: 'local'});
      if (error) throw error;
      login();
    } catch {
      failure('Não foi possível terminar a sessão. Tenta novamente.');
    }
  }
  async function retry() {
    const ticket = ++generation;
    clear(); loading();
    try {
      const {data, error} = await sb.auth.getSession();
      if (ticket !== generation) return;
      if (error) throw error;
      if (data.session?.user) await enter(data.session.user, ticket); else login();
    } catch { if (ticket === generation) failure('Não foi possível recuperar a sessão. Tenta novamente.'); }
  }
  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.student) return profile(target.dataset.student, target.dataset.destination);
    const action = target.dataset.action;
    if (action === 'logout') return logout();
    if (action === 'retry') return retry();
    if (action === 'showPassword') {
      const input = root.querySelector('#loginPassword');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      target.setAttribute('aria-pressed', String(show));
      target.setAttribute('aria-label', show ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe');
      return;
    }
    if (!account) return;
    if (action === 'statsRetry') return refreshStats();
    if (action === 'historyRetry' || action === 'progressRetry') return refreshHistory(action === 'progressRetry' ? 'progress' : 'evals');
    if (action === 'dashboard') dashboard();
    else if (action === 'list') list();
    else if (action === 'backProfile') coach() ? profile(selected?.id) : dashboard();
    else modulePage(action);
  });
  root.addEventListener('submit', async event => {
    if (event.target.id === 'assessmentForm') { event.preventDefault(); return saveAssessment(event.target); }
    if (event.target.id !== 'loginForm') return;
    event.preventDefault();
    if (busy || !sb) return;
    const email = event.target.elements.email.value.trim(), password = event.target.elements.password.value;
    if (!email || !password) return login('Preenche o email e a palavra-passe.');
    busy = true;
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = 'A entrar…';
    const ticket = generation;
    try {
      const {error} = await sb.auth.signInWithPassword({email, password});
      if (error && ticket === generation) login('Não foi possível entrar. Verifica o email e a palavra-passe e tenta novamente.');
    } catch { if (ticket === generation) login('Não foi possível ligar ao serviço. Verifica a ligação e tenta novamente.'); }
    finally { busy = false; }
  });
  loading();
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    // Do not await Supabase operations inside its auth callback: dispatch after the lock is released.
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session?.user.id === account?.id) return;
      // Supabase may emit SIGNED_IN on tab focus; keep an in-progress form intact.
      if (event === 'SIGNED_IN' && session?.user.id === account?.id) return;
      const ticket = ++generation;
      clear();
      if (!session?.user) return login();
      loading();
      setTimeout(() => { if (ticket === generation) enter(session.user, ticket); }, 0);
    });
  } catch {
    page(brand() + '<div class="card" role="alert">Não foi possível carregar a ligação ao Supabase. Verifica a ligação à Internet e recarrega a página.</div>');
  }
})();
