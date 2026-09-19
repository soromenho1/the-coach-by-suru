(() => {
  'use strict';
  const SUPABASE_URL = 'https://ihpqwfxxjbpjizuoeqqf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ZQgAYRrde_e2HgEmjXNq6g_SXtaC1gU';
  const root = document.querySelector('#app');
  const assessments = window.CoachAssessments;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brand = () => '<div class="brand">THE COACH<small>by Suru · v0.7</small></div>';
  const button = (text, action, style = 'dark') => `<button class="btn ${style}" data-action="${action}">${text}</button>`;
  let view = 0, assessmentDraft = null;
  const page = html => { ++view; assessmentDraft = null; root.innerHTML = `<main class="app">${html}</main>`; };
  const head = (title, back) => `<div class="top">${back ? `<button class="back" data-action="${back}" aria-label="Voltar">‹</button>` : ''}${brand()}</div><h2>${escape(title)}</h2>`;
  const loading = () => page(brand() + '<div class="card" role="status">A carregar a tua área…</div>');
  let sb, account = null, students = [], selected = null, generation = 0, busy = false;
  const coach = () => account && ['trainer', 'admin'].includes(account.role);
  const clear = () => { ++view; assessmentDraft = null; account = null; students = []; selected = null; };
  const name = profile => profile.full_name?.trim() || 'Utilizador';
  function login(message = '') {
    page(brand() + '<div class="hero"><h1>Bem-vindo ao<br>The Coach.</h1><p class="muted">Entra com a tua conta.</p></div>' +
      `<form id="loginForm" class="card"><h3>Login</h3>${message ? `<p role="alert" style="color:#c0392b">${escape(message)}</p>` : ''}` +
      '<label>Email<input name="email" class="input" type="email" autocomplete="email" required></label>' +
      '<label>Password<input name="password" class="input" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn dark" type="submit">Entrar</button></form><p class="muted" style="text-align:center;margin-top:28px">The Coach by Suru · conta segura</p>');
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
      page(head(`Olá, ${name(account)} 👋`) + `<p class="muted">${account.role === 'admin' ? 'Área de administração' : 'Área do treinador'}</p>` +
        `<div class="grid"><div class="card stat"><b>${students.length}</b><span class="muted">Alunos associados</span></div><div class="card stat"><b>—</b><span class="muted">Treinos hoje</span></div></div>` +
        '<div class="card notice"><b>Acompanhamento</b><p class="muted">Consulta os alunos associados à tua conta.</p></div>' + button('Gerir alunos', 'list') + button('Terminar sessão', 'logout', 'light'));
    } else {
      selected = account;
      page(head(`Olá, ${name(account)} 👋`) + '<p class="muted">Área do aluno</p>' +
        statsPlaceholder() + '<div class="card"><span class="tag">TREINO DE HOJE</span><h2 style="margin-top:12px">Plano de treino</h2><p class="muted">Escolhe o treino que vais realizar hoje.</p>' + button('Abrir planos e treinos', 'plan', 'green') + '</div>' + modules() + button('Terminar sessão', 'logout', 'light'));
      refreshStats();
    }
  }
  function list() {
    if (!coach()) return;
    selected = null;
    page(head('Alunos', 'dashboard') + (students.length ? students.map(s =>
      `<button type="button" class="card student" data-student="${escape(s.id)}" style="width:100%;border:0;text-align:left;font:inherit;color:inherit"><span class="avatar">${escape(name(s)[0])}</span><span class="student-info"><b>${escape(name(s))}</b><span class="muted" style="display:block">Aluno associado</span></span><span>›</span></button>`).join('') : '<div class="card"><h3>Ainda não tens alunos associados</h3><p class="muted">Os alunos aparecem aqui quando forem associados à tua conta.</p></div>'));
  }
  function profile(id) {
    if (!coach()) return;
    selected = students.find(s => s.id === id);
    if (!selected) return list();
    page(head(name(selected), 'list') + '<span class="tag">ALUNO ASSOCIADO</span>' + statsPlaceholder() + modules() + button('Plano de treino', 'plan'));
    refreshStats();
  }
  const moduleItems = [
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
  function modulePage(action) {
    if (!account || !selected || (coach() ? !students.some(s => s.id === selected.id) : selected.id !== account.id)) return;
    if (action === 'evals' || action === 'progress') return assessmentPage(action);
    if (action === 'plan') {
      page(head('Plano de treino') + '<section id="workoutArea" style="overflow-wrap:anywhere"></section>');
      const context = currentContext();
      window.mountCoachWorkouts(root.querySelector('#workoutArea'), {client: sb, account: context.actor, studentId: context.studentId, valid: context.valid, back: () => coach() ? profile(context.studentId) : dashboard()});
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
    if (target.dataset.student) return profile(target.dataset.student);
    const action = target.dataset.action;
    if (action === 'logout') return logout();
    if (action === 'retry') return retry();
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
    if (!email || !password) return login('Preenche o email e a password.');
    busy = true;
    const submit = event.target.querySelector('button');
    submit.disabled = true; submit.textContent = 'A entrar…';
    const ticket = generation;
    try {
      const {error} = await sb.auth.signInWithPassword({email, password});
      if (error && ticket === generation) login('Não foi possível entrar. Verifica o email e a password e tenta novamente.');
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
