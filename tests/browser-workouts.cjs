// Real Supabase SDK; all project REST/Auth requests are intercepted with an isolated test database.
const {chromium}=require(process.env.COACH_PLAYWRIGHT||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture,trainer,maria}=require('./workout-fixture.cjs');
const root=path.join(__dirname,'..');
const server=http.createServer((req,res)=>{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','app.js','assessments.js','workouts.js','workout-ui.js'].includes(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(path.join(root,name)));});
const text=async(page,selector,value)=>page.locator(selector).filter({hasText:value}).first().waitFor();
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 try{for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  const f=fixture(),context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('https://ihpqwfxxjbpjizuoeqqf.supabase.co/**',async route=>{
   const req=route.request(),u=new URL(req.url());const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(u.pathname==='/auth/v1/token'){
    f.actor=req.postDataJSON().email.startsWith('maria')?maria:trainer;
    const token=[Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),Buffer.from(JSON.stringify({sub:f.actor.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test'].join('.');
    return respond({access_token:token,refresh_token:'test',token_type:'bearer',expires_in:3600,user:{...f.actor,aud:'authenticated',email:req.postDataJSON().email}});
   }
   if(u.pathname==='/auth/v1/logout')return respond({});if(u.pathname==='/auth/v1/user')return respond({...f.actor,aud:'authenticated'});
   const table=u.pathname.split('/').pop();assert.ok(f.tables[table],table);assert.ok(req.headers().apikey.startsWith('sb_publishable_'));
   const q={table,filters:[],orders:[],single:req.headers().accept?.includes('vnd.pgrst.object')};
   for(const [key,v]of u.searchParams){if(v.startsWith('eq.'))q.filters.push([key,'eq',v.slice(3)==='true'?true:v.slice(3)==='false'?false:v.slice(3)]);if(v.startsWith('is.'))q.filters.push([key,'is',null]);if(v.startsWith('in.('))q.filters.push([key,'in',v.slice(4,-1).split(',')]);}
   for(const order of (u.searchParams.get('order')||'').split(',').filter(Boolean)){const [k,dir,nulls]=order.split('.');q.orders.push([k,{ascending:dir!=='desc',nullsFirst:nulls==='nullsfirst'}]);}
   if(u.searchParams.has('limit')){const a=Number(u.searchParams.get('offset')||0);q.range=[a,a+Number(u.searchParams.get('limit'))-1];}
   if(req.method()==='POST')q.insert=req.postDataJSON();if(req.method()==='PATCH')q.update=req.postDataJSON();
   try{const result=f.execute(q);return result.error?respond(result.error,result.error.code==='42501'?403:409):respond(result.data,req.method()==='POST'?201:200);}catch{return respond({message:'simulated network failure'},503);}
  });
  const login=async email=>{await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Entrar',exact:true}).click();};
  const fill=async(kind,values)=>{const form=page.locator(`form[data-kind="${kind}"]`).first();for(const [k,v]of Object.entries(values))await form.locator(`[name="${k}"]`).fill(v);return form;};
  await page.goto(url);await login('trainer@example.test');await page.getByRole('button',{name:'Gerir alunos'}).click();await page.getByRole('button',{name:/Maria/}).click();await page.getByRole('button',{name:'Plano de treino',exact:true}).click();
  let form=await fill('plan',{name:'Plano Maria',objective:'Força',start_date:'2020-01-01',end_date:'2030-01-01'});await form.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('button',{name:'Abrir plano',exact:true}).click();
  form=await fill('workout',{name:'Treino A',position:'1'});await form.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('button',{name:'Abrir treino',exact:true}).click();
  form=await fill('exercise',{name:'Agachamento',sets:'2',reps:'8–12',position:'1',target_weight:'40,5',target_rir:'2',rest_seconds:'90',notes:'Controlar a descida'});await form.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('heading',{name:'Agachamento',exact:true}).waitFor();
  assert.equal(f.tables.workout_plans.length,1);assert.equal(f.tables.workouts.length,1);assert.equal(f.tables.exercises.length,1);
  await page.screenshot({path:`/tmp/coach-v07-trainer-${viewport.width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // Association revoked while trainer still has the workout open.
  f.tables.trainer_students[0].active=false;form=await fill('exercise',{name:'Bloqueado',sets:'1',position:'2'});await form.getByRole('button',{name:'Guardar',exact:true}).click();await text(page,'.w-message','já não está ativa');assert.equal(f.tables.exercises.length,1);f.tables.trainer_students[0].active=true;
  await page.reload();await page.getByRole('button',{name:'Terminar sessão',exact:true}).click();await login('maria@example.test');
  const openWorkout=async()=>{await page.getByRole('button',{name:'Abrir planos e treinos',exact:true}).click();assert.equal(await page.locator('[data-kind="plan"]').count(),0);await page.getByRole('button',{name:'Abrir plano',exact:true}).click();await page.getByRole('button',{name:'Abrir treino',exact:true}).click();};
  await openWorkout();await page.getByRole('button',{name:'Iniciar treino / Retomar',exact:true}).click();await page.locator('[data-kind="set"]').first().waitFor();
  // Completion is denied until every prescribed set is saved.
  await page.locator('[data-kind="finish"]').getByRole('button',{name:'Concluir treino'}).click();await text(page,'.w-message','Guarda todas as séries');
  form=await fill('set',{weight:'-2',reps:'10',rir:'2'});await form.getByRole('button',{name:'Guardar série'}).click();await text(page,'.w-message','sem valores negativos');assert.equal(f.tables.set_logs.length,0);
  form=await fill('set',{weight:'40',reps:'10',rir:'2',notes:'Série de teste'});f.deny='set_logs';await form.getByRole('button',{name:'Guardar série'}).click();await text(page,'.w-message','políticas RLS');assert.equal(await form.locator('[name="weight"]').inputValue(),'40');f.deny=null;
  await form.getByRole('button',{name:'Guardar série'}).click();await text(page,'[data-saved]','Série 1 guardada');
  await page.reload();await openWorkout();await page.getByRole('button',{name:'Iniciar treino / Retomar',exact:true}).click();await text(page,'[data-saved]','Série 1 guardada');assert.equal(f.tables.workout_sessions.length,1);
  form=await fill('set',{weight:'40',reps:'10',rir:'2'});await form.getByRole('button',{name:'Guardar série'}).click();await text(page,'[data-saved]','Série 2 guardada');
  form=await fill('finish',{notes:'Treino completo'});await form.getByRole('button',{name:'Concluir treino'}).click();await page.getByText('Treino concluído e guardado com sucesso.',{exact:true}).waitFor();assert.ok(f.tables.workout_sessions[0].finished_at);
  await page.reload();await openWorkout();await text(page,'.muted','Último registo: 40 kg');await page.getByRole('button',{name:'Iniciar treino / Retomar',exact:true}).click();
  for(let n=1;n<=2;n++){form=await fill('set',{weight:'42,5',reps:'8',rir:'1,5'});await form.getByRole('button',{name:'Guardar série'}).click();await text(page,'[data-saved]',`Série ${n} guardada`);}
  await text(page,'[data-saved]','PR 🏆');await page.locator('[data-kind="finish"]').getByRole('button',{name:'Concluir treino'}).click();await page.getByText('Treino concluído e guardado com sucesso.',{exact:true}).waitFor();
  await page.screenshot({path:`/tmp/coach-v07-session-${viewport.width}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.reload();await page.getByRole('button',{name:'Abrir planos e treinos',exact:true}).click();await page.getByRole('button',{name:'Histórico de sessões',exact:true}).click();await page.getByRole('button',{name:'Consultar sessão',exact:true}).first().waitFor();assert.equal(await page.getByRole('button',{name:'Consultar sessão',exact:true}).count(),2);assert.equal(f.tables.set_logs.length,4);assert.deepEqual(errors,[]);
  console.log(`PASS ${viewport.width}px: trainer → Maria → plan/workout/exercise; inactive association; student → start → RLS/negative checks → save → reload/resume → finish → previous loads → PR → persisted history. Mock server; no production data written.`);
  await context.close();
 }}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
