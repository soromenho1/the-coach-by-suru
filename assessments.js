/* Confirmed public.assessments columns; no schema or policy mutations. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CoachAssessments = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const fields = [
    ['weight', 'Peso', 'kg'], ['height', 'Altura', 'cm'],
    ['body_fat', 'Massa gorda', '%'], ['muscle_mass', 'Massa muscular', 'kg'],
    ['chest', 'Peito', 'cm'], ['waist', 'Cintura', 'cm'],
    ['abdomen', 'Abdómen', 'cm'], ['hips', 'Anca / quadril', 'cm'],
    ['left_arm', 'Braço esquerdo', 'cm'], ['right_arm', 'Braço direito', 'cm'],
    ['left_thigh', 'Coxa esquerda', 'cm'], ['right_thigh', 'Coxa direita', 'cm'],
    ['left_calf', 'Gémeo esquerdo', 'cm'], ['right_calf', 'Gémeo direito', 'cm']
  ];
  const columns = ['id', 'student_id', 'assessment_date', ...fields.map(f => f[0]), 'notes', 'created_at'].join(',');
  function invalid(message, field) { return Object.assign(new Error(message), {field}); }
  function validate(values) {
    const date = String(values.assessment_date || '').trim();
    const parsed = new Date(date + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000-') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw invalid('Escolhe uma data válida para a avaliação.', 'assessment_date');
    }
    const result = {assessment_date: date};
    for (const [key, label] of fields) {
      const raw = String(values[key] ?? '').trim();
      if (!raw) { result[key] = null; continue; }
      if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw)) {
        throw invalid(`${label}: usa um número sem sinal negativo, com vírgula ou ponto decimal.`, key);
      }
      const value = Number(raw.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) throw invalid(`${label}: indica um número válido, igual ou superior a zero.`, key);
      if (key === 'body_fat' && value > 100) throw invalid('A massa gorda deve estar entre 0 e 100%.', key);
      result[key] = value;
    }
    if (!fields.some(([key]) => result[key] !== null)) throw invalid('Preenche pelo menos uma medição.', 'weight');
    result.notes = String(values.notes ?? '').trim() || null;
    return result;
  }
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  function format(value, unit = '') {
    return numeric(value) ? `${Number(value).toLocaleString('pt-PT', {maximumFractionDigits: 3})}${unit ? ' ' + unit : ''}` : '—';
  }
  function difference(rows, key) {
    if (rows.length < 2 || !numeric(rows[0][key]) || !numeric(rows[rows.length - 1][key])) return null;
    return Number(rows[0][key]) - Number(rows[rows.length - 1][key]);
  }
  function message(error, operation) {
    if (error?.code === 'ASSOCIATION') return error.message;
    if (error?.code === '42501' || /row.level security|permission denied/i.test(error?.message || '')) {
      return `O Supabase não autorizou ${operation}. Confirma a associação ativa e as políticas RLS com o administrador. Nenhuma política foi alterada.`;
    }
    if (['23502', '23503', '23514', '22003', '22P02', '42703', 'PGRST204'].includes(error?.code)) {
      return `Não foi possível ${operation}: ${error.message} (código ${error.code}).`;
    }
    return `Não foi possível ${operation}. Verifica a ligação e tenta novamente.`;
  }
  async function assertAccess(client, account, studentId, writing = false) {
    if (!account || !studentId || (account.role === 'student' && (writing || account.id !== studentId)) || !['trainer', 'admin', 'student'].includes(account.role)) {
      throw Object.assign(new Error('Não tens autorização para consultar ou alterar este aluno.'), {code: 'ASSOCIATION'});
    }
    if (account.role === 'student') return;
    const {data, error} = await client.from('trainer_students').select('student_id')
      .eq('trainer_id', account.id).eq('student_id', studentId).eq('active', true).maybeSingle();
    if (error) throw error;
    if (!data || data.student_id !== studentId) throw Object.assign(new Error('A associação a este aluno já não está ativa. Atualiza a lista de alunos.'), {code: 'ASSOCIATION'});
  }
  function query(client, studentId) {
    return client.from('assessments').select(columns).eq('student_id', studentId)
      .order('assessment_date', {ascending: false, nullsFirst: false})
      .order('created_at', {ascending: false, nullsFirst: false}).order('id', {ascending: false});
  }
  async function read(client, account, studentId, latestOnly = false, current = () => true) {
    await assertAccess(client, account, studentId);
    const rows = [];
    for (let offset = 0; current(); offset += 500) {
      const {data, error} = await query(client, studentId).range(offset, latestOnly ? 0 : offset + 499);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Resposta inválida do servidor.');
      // Defence in depth; the query and RLS must also scope the returned records.
      if (data.some(row => row.student_id !== studentId)) throw new Error('Resposta fora do aluno selecionado.');
      rows.push(...data);
      if (latestOnly || data.length < 500) break;
    }
    return rows;
  }
  async function save(client, account, studentId, values, draft, current = () => true) {
    const measurements = validate(values);
    await assertAccess(client, account, studentId, true);
    if (!current()) throw Object.assign(new Error('A sessão ou o aluno mudou. Abre novamente a avaliação.'), {code: 'STALE'});
    const payload = {...measurements, id: draft.id, student_id: studentId};
    // The stable UUID makes retrying after a lost response safe, without upsert/update privileges.
    const {error} = await client.from('assessments').insert(payload);
    if (error && error.code !== '23505') throw error;
    if (error) {
      const existing = await client.from('assessments').select(columns).eq('student_id', studentId).eq('id', draft.id).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) throw error;
      return {recovered: true};
    }
    return {recovered: false};
  }
  return {fields, columns, validate, format, difference, message, assertAccess, read, save};
});
