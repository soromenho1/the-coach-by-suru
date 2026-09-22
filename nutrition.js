/* Pure validation and previews. The database independently calculates and authorizes writes. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CoachNutrition=api;
})(typeof window==='undefined'?globalThis:window,()=>{
  'use strict';
  const bad=(code,message,field)=>Object.assign(new Error(message),{code,field});
  const blank=v=>v==null||String(v).trim()==='';
  const round=(n,d=0)=>Number(n.toFixed(d));
  function number(value,label,min=0,max=100000){
    const text=String(value??'').trim();
    if(!/^\d+(?:[.,]\d+)?$/.test(text))throw bad('invalid_number',`${label}: indica um número válido.`,label);
    const n=Number(text.replace(',','.'));
    if(!Number.isFinite(n)||n<min||n>max)throw bad('invalid_number',`${label}: usa um valor entre ${min} e ${max}.`,label);
    return n;
  }
  function date(value,label='Data'){
    const d=new Date(`${value}T12:00:00Z`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||String(value).startsWith('0000-')||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)
      throw bad('invalid_date',`${label}: indica uma data válida.`,label);
    return value;
  }
  function ageOn(birth,on=new Date()){
    if(blank(birth))throw bad('missing_input','Data de nascimento necessária.','date_of_birth');
    date(birth,'Data de nascimento');
    const today=on instanceof Date?on.toISOString().slice(0,10):String(on).slice(0,10);
    date(today);
    let age=Number(today.slice(0,4))-Number(birth.slice(0,4));
    if(today.slice(5)<birth.slice(5))age--;
    if(age<18||age>120)throw bad('invalid_age','O cálculo automático está disponível apenas para adultos entre 18 e 120 anos.','date_of_birth');
    return age;
  }
  function bmr({sex,weightKg,heightCm,date_of_birth,age,on}){
    const weight=number(weightKg,'Peso',1,700),height=number(heightCm,'Altura',1,300);
    const years=age==null?ageOn(date_of_birth,on):number(age,'Idade',18,120);
    if(!Number.isInteger(years)||!['male','female'].includes(sex))throw bad('missing_input','Revê idade e sexo na anamnese.','sex');
    const result=round(10*weight+6.25*height-5*years+(sex==='male'?5:-161));
    if(result<=0)throw bad('invalid_number','Dados incompatíveis com o cálculo.');
    return result;
  }
  function targets(input){
    const base=bmr(input),factor=number(input.activity_factor,'Fator de atividade',1,3);
    const goal=input.goal_type||'maintenance';
    if(!['fat_loss','maintenance','muscle_gain','custom'].includes(goal))throw bad('invalid_goal','Objetivo inválido.');
    const pct=number(input.strategy_percentage??0,'Percentagem',0,50),tdee=round(base*factor);
    const calculated=round(tdee*(goal==='fat_loss'?1-pct/100:goal==='muscle_gain'?1+pct/100:1));
    const finalTarget=blank(input.final_calorie_target)?calculated:number(input.final_calorie_target,'Meta calórica',1,50000);
    const weight=number(input.weightKg,'Peso',1,700);
    const protein=input.protein_g!=null?number(input.protein_g,'Proteína',0,7000):round(number(input.protein_g_per_kg??1.6,'Proteína por kg',0,10)*weight,1);
    const fat=input.fat_g!=null?number(input.fat_g,'Gordura',0,7000):round(number(input.fat_g_per_kg??0.8,'Gordura por kg',0,10)*weight,1);
    const remaining=finalTarget-protein*4-fat*9;
    if(remaining<0)throw bad('invalid_macros','Proteína e gordura excedem a meta calórica.');
    const waterRule=number(input.hydration_rule_ml_kg??35,'Regra de hidratação',1,100);
    return {bmr_kcal:base,activity_factor:factor,strategy_percentage:pct,tdee_kcal:tdee,calculated_calorie_target:calculated,
      final_calorie_target:finalTarget,protein_g:protein,fat_g:fat,carbohydrate_g:round(remaining/4,1),
      calculated_water_ml:round(weight*waterRule),hydration_rule_ml_kg:waterRule,calorie_delta:round(finalTarget-calculated,1),formula:'Mifflin-St Jeor'};
  }
  function safetyGate(answers={},screening={},status='draft'){
    const reasons=[],missing=[];
    if(status!=='completed')missing.push('Concluir a anamnese');
    for(const [value,label] of [[answers.health?.diabetes,'diabetes'],[answers.health?.medicalRestriction,'restrição médica'],
      [answers.health?.otherCondition,'outra condição médica'],[answers.nutrition?.allergies,'alergias/intolerâncias'],
      [screening.pregnancy,'gravidez/amamentação'],[screening.renal,'condição renal'],[screening.eating_disorder,'perturbação alimentar']]){
      if(typeof value!=='boolean')missing.push(label);else if(value)reasons.push(label);
    }
    return {status:missing.length?'INCOMPLETE':reasons.length?'REQUIRES_PROFESSIONAL_REVIEW':'READY',reasons,missing};
  }
  function validateProfile(v){bmr(v);return v;}
  const text=(v,label,max,required=false)=>{
    const out=String(v??'').trim();
    if(out.length>max||(required&&!out))throw bad('invalid_text',`${label}: ${required?'preenche com':'máximo de'} ${max} caracteres.`,label);
    return out;
  };
  function planPayload(plan,today=new Date().toISOString().slice(0,10)){
    if(!Array.isArray(plan.days)||plan.days.length!==7)throw bad('invalid_plan','O plano deve ter sete dias.');
    return {id:plan.id,revision:plan.revision,name:text(plan.name,'Nome do plano',150,true),objective:text(plan.objective,'Objetivo',1000),nutrition_target_id:plan.nutrition_target_id||null,
      days:plan.days.map(d=>{
        if(!Array.isArray(d.meals)||d.meals.length<1||d.meals.length>12)throw bad('invalid_plan','Cada dia deve ter entre 1 e 12 refeições.');
        return {meals:d.meals.map(m=>{
          if(!Array.isArray(m.items)||m.items.length>30)throw bad('invalid_plan','Máximo de 30 alimentos por refeição.');
          if(m.scheduled_time&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(m.scheduled_time))throw bad('invalid_time','Horário inválido.');
          return {name:text(m.name,'Nome da refeição',150,true),scheduled_time:m.scheduled_time||null,notes:text(m.notes,'Notas da refeição',2000),
            items:m.items.map(x=>{
              date(x.source_checked_on,'Data de consulta');
              if(x.source_checked_on>today)throw bad('invalid_date','A data de consulta não pode ser futura.');
              const source=text(x.nutrition_source,'Fonte dos nutrientes',300,true);
              if(source.length<3)throw bad('invalid_text','Identifica a fonte dos nutrientes.');
              return {display_name:text(x.display_name,'Alimento',200,true),quantity:number(x.quantity,'Quantidade',0.001,100000),unit:text(x.unit,'Unidade',30,true),
                grams:blank(x.grams)?null:number(x.grams,'Gramas',0.001,100000),kcal:number(x.kcal,'Calorias'),protein_g:number(x.protein_g,'Proteína',0,10000),
                carbohydrate_g:number(x.carbohydrate_g,'Hidratos',0,10000),fat_g:number(x.fat_g,'Gordura',0,10000),nutrition_source:source,
                source_checked_on:x.source_checked_on,source_version:text(x.source_version,'Versão da fonte',100)};
            })};
        })};
      })};
  }
  function totals(day){
    const result={kcal:0,protein_g:0,carbohydrate_g:0,fat_g:0};
    for(const m of day.meals||[])for(const item of m.items||[])for(const key of Object.keys(result)){
      const n=Number(String(item[key]??'').replace(',','.'));
      if(Number.isFinite(n))result[key]+=n;
    }
    return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,round(v,1)]));
  }
  return {number,date,ageOn,bmr,targets,safetyGate,validateProfile,planPayload,totals};
});
