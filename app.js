(() => {
  'use strict';
  const SUPABASE_URL = 'https://ihpqwfxxjbpjizuoeqqf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ZQgAYRrde_e2HgEmjXNq6g_SXtaC1gU';
  const root = document.querySelector('#app');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brand = () => '<div class="brand">THE COACH<small>by Suru · v0.5</small></div>';
  const button = (text, action, style = 'dark') => `<button class="btn ${style}" data-action="${action}">${text}</button>`;
  const page = html => { root.innerHTML = `<main class="app">${html}</main>`; };
  const head = (title, back) => `<div class="top">${back ? `<button class="back" data-action="${back}" aria-label="Voltar">‹</button>` : ''}${brand()}</div><h2>${escape(title)}</h2>`;
  const loading = () => page(brand() + '<div class="card" role="status">A carregar a tua área…</div>');
  let sb, account = null, students = [], selected = null, generation = 0, busy = false;
  const coach = () => account && ['trainer', 'admin'].includes(account.role);
  const clear = () => { account = null; students = []; selected = null; };
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
        '<div class="card"><span class="tag">TREINO DE HOJE</span><h2 style="margin-top:12px">Plano de treino</h2><p class="muted">Ainda não há um plano disponível nesta versão.</p></div>' + modules() + button('Terminar sessão', 'logout', 'light'));
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
    page(head(name(selected), 'list') + '<span class="tag">ALUNO ASSOCIADO</span><div class="grid"><div class="card stat"><b>—</b><span class="muted">Peso</span></div><div class="card stat"><b>—</b><span class="muted">Massa gorda</span></div></div>' + modules() + button('Plano de treino', 'plan'));
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
    const title = action === 'plan' ? 'Plano de treino' : moduleItems.find(m => m[3] === action)?.[1];
    if (!title) return;
    page(head(title, 'backProfile') + `<div class="card"><b>${escape(name(selected))}</b><p class="muted" style="margin-top:12px">Este módulo ainda não está ligado a dados reais. Não existem registos disponíveis nesta versão.</p></div>`);
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
    if (action === 'dashboard') dashboard();
    else if (action === 'list') list();
    else if (action === 'backProfile') coach() ? profile(selected?.id) : dashboard();
    else modulePage(action);
  });
  root.addEventListener('submit', async event => {
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
