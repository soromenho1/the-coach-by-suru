/* CoFID 2021, Proximates: protein, fat, carbohydrate and kcal per 100 g edible food.
 * Contains public sector information licensed under the Open Government Licence v3.0.
 * https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
 * Source: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid
 * Consulted 2026-09-26. Tr (trace) is treated as zero at the source's precision.
 * Portion bounds and meal templates below are application heuristics, not CoFID recommendations.
 */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./nutrition.js'):root.CoachNutrition);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CoachNutritionGenerator=api;
})(typeof window==='undefined'?globalThis:window,N=>{
  'use strict';
  const source='https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid';
  const checked='2026-09-26';
  // id, Portuguese preparation, group, dietary category, aliases, min/max grams, P/F/C/kcal.
  const rows=[
    ['18-323','Peito de frango grelhado, sem pele','protein','meat','frango;carne',70,250,32,2.2,0,148],
    ['18-356','Peito de peru grelhado, sem pele','protein','meat','peru;carne',70,250,35,1.7,0,155],
    ['16-359','Salmão assado, sem pele e espinhas','protein','fish','salmao;peixe',70,220,25.2,14.6,0,232],
    ['13-570','Tofu cozido a vapor','protein','vegan','tofu;soja',100,350,8.1,4.2,0.7,73],
    ['13-661','Lentilhas cozidas, sem sal','pulse','vegan','lentilhas;leguminosas',100,300,7.8,0.7,14.5,92],
    ['11-858','Arroz basmati cozido, sem sal','starch','vegan','arroz',80,350,2.8,0.7,26.5,117],
    ['11-723','Esparguete integral cozido, sem sal','starch','vegan','massa;esparguete;trigo;gluten',80,350,5.2,1.1,27.5,134],
    ['13-490','Batata cozida, sem pele e sem sal','starch','vegan','batata',100,400,1.8,0.1,17.5,74],
    ['11-981','Pão integral','bread','vegan','pao;trigo;gluten',30,130,9.4,2.5,42,217],
    ['12-379','Iogurte natural magro','dairy','dairy','iogurte;leite;laticinios;lactose',100,300,4.8,1,7.8,57],
    ['12-940','Ovo cozido, sem casca','egg','egg','ovo;ovos',50,150,14.1,9.6,0,143],
    ['14-318','Banana sem casca','fruit','vegan','banana;fruta',80,200,1.2,0.1,20.3,81],
    ['14-319','Maçã crua com casca, sem caroço','fruit','vegan','maca;fruta',80,200,0.6,0.5,11.6,51],
    ['14-321','Pera crua com casca, sem caroço','fruit','vegan','pera;fruta',80,200,0.3,0.1,10.9,43],
    ['13-503','Brócolos cozidos, sem sal','veg','vegan','brocolos;legumes;horticolas',100,250,3.3,0.5,2.8,28],
    ['13-497','Cenoura cozida, sem sal','veg','vegan','cenoura;legumes;horticolas',100,250,0.5,0.5,6,29],
    ['13-628','Curgete cozida, sem sal','veg','vegan','curgete;courgette;legumes;horticolas',100,250,1.3,0.3,1.8,15],
    ['17-038','Azeite','oil','vegan','azeite',3,20,0,99.9,0,899],
    ['14-879','Nozes sem casca','nuts','vegan','nozes;frutos secos',10,30,14.7,68.5,3.3,688],
    ['14-896','Amêndoas sem casca','nuts','vegan','amendoas;frutos secos',10,30,21.2,49.9,5.3,554]
  ];
  const catalog=rows.map(([id,name,group,diet,aliases,min,max,p,f,c,k])=>({id,name,group,diet,aliases:aliases.split(';'),min,max,protein_g:p,fat_g:f,carbohydrate_g:c,kcal:k}));
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  function fail(message){throw new Error(message);}
  function terms(value,label){
    const text=norm(value);
    if(!text||['nenhum','nenhuma','sem preferencias','sem restricoes'].includes(text))return [];
    const tokens=text.split(/[,;\n]+/).map(t=>t.trim()).filter(Boolean);
    for(const t of tokens)if(!catalog.some(f=>f.aliases.includes(t)||norm(f.name)===t))
      fail(`${label}: não reconheço «${t}». Usa nomes separados por vírgulas da lista de alimentos disponíveis ou preenche o plano manualmente. Não elimines restrições para conseguir gerar.`);
    return tokens;
  }
  function candidates(profile){
    const pattern=norm(profile?.dietary_pattern);
    const patterns={'':'omnivore',variado:'omnivore',variada:'omnivore',omnivoro:'omnivore',omnivora:'omnivore',mediterranico:'omnivore',mediterranica:'omnivore',vegetariano:'vegetarian',vegetariana:'vegetarian',ovolactovegetariano:'vegetarian',ovolactovegetariana:'vegetarian',vegano:'vegan',vegana:'vegan',vegan:'vegan',pescetariano:'fish',pescetariana:'fish'};
    if(!Object.hasOwn(patterns,pattern))fail('Este padrão alimentar ainda não é suportado pela geração. Usa Variado, Vegetariano, Vegano ou Pescetariano, apenas se corresponder ao aluno; caso contrário, preenche manualmente.');
    const diet=patterns[pattern],avoid=terms(profile?.preferences?.dislikes,'Alimentos a evitar'),likes=terms(profile?.preferences?.likes,'Preferências');
    const matches=(f,t)=>f.aliases.includes(t)||norm(f.name)===t;
    const foods=catalog.filter(f=>!avoid.some(t=>matches(f,t))&&(diet==='omnivore'||f.diet==='vegan'||diet==='vegetarian'&&['egg','dairy'].includes(f.diet)||diet==='fish'&&f.diet!=='meat'));
    return {foods,likes,matches};
  }
  const keys=['kcal','protein_g','fat_g','carbohydrate_g'];
  const r=n=>Math.round(n*10)/10;
  function portion(food,grams){
    return {display_name:food.name,quantity:grams,unit:'g',grams,...Object.fromEntries(keys.map(k=>[k,r(food[k]*grams/100)])),nutrition_source:source,source_checked_on:checked,source_version:`CoFID 2021 · ${food.id}`};
  }
  function fit(meals,target){
    const entries=meals.flatMap(m=>m.foods.map(food=>({food,grams:(food.min+food.max)/2})));
    const goals=[target.final_calorie_target,target.protein_g,target.fat_g,target.carbohydrate_g].map(Number);
    const weights=[4,2,1,1];
    const vectors=entries.map(e=>keys.map((k,i)=>e.food[k]/100/Math.max(goals[i],1)*Math.sqrt(weights[i])));
    const expected=goals.map((g,i)=>g/Math.max(g,1)*Math.sqrt(weights[i]));
    const actual=expected.map((_,i)=>entries.reduce((s,e,j)=>s+e.grams*vectors[j][i],0));
    // Bounded coordinate descent; nutrients are always derived from the selected foods.
    for(let pass=0;pass<500;pass++){
      let change=0;
      entries.forEach((e,j)=>{
        const v=vectors[j],den=v.reduce((s,x)=>s+x*x,0);
        const delta=v.reduce((s,x,i)=>s+x*(expected[i]-actual[i]),0)/den;
        const next=Math.max(e.food.min,Math.min(e.food.max,e.grams+delta)),diff=next-e.grams;
        e.grams=next;change+=Math.abs(diff);v.forEach((x,i)=>actual[i]+=x*diff);
      });
      if(change<0.01)break;
    }
    let index=0;
    const out=meals.map(m=>({name:m.name,scheduled_time:null,notes:'Pesar a parte comestível no estado indicado. Preparar sem gordura adicional além da indicada. Rever porções e adequação ao aluno.',items:m.foods.map(f=>{const e=entries[index++];const step=f.group==='oil'?1:5;return portion(f,Math.max(f.min,Math.min(f.max,Math.round(e.grams/step)*step)));})}));
    const total=N.totals({meals:out});
    const deviations=keys.map((k,i)=>Math.abs(total[k]-goals[i])/Math.max(goals[i],1));
    return {meals:out,score:deviations.reduce((s,x)=>s+x,0),fits:deviations[0]<=0.10&&deviations.slice(1).every(x=>x<=0.20)};
  }
  function generate({context,target,mealsPerDay,weekStart,trainerId}){
    if(context?.review_status!=='READY')fail('Conclui a triagem. As restrições de saúde sinalizadas exigem revisão profissional antes da geração.');
    N.bmr({...context.input,on:context.calculated_on});
    if(!target||!target.id||target.trainer_id!==trainerId||target.context_hash!==context.context_hash)fail('Seleciona uma meta atual, guardada por ti para este aluno. Recalcula a meta se os dados ou preferências mudaram.');
    for(const k of ['final_calorie_target','protein_g','fat_g','carbohydrate_g'])N.number(target[k],k,k==='final_calorie_target'?1:0,50000);
    N.date(weekStart);N.date(context.calculated_on);
    if(context.calculated_on<checked)fail('A data do servidor é anterior à versão do catálogo. Atualiza a página.');
    const n=N.number(mealsPerDay,'Refeições',3,6);if(!Number.isInteger(n))fail('Usa entre três e seis refeições na geração automática.');
    const {foods,likes,matches}=candidates(context.profile);
    const groups=group=>foods.filter(f=>f.group===group);
    for(const group of ['starch','fruit','veg','oil'])if(!groups(group).length)fail('Não existem alimentos suficientes compatíveis com estas preferências. Preenche o plano manualmente.');
    const days=[];
    for(let d=0;d<7;d++){
      let best=null;
      for(let attempt=0;attempt<12;attempt++){
        let cursor=d+attempt;
        const pick=(pool)=>{
          if(!pool.length)fail('Não existem alimentos suficientes compatíveis com estas preferências. Preenche o plano manualmente.');
          const preferred=pool.filter(f=>likes.some(t=>matches(f,t)));
          const available=preferred.length&&cursor%3!==2?preferred:pool;
          return available[cursor++%available.length];
        };
        const main=name=>{
          const protein=pick(foods.filter(f=>['protein','pulse','egg'].includes(f.group)));
          const fs=[protein,pick(groups('starch')),pick(groups('veg')),pick(groups('oil'))];
          if(protein.diet==='vegan'&&protein.group!=='pulse'&&groups('pulse').length)fs.push(pick(groups('pulse')));
          return {name,foods:fs};
        };
        const light=(name,breakfast=false)=>{
          const fs=[pick(groups('fruit'))];
          const options=foods.filter(f=>['dairy','egg','nuts'].includes(f.group));
          fs.push(pick(options));
          if(breakfast){if(groups('bread').length)fs.push(pick(groups('bread')));else fs.push(pick(groups('starch')));}
          if(!fs.some(f=>f.group==='nuts')&&groups('nuts').length)fs.push(pick(groups('nuts')));
          return {name,foods:fs};
        };
        const meals=[light('Pequeno-almoço',true)];
        if(n>=5)meals.push(light('Lanche da manhã'));
        meals.push(main('Almoço'));
        if(n>=4)meals.push(light('Lanche da tarde'));
        meals.push(main('Jantar'));
        if(n===6)meals.push(light('Ceia'));
        const result=fit(meals,target);if(!best||result.score<best.score)best=result;
        if(result.fits)break;
      }
      if(!best.fits)fail(`Não consegui aproximar o dia ${d+1} das metas com porções adequadas e os alimentos disponíveis. Ajusta manualmente o plano ou revê a meta e o número de refeições.`);
      const date=new Date(weekStart+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+d);
      days.push({position:d+1,day_date:date.toISOString().slice(0,10),meals:best.meals});
    }
    return days;
  }
  return {generate,catalog,portion,candidates,source,checked};
});
