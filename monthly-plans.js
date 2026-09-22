(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./assessments.js'));else root.CoachMonthly=factory(root.CoachAssessments);})(typeof window==='object'?window:globalThis,function(A){
 const error=message=>Object.assign(new Error(message),{code:'MONTHLY'});
 async function access(c,a,s,current=()=>true){await A.assertAccess(c,a,s,true);if(!current())throw error('A sessão mudou. Abre novamente o aluno.');}
 async function rpc(c,name,args){const {data,error:e}=await c.rpc(name,args);if(e)throw error(e.code==='42501'?'Associação indisponível.':'Não foi possível guardar. Recarrega para confirmar o estado antes de repetir.');return data;}
 async function read(c,a,s){await access(c,a,s);const out={};for(const [key,table]of [['drafts','monthly_plan_drafts'],['context','monthly_plan_context'],['jobs','monthly_generation_jobs']]){out[key]=[];for(let offset=0;;offset+=500){const {data,error:e}=await c.from(table).select('*').eq('student_id',s).eq('trainer_id',a.id).order(key==='context'?'student_id':'month',{ascending:false}).range(offset,offset+499);if(e)throw error('Planos mensais indisponíveis. Confirma a instalação da v0.8 no backend.');out[key].push(...data);if(data.length<500)break;}}return out;}
 async function save(c,a,s,month,payload,revision,current){await access(c,a,s,current);return rpc(c,'monthly_save',{s,m:month,v:payload,expected_revision:revision});}
 async function approve(c,a,s,d,current){await access(c,a,s,current);return rpc(c,'monthly_approve',{did:d.id,expected_revision:d.revision});}
 async function context(c,a,s,v,current){await access(c,a,s,current);return rpc(c,'monthly_save_context',{s,v});}
 async function generate(c,a,s,current){await access(c,a,s,current);const {data,error:e}=await c.functions.invoke('monthly-plans',{body:{student_id:s}});if(e||data?.error)throw error(data?.error||'Não foi possível gerar. Confirma os dados do aluno e tenta novamente mais tarde.');return data;}
 const nextMonth=(d=new Date())=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit'}).formatToParts(d);const y=Number(parts.find(p=>p.type==='year').value),m=Number(parts.find(p=>p.type==='month').value);return `${y+(m===12?1:0)}-${String(m===12?1:m+1).padStart(2,'0')}-01`;};
 return {read,save,approve,context,generate,nextMonth};
});
