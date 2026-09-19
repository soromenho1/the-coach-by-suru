// Browser integration against the real Supabase JS SDK and a simulated REST/Auth server.
// No test credentials or measurements are sent to the real Supabase project.
const {chromium} = require(process.env.COACH_PLAYWRIGHT || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const project = path.join(__dirname, '..');
const trainerId = '00000000-0000-4000-8000-000000000001';
const mariaId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const user = {id:trainerId, aud:'authenticated',role:'authenticated',email:'trainer@example.test'};
const token = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:trainerId,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test-signature'].join('.');
const appServer = http.createServer((req,res) => {
  const file = {'/':'index.html','/app.js':'app.js','/assessments.js':'assessments.js'}[req.url];
  if(!file) {res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html');
  res.end(fs.readFileSync(path.join(project,file)));
});
const waitText = async (page, selector, text) => page.locator(selector).filter({hasText:text}).first().waitFor();
(async()=>{
 await new Promise(resolve=>appServer.listen(0,'127.0.0.1',resolve));
 const url = `http://127.0.0.1:${appServer.address().port}`;
 const browser = await chromium.launch({headless:true});
 try {
  for (const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
   const context = await browser.newContext({viewport});
   const page = await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const rows=[]; let active=true, denyInsert=false, posts=0, failRead=false;
   await context.route('https://ihpqwfxxjbpjizuoeqqf.supabase.co/**',async route=>{
    const request=route.request(), u=new URL(request.url());
    const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(u.pathname==='/auth/v1/token')return respond({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
    if(u.pathname==='/auth/v1/user')return respond(user);
    if(u.pathname==='/auth/v1/logout')return respond({});
    const table=u.pathname.split('/').pop();
    if(!['profiles','trainer_students','assessments'].includes(table))throw Error('Unexpected mocked request: '+u.pathname);
    assert.equal(request.headers().apikey.startsWith('sb_publishable_'),true);
    assert.equal(request.headers().authorization,'Bearer '+token);
    if(request.method()==='POST'){
     assert.equal(table,'assessments');posts++;
     if(denyInsert||!active)return respond({code:'42501',message:'new row violates row-level security policy'},403);
     const payload=request.postDataJSON();assert.equal(payload.student_id,mariaId);
     if(rows.some(r=>r.id===payload.id))return respond({code:'23505',message:'duplicate key'},409);
     rows.push({...payload,created_at:new Date().toISOString()});return respond(null,201);
    }
    if(table==='assessments'&&failRead)return respond({code:'42501',message:'permission denied'},403);
    let data=table==='profiles'?[{id:trainerId,full_name:'Treinador Teste',role:'trainer'},{id:mariaId,full_name:'Maria',role:'student'},{id:otherId,full_name:'Outro aluno',role:'student'}]:table==='trainer_students'?[{trainer_id:trainerId,student_id:mariaId,active}]:rows;
    for(const [key,filter] of u.searchParams){
     if(filter.startsWith('eq.'))data=data.filter(row=>String(row[key])===filter.slice(3));
     else if(filter.startsWith('in.('))data=data.filter(row=>filter.slice(4,-1).split(',').includes(row[key]));
    }
    if(table==='assessments'){
     assert.equal(u.searchParams.get('student_id'),'eq.'+mariaId);
     data=[...data].sort((a,b)=>String(b.assessment_date).localeCompare(String(a.assessment_date))||String(b.created_at).localeCompare(String(a.created_at))||b.id.localeCompare(a.id));
    }
    if(u.searchParams.has('limit'))data=data.slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')));
    return respond(request.headers().accept?.includes('vnd.pgrst.object')?(data[0]||null):data);
   });
   await page.goto(url);
   await page.getByRole('heading',{name:'Login',exact:true}).waitFor();
   await page.getByLabel('Email').fill('trainer@example.test');await page.getByLabel('Password').fill('test-password');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   const openMaria=async()=>{await page.getByRole('button',{name:'Gerir alunos'}).click();assert.equal(await page.getByText('Outro aluno',{exact:true}).count(),0);await page.getByRole('button',{name:/Maria/}).click();};
   await openMaria();
   await waitText(page,'#assessmentStats','Ainda não existem avaliações');
   await page.getByRole('button',{name:/Avaliação física/}).click();
   await waitText(page,'#assessmentHistory','Ainda não existem avaliações');
   assert.equal(await page.locator('#assessmentForm input').count(),15);
   await page.getByLabel('Data',{exact:true}).fill('2026-09-19');
   await page.getByLabel('Peso (kg)',{exact:true}).fill('-1');
   await page.getByRole('button',{name:'Guardar avaliação'}).click();
   await waitText(page,'#assessmentMessage','sem sinal negativo');assert.equal(posts,0);
   for(const [key,value] of Object.entries({weight:'64,2',height:'165.5',body_fat:'23,5',muscle_mass:'45',chest:'90',waist:'70',abdomen:'75',hips:'95',left_arm:'27',right_arm:'28',left_thigh:'50',right_thigh:'51',left_calf:'34',right_calf:'35'}))await page.locator(`[name="${key}"]`).fill(value);
   await page.getByLabel('Observações').fill('<img src=x onerror="window.bad=true"> Medição de teste');
   await page.screenshot({path:`/tmp/coach-v06-form-${viewport.width}.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   // A rejected insert must preserve the entered values and must not show success.
   denyInsert=true;await page.getByRole('button',{name:'Guardar avaliação'}).click();
   await waitText(page,'#assessmentMessage','políticas RLS');assert.equal(rows.length,0);assert.equal(await page.getByLabel('Peso (kg)',{exact:true}).inputValue(),'64,2');
   denyInsert=false;await page.getByRole('button',{name:'Guardar avaliação'}).click();
   await page.getByText('Avaliação guardada com sucesso.',{exact:true}).waitFor();
   await waitText(page,'#assessmentHistory','64,2 kg');assert.equal(rows.length,1);assert.equal(rows[0].student_id,mariaId);
   await page.locator('#assessmentHistory summary').click();assert.equal(await page.locator('#assessmentHistory img').count(),0);
   await page.getByRole('button',{name:'Voltar',exact:true}).click();await waitText(page,'#assessmentStats','64,2 kg');await waitText(page,'#assessmentStats','23,5 %');
   // Insert a backdated assessment; it must not replace the newest profile values.
   await page.getByRole('button',{name:/Avaliação física/}).click();
   await page.getByLabel('Data',{exact:true}).fill('2026-08-01');await page.getByLabel('Peso (kg)',{exact:true}).fill('70');await page.getByLabel('Massa gorda (%)',{exact:true}).fill('25');
   await page.getByRole('button',{name:'Guardar avaliação'}).click();await waitText(page,'#assessmentHistory','70 kg');
   assert.equal((await page.locator('#assessmentHistory summary').allTextContents())[0].includes('19/09/2026'),true);
   await page.reload();await openMaria();await waitText(page,'#assessmentStats','64,2 kg');
   await page.getByRole('button',{name:/Evolução/}).click();await waitText(page,'#assessmentHistory','-5,8 kg');await waitText(page,'#assessmentHistory','-1,5 p.p.');
   await page.screenshot({path:`/tmp/coach-v06-evolution-${viewport.width}.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByRole('button',{name:'Voltar',exact:true}).click();await page.getByRole('button',{name:/Avaliação física/}).click();
   await page.getByLabel('Peso (kg)',{exact:true}).fill('63');active=false;const oldPosts=posts;
   await page.getByRole('button',{name:'Guardar avaliação'}).click();await waitText(page,'#assessmentMessage','já não está ativa');assert.equal(posts,oldPosts);
   active=true;failRead=true;
   await page.getByRole('button',{name:'Voltar',exact:true}).click();await page.getByRole('button',{name:/Evolução/}).click();await waitText(page,'#assessmentHistory','políticas RLS');
   assert.equal(await page.getByText('Ainda não existem avaliações para este aluno.',{exact:true}).count(),0);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${viewport.width}px: trainer → Maria → all fields → RLS error → save → profile → backdated history → reload → evolution → revoked association; no JS errors or overflow. Persistence uses mocked server memory.`);
   await context.close();
  }
 } finally {await browser.close();appServer.close();}
})().catch(error=>{console.error(error);appServer.close();process.exitCode=1;});
