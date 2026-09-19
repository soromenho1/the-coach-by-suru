const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const settle = async () => { for (let i=0;i<12;i++) await new Promise(r=>setTimeout(r,1)); };
function setup({role='trainer', missing=false, errorTable, delay=false, profiles, links, sdk=true}={}) {
  const queries=[], listeners={}, pending=[];
  const nodes = {};
  const root={innerHTML:'',addEventListener:(e,f)=>listeners[e]=f,querySelector:key=>nodes[key] ||= {innerHTML:''}};
  let auth;
  const own={id:'self', full_name:'Nome real', role};
  const others=profiles || [{id:'student-1',full_name:'Aluno associado',role:'student'},{id:'student-2',full_name:'Outro treinador',role:'student'}];
  const relations=links || [{trainer_id:'self',student_id:'student-1',active:true},{trainer_id:'self',student_id:'student-2',active:false},{trainer_id:'other',student_id:'student-2',active:true}];
  const sb={auth:{onAuthStateChange:f=>auth=f,signOut:async()=>{auth('SIGNED_OUT',null);return {};},getSession:async()=>({data:{session:{user:{id:'self'}}}}),signInWithPassword:async()=>{auth('SIGNED_IN',{user:{id:'self'}});return {};}} ,from(table){
    const q={table,filters:[]};queries.push(q);
    const chain={select(){return chain;},eq(k,v){q.filters.push([k,v]);return chain;},in(k,v){q.ids=v;return chain;},order(){return chain;},range(a,b){q.range=[a,b];return chain;},maybeSingle(){q.single=true;return chain;},then(resolve,reject){
      let data=table==='profiles'?[own,...others]:table==='trainer_students'?relations:[];
      data=data.filter(row=>q.filters.every(([k,v])=>row[k]===v)&&(!q.ids||q.ids.includes(row.id)));
      if(q.range)data=data.slice(q.range[0],q.range[1]+1);
      const result={data:q.single?(missing?null:data[0]):data,error:table===errorTable?{message:'denied'}:null};
      if(delay&&table==='trainer_students')return new Promise(r=>pending.push(()=>r(result))).then(resolve,reject);
      return Promise.resolve(result).then(resolve,reject);
    }};return chain;
  }};
  vm.runInNewContext(source,{document:{querySelector:()=>root},window:{supabase:sdk?{createClient:()=>sb}:undefined,CoachAssessments:require('../assessments.js'),crypto:require('node:crypto')},setTimeout});
  return {root,queries,pending,emit:(event,user='self')=>auth(event,user?{user:{id:user}}:null),click(action,student){listeners.click({target:{closest:()=>({dataset:{action,student}})}});},submit:()=>listeners.submit({preventDefault(){},target:{id:'loginForm',elements:{email:{value:'a@b.pt'},password:{value:'password'}},querySelector:()=>({})}})};
}
test('restores trainer and shows only active associations',async()=>{const a=setup();a.emit('INITIAL_SESSION');await settle();assert.match(a.root.innerHTML,/Área do treinador/);a.click('list');assert.match(a.root.innerHTML,/Aluno associado/);assert.doesNotMatch(a.root.innerHTML,/Outro treinador/);assert.ok(a.queries.some(q=>q.table==='trainer_students'&&q.filters.some(([k,v])=>k==='active'&&v===true)));});
test('student sees own profile, never queries trainer associations',async()=>{const a=setup({role:'student'});a.emit('INITIAL_SESSION');await settle();assert.match(a.root.innerHTML,/Nome real/);assert.match(a.root.innerHTML,/Área do aluno/);assert.equal(a.queries.filter(q=>q.table==='trainer_students').length,0);a.click('list');assert.match(a.root.innerHTML,/Área do aluno/);});
test('admin has a distinct area and the same association restriction',async()=>{const a=setup({role:'admin'});a.emit('INITIAL_SESSION');await settle();assert.match(a.root.innerHTML,/Área de administração/);a.click('list');assert.doesNotMatch(a.root.innerHTML,/Outro treinador/);});
test('unknown role fails closed',async()=>{const a=setup({role:'owner'});a.emit('INITIAL_SESSION');await settle();assert.match(a.root.innerHTML,/não tem uma área válida/);assert.equal(a.queries.length,1);});
test('missing profile fails closed',async()=>{const a=setup({missing:true});a.emit('INITIAL_SESSION');await settle();assert.match(a.root.innerHTML,/ainda não tem um perfil/);});
for(const table of ['profiles','trainer_students'])test(`query error in ${table} provides retry`,async()=>{const a=setup({errorTable:table});a.emit('INITIAL_SESSION');await settle();assert.match(a.root.innerHTML,/Tentar novamente/);assert.doesNotMatch(a.root.innerHTML,/Gerir alunos/);});
test('no associations renders empty state without broad profile query',async()=>{const a=setup({links:[]});a.emit('INITIAL_SESSION');await settle();a.click('list');assert.match(a.root.innerHTML,/Ainda não tens alunos associados/);assert.equal(a.queries.filter(q=>q.table==='profiles').length,1);});
test('logout invalidates a pending data response',async()=>{const a=setup({delay:true});a.emit('INITIAL_SESSION');await settle();a.emit('SIGNED_OUT',null);a.pending.forEach(f=>f());await settle();assert.match(a.root.innerHTML,/Login/);assert.doesNotMatch(a.root.innerHTML,/Gerir alunos/);});
test('switching user invalidates the old request',async()=>{const a=setup({delay:true});a.emit('SIGNED_IN');await settle();a.emit('SIGNED_IN','student-1');await settle();a.pending.forEach(f=>f());await settle();assert.match(a.root.innerHTML,/Área do aluno/);assert.doesNotMatch(a.root.innerHTML,/Gerir alunos/);});
test('profile names and ids are escaped',async()=>{const a=setup({profiles:[{id:'student-1',full_name:'<img src=x onerror=alert(1)>',role:'student'}]});a.emit('INITIAL_SESSION');await settle();a.click('list');assert.match(a.root.innerHTML,/&lt;img/);assert.doesNotMatch(a.root.innerHTML,/<img/);});
test('unassociated UUID cannot open a student profile',async()=>{const a=setup();a.emit('INITIAL_SESSION');await settle();a.click(null,'student-2');assert.match(a.root.innerHTML,/<h2>Alunos/);assert.doesNotMatch(a.root.innerHTML,/Outro treinador/);});
test('UUID navigation supports profile, module and back',async()=>{const a=setup();a.emit('INITIAL_SESSION');await settle();a.click(null,'student-1');a.click('anam');assert.match(a.root.innerHTML,/<h2>Anamnese/);a.click('backProfile');assert.match(a.root.innerHTML,/<h2>Aluno associado/);});
test('login and logout use auth events',async()=>{const a=setup();a.emit('INITIAL_SESSION',null);await a.submit();await settle();assert.match(a.root.innerHTML,/Área do treinador/);a.click('logout');await settle();assert.match(a.root.innerHTML,/Login/);a.click('list');assert.match(a.root.innerHTML,/Login/);});
test('missing SDK has a useful error',()=>{const a=setup({sdk:false});assert.match(a.root.innerHTML,/Não foi possível carregar a ligação/);});
test('uses only publishable key and no legacy localStorage data',()=>{assert.match(source,/sb_publishable_/);assert.doesNotMatch(source,/sb_secret_|service_role|localStorage|Marta Silva/);});
