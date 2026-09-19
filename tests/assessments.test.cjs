const {test} = require('node:test');
const assert = require('node:assert/strict');
const A = require('../assessments.js');
const trainer = {id: 'trainer-1', role: 'trainer'};
const student = {id: 'maria', role: 'student'};
const values = overrides => ({assessment_date: '2026-09-19', weight: '64,2', body_fat: '23.5', ...overrides});
function database({rows = [], active = true, readError = null, insertError = null, lostResponse = false} = {}) {
  const calls = [];
  const relations = [{trainer_id: trainer.id, student_id: student.id, active}];
  const client = {from(table) {
    const call = {table, filters: [], orders: []}; calls.push(call);
    const builder = {
      select(columns) { call.columns = columns; return this; },
      eq(key, value) { call.filters.push([key, value]); return this; },
      order(key, options) { call.orders.push([key, options]); return this; },
      range(first, last) { call.range = [first, last]; return this; },
      maybeSingle() { call.single = true; return this; },
      insert(payload) { call.payload = payload; return this; },
      then(resolve, reject) {
        let result;
        if (call.payload) {
          if (insertError) result = {error: insertError};
          else if (rows.some(r => r.id === call.payload.id)) result = {error: {code: '23505'}};
          else {
            rows.push({...call.payload, created_at: '2026-09-19T12:00:00Z'});
            if (lostResponse) return Promise.reject(new Error('Connection lost after commit')).then(resolve, reject);
            result = {error: null};
          }
        } else {
          let data = (table === 'assessments' ? rows : relations).filter(r => call.filters.every(([key, value]) => r[key] === value));
          data = [...data].sort((a,b) => {for (const [key, options] of call.orders) {
            if (a[key] == null && b[key] != null) return 1;
            if (b[key] == null && a[key] != null) return -1;
            const order = String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
            if (order) return options.ascending ? order : -order;
          } return 0;});
          if (call.range) data = data.slice(call.range[0], call.range[1] + 1);
          result = {data: call.single ? data[0] || null : data, error: table === 'assessments' ? readError : null};
        }
        return Promise.resolve(result).then(resolve, reject);
      }
    };
    return builder;
  }};
  return {client, rows, calls, relations};
}
test('decimal comma and dot, zero, whitespace and optional fields', () => {
  const result = A.validate(values({height: ' 165.5 ', waist: ',5', muscle_mass: '0', notes: ' Observação real '}));
  assert.equal(result.weight, 64.2); assert.equal(result.height, 165.5); assert.equal(result.waist, .5);
  assert.equal(result.muscle_mass, 0); assert.equal(result.left_calf, null); assert.equal(result.notes, 'Observação real');
});
for (const [key] of A.fields) test(`rejects negative ${key}`, () => assert.throws(() => A.validate(values({[key]: '-1,2'})), error => error.field === key));
test('rejects invalid numbers, percentages and dates', () => {
  for (const value of ['NaN', 'Infinity', '1e3', '1,2.3', '2 kg', '1 234', '9'.repeat(400)]) assert.throws(() => A.validate(values({weight: value})));
  assert.throws(() => A.validate(values({body_fat: '100.1'})));
  for (const date of ['', '0000-01-01', '2026-02-30', '2026-13-01', '2026-01-00', '19/09/2026']) assert.throws(() => A.validate(values({assessment_date: date})));
  assert.equal(A.validate(values({assessment_date: '2024-02-29'})).assessment_date, '2024-02-29');
});
test('requires a measurement and preserves missing data as null', () => {
  assert.throws(() => A.validate({assessment_date: '2026-09-19', notes: 'Only notes'}));
  const result = A.validate({assessment_date: '2026-09-19', chest: '90'});
  assert.equal(result.weight, null); assert.equal(result.body_fat, null); assert.equal(result.notes, null);
});
test('save uses the selected student and only confirmed columns', async () => {
  const db = database();
  await A.save(db.client, trainer, student.id, values({student_id: 'someone-else', trainer_id: 'injected'}), {id: 'draft-1'});
  assert.equal(db.rows[0].student_id, 'maria'); assert.equal(db.rows[0].weight, 64.2);
  assert.ok(Object.keys(db.rows[0]).every(key => A.columns.split(',').includes(key)));
  assert.equal(db.calls.find(c => c.payload).payload.created_at, undefined);
});
test('saved data is loaded through a new read, newest date first', async () => {
  const db = database();
  await A.save(db.client, trainer, student.id, values({assessment_date:'2026-09-19'}), {id:'new'});
  await A.save(db.client, trainer, student.id, values({assessment_date:'2026-08-01',weight:'70'}), {id:'old'});
  const rows = await A.read(db.client, trainer, student.id);
  assert.deepEqual(rows.map(r=>r.id), ['new', 'old']);
  const latest = await A.read(db.client, trainer, student.id, true);
  assert.equal(latest.length, 1); assert.equal(latest[0].weight, 64.2);
  assert.ok(db.calls.filter(c=>c.table==='assessments'&&!c.payload).every(c=>c.filters.some(([key,value])=>key==='student_id'&&value==='maria')));
});
test('pagination does not drop assessments beyond 500 rows', async () => {
  const rows = Array.from({length: 501}, (_, i) => ({id: String(i).padStart(4,'0'), student_id:'maria',assessment_date:'2026-09-19',created_at:'2026-09-19T12:00:00Z'}));
  const db = database({rows});
  assert.equal((await A.read(db.client, trainer, student.id)).length, 501);
  assert.equal(db.calls.filter(c=>c.table==='assessments').length, 2);
});
test('inactive relationship blocks read and insert', async () => {
  const db = database({active:false});
  await assert.rejects(A.read(db.client, trainer, student.id), {code:'ASSOCIATION'});
  await assert.rejects(A.save(db.client, trainer, student.id, values(), {id:'draft'}), {code:'ASSOCIATION'});
  assert.equal(db.calls.filter(c=>c.table==='assessments').length, 0);
});
test('association is rechecked after being revoked, without trusting cached profiles', async () => {
  const db = database(); await A.read(db.client, trainer, student.id);
  db.relations[0].active = false;
  await assert.rejects(A.save(db.client, trainer, student.id, values(), {id:'draft'}), {code:'ASSOCIATION'});
  assert.equal(db.rows.length,0);
});
test('student may read own history but cannot use trainer insert flow', async () => {
  const db = database(); await A.read(db.client, student, student.id);
  await assert.rejects(A.read(db.client, student, 'another-student'), {code:'ASSOCIATION'});
  await assert.rejects(A.save(db.client, student, student.id, values(), {id:'draft'}), {code:'ASSOCIATION'});
});
test('logout during association verification prevents insert', async () => {
  const db = database();
  await assert.rejects(A.save(db.client, trainer, student.id, values(), {id:'draft'}, () => false), {code:'STALE'});
  assert.equal(db.rows.length,0);
});
test('RLS rejection is propagated without a fallback write', async () => {
  const db = database({insertError:{code:'42501',message:'new row violates row-level security policy'}});
  await assert.rejects(A.save(db.client, trainer, student.id, values(), {id:'draft'}), {code:'42501'});
  assert.equal(db.rows.length,0); assert.equal(db.calls.filter(c=>c.payload).length,1);
  assert.match(A.message({code:'42501'},'guardar a avaliação'), /políticas RLS/);
});
test('read error is not converted into empty history', async () => {
  const db = database({readError:{code:'42501'}});
  await assert.rejects(A.read(db.client, trainer, student.id), {code:'42501'});
});
test('retry after a lost successful response does not duplicate the assessment', async () => {
  const db = database({lostResponse:true});
  await assert.rejects(A.save(db.client, trainer, student.id, values(), {id:'stable-id'}));
  const result = await A.save(db.client, trainer, student.id, values(), {id:'stable-id'});
  assert.equal(result.recovered,true); assert.equal(db.rows.length,1);
});
test('deltas compare first and latest with nulls distinct from zero', () => {
  const rows = [{weight:64.2,body_fat:23.5},{weight:70,body_fat:25}];
  assert.ok(Math.abs(A.difference(rows,'weight') + 5.8)<1e-8); assert.equal(A.difference(rows,'body_fat'),-1.5);
  assert.equal(A.difference([{weight:null},{weight:70}],'weight'),null);
  assert.equal(A.difference([{weight:0},{weight:70}],'weight'),-70);
  assert.equal(A.difference([{weight:70}],'weight'),null);
  assert.equal(A.format(null,'kg'),'—'); assert.equal(A.format(0,'kg'),'0 kg'); assert.equal(A.format(64.2,'kg'),'64,2 kg');
});
