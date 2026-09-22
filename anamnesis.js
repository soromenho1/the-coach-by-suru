/* Student-owned anamnesis. No DDL, privileged keys or changes to existing services. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./assessments.js'));
  else root.CoachAnamnesis=factory(root.CoachAssessments);
})(typeof window==='object'?window:globalThis,function(A){
  'use strict';
  const options=values=>values.map(v=>Array.isArray(v)?{value:v[0],label:v[1]}:{value:v,label:v});
  const f=(key,label,type='text',extra={})=>({key,label,type,...extra});
  const choice=(key,label,values,extra={})=>f(key,label,'select',{options:options(values),required:true,...extra});
  const yn=(key,label,extra={})=>f(key,label,'boolean',{required:true,...extra});
  const num=(key,label,min,max,extra={})=>f(key,label,'number',{min,max,required:true,...extra});
  const multi=(key,label,values,extra={})=>f(key,label,'multi',{options:options(values),...extra});
  const details=(key,label,parent)=>f(key,label,'textarea',{when:[parent,true],required:true});
  const goals=['Perder gordura','Ganhar massa muscular','Aumentar força','Melhorar condição física','Melhorar saúde/bem-estar','Performance desportiva','Mobilidade','Recomposição corporal','Outro'];
  const zones=['Pescoço','Ombro','Cotovelo','Punho/Mão','Coluna torácica','Lombar','Anca','Joelho','Tornozelo/Pé','Outro'];
  const days=['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
  const symptoms=['Dor/desconforto no peito','Tonturas','Desmaio/perda de consciência','Falta de ar desproporcionada ao esforço','Palpitações anormais','Nenhuma das anteriores'];
  const healthConditions=[['cardiovascular','Algum médico já lhe disse que tem um problema cardíaco ou cardiovascular?'],['hypertension','Tem hipertensão?'],['diabetes','Tem diabetes ou alteração relevante da glicemia?'],['respiratory','Tem problema respiratório diagnosticado?'],['otherCondition','Tem outra doença/condição médica relevante para a prática de exercício?'],['medication','Toma medicação regularmente?'],['medicalRestriction','Algum médico recomendou limitar ou evitar exercício?']];
  const sections=[
    {key:'personal',title:'Dados pessoais',fields:[f('birthDate','Data de nascimento','date',{required:true,past:true}),choice('sex','Sexo',['Feminino','Masculino','Outro','Prefiro não responder']),f('occupation','Profissão'),num('height','Altura (cm)',1,300),num('weight','Peso atual (kg)',1,700)]},
    {key:'goals',title:'Objetivos',fields:[choice('primary','Objetivo principal',goals),f('other','Qual é o outro objetivo?','text',{when:['primary','Outro'],required:true}),multi('secondary','Objetivos secundários',goals),yn('goalWeight','Tem peso objetivo?'),num('targetWeight','Peso objetivo (kg)',1,700,{when:['goalWeight',true]}),yn('hasDeadline','Tem prazo para atingir o objetivo?'),f('deadline','Data/prazo','date',{when:['hasDeadline',true],required:true}),num('importance','Importância deste objetivo (1–10)',1,10,{integer:true}),f('reason','Qual é a principal razão para querer atingir este objetivo?','textarea')]},
    {key:'training',title:'Histórico de treino',fields:[yn('current','Treina atualmente?'),f('duration','Há quanto tempo?','text',{when:['current',true],required:true}),num('frequency','Quantas vezes por semana?',1,14,{when:['current',true],integer:true}),num('sessionMinutes','Duração média (minutos)',1,600,{when:['current',true],integer:true}),f('type','Tipo de treino atual?','text',{when:['current',true],required:true}),yn('previous','Já treinou anteriormente?',{when:['current',false]}),f('stoppedWhen','Há quanto tempo deixou?','text',{whenAll:[['current',false],['previous',true]],required:true}),f('stoppedWhy','Porque deixou?','textarea',{whenAll:[['current',false],['previous',true]]}),choice('level','Nível',['Iniciante','Intermédio','Avançado']),yn('hadTrainer','Já teve Personal Trainer?'),yn('sport','Pratica algum desporto?'),f('sportName','Qual desporto?','text',{when:['sport',true],required:true}),num('sportFrequency','Frequência semanal do desporto',1,14,{when:['sport',true],integer:true}),choice('sportPurpose','Competição ou lazer?',['Competição','Lazer','Ambos'],{when:['sport',true]}),multi('sportDays','Dias habituais do desporto',days,{when:['sport',true],required:true})]},
    {key:'health',title:'Saúde / triagem',fields:[...healthConditions.flatMap(([key,label])=>[yn(key,label),details(key+'Details','Detalhes — '+label,key)]),multi('symptoms','Durante exercício ou esforço físico já sentiu alguma das seguintes situações?',symptoms,{required:true,exclusive:'Nenhuma das anteriores'})]},
    {key:'limitations',title:'Dores, lesões e limitações',fields:[yn('currentPain','Tem atualmente alguma dor?'),f('pains','Dores atuais','list',{when:['currentPain',true],required:true,itemLabel:'Dor',fields:[choice('zone','Zona',zones),f('otherZone','Qual zona?','text',{when:['zone','Outro'],required:true}),choice('side','Lado',['Direito','Esquerdo','Ambos','Centro']),num('intensity','Intensidade (0–10)',0,10,{integer:true}),f('duration','Há quanto tempo?','text',{required:true}),f('aggravating','Que movimentos/atividades agravam?','textarea'),yn('assessed','Foi avaliado por médico/fisioterapeuta?'),yn('diagnosis','Existe diagnóstico?'),details('diagnosisDetails','Qual diagnóstico declarado?','diagnosis'),yn('avoid','Foi recomendado evitar algum exercício/movimento?'),details('avoidDetails','Qual exercício/movimento?','avoid')]}),yn('previousInjury','Teve alguma lesão importante anteriormente?'),f('injuries','Lesões anteriores','list',{when:['previousInjury',true],required:true,itemLabel:'Lesão',fields:[choice('zone','Zona',zones),f('otherZone','Qual zona?','text',{when:['zone','Outro'],required:true}),f('type','Tipo de lesão','text',{required:true}),num('year','Ano',1900,2100,{integer:true,pastYear:true}),f('treatment','Tratamento','textarea'),yn('recovered','Recuperação completa?'),f('limitations','Limitações atuais','textarea')]}),yn('surgery','Já foi submetido a cirurgia?'),f('surgeries','Cirurgias','list',{when:['surgery',true],required:true,itemLabel:'Cirurgia',fields:[f('name','Qual cirurgia?','text',{required:true}),f('when','Quando?','text',{required:true}),yn('limited','Existem limitações atuais?'),details('limitations','Quais limitações?','limited')]})]},
    {key:'activity',title:'Atividade diária',fields:[choice('level','Nível geral de atividade',['Muito sedentária','Sedentária','Moderadamente ativa','Ativa','Muito ativa']),choice('work','Trabalho predominantemente',['Sentado','Em pé','Fisicamente ativo','Misto']),num('sittingHours','Horas sentado/dia',0,24),yn('knowsSteps','Conhece média de passos?'),num('steps','Passos médios/dia',0,100000,{when:['knowsSteps',true],integer:true})]},
    {key:'recovery',title:'Sono e recuperação',fields:[num('sleepHours','Horas de sono/noite',0,24),num('sleepQuality','Qualidade do sono (1–10)',1,10,{integer:true}),num('stress','Stress atual (1–10)',1,10,{integer:true}),choice('refreshed','Sente-se recuperado quando acorda?',['Nunca','Raramente','Às vezes','Frequentemente','Sempre'])]},
    {key:'nutrition',title:'Alimentação e hábitos',fields:[num('quality','Qualidade percebida da alimentação (1–10)',1,10,{integer:true}),num('meals','Refeições/dia',1,20,{integer:true}),yn('plan','Segue plano alimentar?'),yn('nutritionist','É acompanhado por nutricionista?'),yn('allergies','Tem alergias/intolerâncias alimentares?'),details('allergyDetails','Quais alergias/intolerâncias?','allergies'),num('water','Água aproximada/dia (litros)',0,20),choice('alcohol','Álcool',['Nunca','Ocasionalmente','1–2 vezes/semana','3+ vezes/semana']),choice('tobacco','Tabaco',['Não','Ocasionalmente','Diariamente']),yn('supplements','Toma suplementos?'),f('supplementList','Suplementos','list',{when:['supplements',true],required:true,itemLabel:'Suplemento',fields:[f('name','Nome','text',{required:true}),f('dose','Dose/frequência (opcional)')]})]},
    {key:'availability',title:'Disponibilidade',fields:[num('frequency','Quantas vezes por semana consegue REALISTICAMENTE treinar?',1,7,{integer:true}),multi('days','Dias disponíveis',days,{required:true}),choice('duration','Duração disponível',['30 min','45 min','60 min','75 min','90 min','90+ min']),choice('time','Horário',['Manhã','Almoço','Tarde','Noite','Variável']),multi('locations','Local',['Ginásio','Casa','Exterior','Vários'],{required:true}),f('equipment','Que equipamento tem disponível em casa?','textarea',{whenIncludes:['locations','Casa'],required:true}),yn('unavailable','Existem dias em que não pode treinar?'),details('unavailableDetails','Quais dias / detalhes?','unavailable'),yn('irregular','Viaja frequentemente ou tem horários profissionais irregulares?'),details('irregularDetails','Detalhes dos horários / viagens','irregular')]},
    {key:'preferences',title:'Preferências',fields:[multi('types','Tipos de treino de que gosta',['Musculação','Máquinas','Pesos livres','Funcional','Cardio','Corrida','HIIT','Aulas','Mobilidade','Outro']),f('otherType','Que outro tipo de treino?','text',{whenIncludes:['types','Outro'],required:true}),f('likes','Exercícios de que gosta particularmente','textarea'),f('dislikes','Exercícios de que não gosta','textarea'),f('refuses','Exercícios que NÃO quer realizar','textarea')]},
    {key:'motivation',title:'Motivação e aderência',fields:[choice('difficulty','Qual considera ser a principal dificuldade para atingir o seu objetivo?',['Falta de tempo','Motivação','Alimentação','Trabalho','Família','Stress','Sono','Dor/lesões','Viagens','Falta de consistência','Não saber o que fazer','Outro']),f('otherDifficulty','Qual outra dificuldade?','text',{when:['difficulty','Outro'],required:true}),num('attempts','Quantas vezes tentou anteriormente atingir este objetivo?',0,1000,{integer:true}),f('consistency','O que normalmente o faz perder consistência?','textarea'),num('confidence','Confiança em conseguir seguir o plano (1–10)',1,10,{integer:true})]},
    {key:'relationship',title:'Relação com o treinador',fields:[f('expectations','O que espera do seu treinador?','textarea'),choice('style','Estilo preferido',['Muito exigente','Exigente mas equilibrado','Mais motivacional','Mais flexível']),choice('response','Quando não cumpre o plano, prefere que o treinador:',['Confronte diretamente','Tente perceber a razão e ajuste','Motive a recomeçar','Depende da situação']),f('additional','Existe alguma informação importante que gostaria que o treinador soubesse?','textarea')]}
  ];
  const columns={anamneses:'id,student_id,status,answers,completed_at,created_at,updated_at',anamnesis_trainer_notes:'id,student_id,trainer_id,notes,created_at,updated_at'};
  const fail=(message,extra={})=>Object.assign(new Error(message),{code:'ANAMNESIS',...extra});
  const clone=v=>JSON.parse(JSON.stringify(v));
  function visible(field,data){return (!field.when||data[field.when[0]]===field.when[1])&&(!field.whenAll||field.whenAll.every(([k,v])=>data[k]===v))&&(!field.whenIncludes||Array.isArray(data[field.whenIncludes[0]])&&data[field.whenIncludes[0]].includes(field.whenIncludes[1]));}
  const empty=()=>({_meta:{version:1,currentStep:0},...Object.fromEntries(sections.map(s=>[s.key,{}]))});
  function compatible(answers){return !answers||Object.keys(answers).length===0||answers._meta?.version===1;}
  function sanitizeFields(fields,raw){
    const input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};const out={};
    // Conditions depend only on earlier fields in this explicit schema.
    for(const field of fields){
      if(!visible(field,out))continue;const value=input[field.key];
      if(value===undefined||value===null||value==='')continue;
      if(field.type==='boolean'){if(value===true||value===false)out[field.key]=value;}
      else if(field.type==='list')out[field.key]=Array.isArray(value)?value.map(item=>sanitizeFields(field.fields,item)):[];
      else if(field.type==='multi'){const known=new Set(field.options.map(o=>o.value));out[field.key]=Array.isArray(value)?[...new Set(value.filter(v=>known.has(v)))]:[];if(field.exclusive&&out[field.key].length>1)out[field.key]=out[field.key].filter(v=>v!==field.exclusive);}
      else if(field.type==='select'){if(field.options.some(o=>o.value===value))out[field.key]=value;}
      else out[field.key]=typeof value==='string'?value.trim():value;
    }
    return out;
  }
  function sanitize(raw){
    if(!compatible(raw))throw fail('Esta anamnese tem um formato diferente. Pede ao responsável para rever a compatibilidade; os dados existentes não foram alterados.');
    const out=empty();for(const section of sections)out[section.key]=sanitizeFields(section.fields,raw?.[section.key]);
    return out;
  }
  const numericUnits={
    height:['cm','centimetros','centímetros'], weight:['kg','quilo','quilos'], targetWeight:['kg','quilo','quilos'],
    frequency:['x','vez','vezes','semana','semanas'], sportFrequency:['x','vez','vezes','semana','semanas'],
    sittingHours:['h','hora','horas','dia','dia'], sleepHours:['h','hora','horas','noite'],
    sessionMinutes:['min','minuto','minutos'], intensity:['/10'], sleepQuality:['/10'], stress:['/10'],
    quality:['/10'], confidence:['/10'], water:['l','litro','litros'], meals:['x','vez','vezes','refeicao','refeições','refeicoes'],
    steps:['passo','passos','dia'], attempts:['vez','vezes']
  };
  function parseNumber(field,value){
    const text=String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
    const number='([0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)';
    const suffix=(numericUnits[field.key]||[]).map(v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
    const pattern=new RegExp('^\\s*'+number+'\\s*(?:'+(suffix?'(?:'+suffix+')(?:\\s*(?:/|por)\\s*(?:dia|semana|noite))?':'')+')?\\s*$','i');
    if(!pattern.test(text))return null;
    const match=text.match(new RegExp(number));
    return match?Number(match[1].replace(',','.')):null;
  }
  function validate(raw,complete=false,today=new Date().toISOString().slice(0,10)){
    const out=sanitize(raw);
    function fields(schema,data,step,path){for(const field of schema){
      if(!visible(field,data))continue;const value=data[field.key];const fieldPath=path+'.'+field.key;
      const missing=value===undefined||value===null||value===''||Array.isArray(value)&&!value.length;
      if(missing){if(complete&&field.required)throw fail('Preenche: '+field.label,{step,field:fieldPath});continue;}
      if(field.type==='list'){if(value.length>20)throw fail(field.label+': máximo de 20 itens.',{step,field:fieldPath});for(const [i,item]of value.entries())fields(field.fields,item,step,fieldPath+'.'+i);}
      else if(field.type==='number'){
        const text=String(value),n=parseNumber(field,value);
        if(n===null||!Number.isFinite(n)||n<field.min||n>field.max||field.integer&&!Number.isInteger(n)||field.pastYear&&n>Number(today.slice(0,4)))throw fail(field.label+': indica um número válido'+(field.min!==undefined?' entre '+field.min+' e '+(field.pastYear?today.slice(0,4):field.max):'')+'. Ex.: '+(field.key==='frequency'?'4x':field.key==='water'?'2,5 L':'5')+'.',{step,field:fieldPath});
        data[field.key]=n;
      }else if(field.type==='date'){
        const d=new Date(value+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-')||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value||field.past&&value>today)throw fail(field.label+': indica uma data válida.',{step,field:fieldPath});
      }else if(['text','textarea'].includes(field.type)&&(typeof value!=='string'||value.length>4000))throw fail(field.label+': usa texto com até 4000 caracteres.',{step,field:fieldPath});
    }}
    sections.forEach((s,i)=>fields(s.fields,out[s.key],i,s.key));
    if(complete&&out.availability.days.length<out.availability.frequency)throw fail('Os dias disponíveis devem permitir a frequência semanal indicada.',{step:8,field:'availability.days'});
    if(JSON.stringify(out).length>150000)throw fail('As respostas excedem o tamanho permitido. Reduz os textos antes de guardar.');
    return out;
  }
  function alerts(raw,status){
    const a=sanitize(raw),items=[],add=(level,title,detail)=>items.push({level,title,detail});
    if(status!=='completed')add('yellow','Informação por concluir','A anamnese ainda está em preenchimento; ausência de resposta não significa ausência de limitações.');
    const h=a.health;
    for(const [key]of healthConditions)if(h[key]===true)add(key==='medicalRestriction'?'red':'yellow',key==='medicalRestriction'?'Restrição médica declarada':key==='cardiovascular'?'Condição cardiovascular declarada':'Resposta de saúde a rever',healthConditions.find(([k])=>k===key)[1]+' — O aluno respondeu Sim.'+(h[key+'Details']?' '+h[key+'Details']:''));
    for(const symptom of h.symptoms||[])if(symptom!=='Nenhuma das anteriores')add('red','Sintoma durante esforço','O aluno declarou: '+symptom+'.');
    for(const p of a.limitations.pains||[])add('yellow','Dor atual',`${p.zone||'Zona por indicar'} · ${p.side||'lado por indicar'} · intensidade declarada ${p.intensity??'—'}/10${p.aggravating?' · Agrava: '+p.aggravating:''}${p.avoid===true?' · Restrição declarada: '+(p.avoidDetails||'a esclarecer'):''}`);
    if(a.limitations.currentPain===true&&!a.limitations.pains?.length)add('yellow','Dor atual declarada','O aluno respondeu Sim; faltam detalhes da dor.');
    for(const i of a.limitations.injuries||[])if(i.recovered===false||i.limitations)add('yellow','Lesão anterior a rever',`${i.zone||'Zona por indicar'} · ${i.type||'tipo por indicar'}${i.limitations?' · '+i.limitations:''}`);
    for(const s of a.limitations.surgeries||[])if(s.limited===true)add('yellow','Limitação após cirurgia declarada',`${s.name||'Cirurgia por indicar'} · ${s.limitations||'limitações por esclarecer'}`);
    if(a.recovery.sleepQuality!=null&&Number(a.recovery.sleepQuality)<=3)add('yellow','Recuperação a acompanhar','Qualidade do sono declarada: '+a.recovery.sleepQuality+'/10. Regra de atenção de coaching, não limiar médico.');
    if(a.recovery.stress!=null&&Number(a.recovery.stress)>=8)add('yellow','Stress a acompanhar','Stress declarado: '+a.recovery.stress+'/10. Regra de atenção de coaching, não limiar médico.');
    // A malformed/incomplete legacy completed row must never produce a reassuring green state.
    if(status==='completed'){try{validate(raw,true);}catch{add('yellow','Informação incompleta','Existem respostas por preencher ou validar; revê a anamnese completa.');}}
    return {level:items.some(i=>i.level==='red')?'red':items.length?'yellow':'green',items};
  }
  function summary(raw){const a=sanitize(raw);return [
    ['Objetivo',[...new Set([a.goals.primary,...a.goals.secondary||[]].filter(Boolean))].join(' + ')||'—'],
    ['Peso',`${a.personal.weight??'—'} kg${a.goals.goalWeight===true?' → objetivo '+(a.goals.targetWeight??'—')+' kg':''}`],
    ['Experiência',`${a.training.level||'—'} · ${a.training.current===true?'Treina '+(a.training.frequency??'—')+'x/semana':a.training.current===false?'Não treina atualmente':'Treino atual por indicar'}`],
    ['Disponibilidade',`${a.availability.frequency??'—'}x/semana · ${a.availability.duration||'—'} · ${(a.availability.days||[]).join(' · ')}`],
    ['Recuperação',`Sono: ${a.recovery.sleepHours??'—'}h · Qualidade: ${a.recovery.sleepQuality??'—'}/10 · Stress: ${a.recovery.stress??'—'}/10`],
    ['Dores/limitações',a.limitations.currentPain===false?'Sem dor atual declarada':(a.limitations.pains||[]).map(p=>`${p.zone||'—'} · ${p.side||'—'} · ${p.intensity??'—'}/10${p.aggravating?' · '+p.aggravating:''}`).join('\n')||'Por indicar'],
    ['Aderência',`Confiança: ${a.motivation.confidence??'—'}/10 · Principal dificuldade: ${a.motivation.difficulty||'—'}`]
  ];}
  function check(current){if(!current())throw fail('A sessão ou o aluno mudou. Abre novamente a anamnese.');}
  async function authorize(c,account,studentId,mode,current=()=>true){
    check(current);
    const {data,error}=await c.auth.getUser();if(error)throw error;
    if(!data?.user||data.user.id!==account?.id)throw fail('Inicia sessão novamente.');
    const profile=await c.from('profiles').select('id,role').eq('id',data.user.id).maybeSingle();if(profile.error)throw profile.error;
    if(!profile.data||profile.data.id!==account.id||profile.data.role!==account.role)throw fail('O perfil mudou. Inicia sessão novamente.');
    if(mode==='answers'&&(account.role!=='student'||studentId!==data.user.id))throw fail('Só o próprio aluno pode alterar as respostas.');
    if(mode==='notes'&&!['trainer','admin'].includes(account.role))throw fail('As observações pertencem ao treinador.');
    await A.assertAccess(c,account,studentId,mode==='notes');check(current);
  }
  async function row(c,table,studentId,trainerId){
    let q=c.from(table).select(columns[table]).eq('student_id',studentId);if(trainerId)q=q.eq('trainer_id',trainerId);
    const {data,error}=await q.maybeSingle();if(error)throw error;
    if(data&&(data.student_id!==studentId||trainerId&&data.trainer_id!==trainerId))throw fail('Resposta fora do aluno selecionado.');return data;
  }
  async function read(c,a,s,current=()=>true){await authorize(c,a,s,'read',current);const record=await row(c,'anamneses',s);check(current);return record;}
  async function readNotes(c,a,s,current=()=>true){await authorize(c,a,s,'notes',current);const record=await row(c,'anamnesis_trainer_notes',s,a.id);check(current);return record;}
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  function equivalent(row,payload,keys){return keys.every(k=>same(row[k],payload[k]));}
  async function persist(c,table,s,trainer,previous,payload,keys,current){
    check(current);let q;
    if(previous){q=c.from(table).update(payload).eq('id',previous.id).eq('student_id',s);if(trainer)q=q.eq('trainer_id',trainer);q=previous.updated_at?q.eq('updated_at',previous.updated_at):q.is('updated_at',null);}
    else q=c.from(table).insert(payload);
    const {data,error}=await q.select(columns[table]).maybeSingle();
    if(error&&error.code!=='23505')throw error;
    if(data){if(data.student_id!==s||trainer&&data.trainer_id!==trainer)throw fail('Resposta fora do aluno selecionado.');return data;}
    // A lost response can be retried; UNIQUE prevents a second first draft.
    const existing=await row(c,table,s,trainer);check(current);
    if(existing&&equivalent(existing,payload,keys))return existing;
    throw fail('A informação foi alterada noutra sessão. As tuas respostas continuam neste ecrã. Recarrega os dados antes de voltar a editar.',{code:'CONFLICT'});
  }
  function timestamp(previous){return new Date(Math.max(Date.now(),Date.parse(previous?.updated_at||'')+1||0)).toISOString();}
  async function save(c,a,s,raw,{previous=null,id,mutationId,step=0,complete=false},current=()=>true){
    const answers=validate(raw,complete);if(!Number.isInteger(step)||step<0||step>11)throw fail('Etapa inválida.');
    if(previous&&!compatible(previous.answers))throw fail('Formato de anamnese incompatível. Nenhuma resposta foi alterada.');
    answers._meta={version:1,currentStep:step,saveId:mutationId};
    await authorize(c,a,s,'answers',current);
    const now=timestamp(previous),payload={student_id:a.id,status:complete?'completed':'draft',answers,completed_at:complete?now:null,updated_at:now};
    if(!previous)Object.assign(payload,{id,created_at:now});
    return persist(c,'anamneses',a.id,null,previous,payload,['status','answers'],current);
  }
  async function saveNotes(c,a,s,notes,{previous=null,id},current=()=>true){
    if(typeof notes!=='string'||notes.length>12000)throw fail('As observações devem ter até 12000 caracteres.');
    await authorize(c,a,s,'notes',current);
    const now=timestamp(previous),payload={student_id:s,trainer_id:a.id,notes:notes.trim(),updated_at:now};
    if(!previous)Object.assign(payload,{id,created_at:now});
    return persist(c,'anamnesis_trainer_notes',s,a.id,previous,payload,['notes'],current);
  }
  function message(e){if(['ANAMNESIS','CONFLICT','ASSOCIATION'].includes(e?.code))return e.message;return 'Não foi possível aceder ou guardar no Supabase. As respostas neste ecrã foram preservadas. Verifica a ligação e as permissões e tenta novamente.';}
  return {sections,columns,empty,clone,visible,sanitize,validate,compatible,alerts,summary,read,save,readNotes,saveNotes,message};
});
