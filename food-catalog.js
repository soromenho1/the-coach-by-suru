(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./food-catalog-data.js'):root.CoachFoodData);if(typeof module==='object'&&module.exports)module.exports=api;else root.CoachFoodCatalog=api;})(typeof window==='object'?window:globalThis,data=>{
 'use strict';
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const dictionary={frango:'chicken',peru:'turkey',peito:'breast',cozido:'cooked',cozida:'cooked',cozidos:'cooked',cru:'raw',crua:'raw',crus:'raw',grelhado:'grilled',assado:'roasted',arroz:'rice',integral:'brown',branco:'white',batata:'potato',batatas:'potatoes',doce:'sweet',massa:'pasta',esparguete:'spaghetti',pao:'bread',aveia:'oats',leite:'milk',iogurte:'yogurt',queijo:'cheese',ovo:'egg',ovos:'egg',salmao:'salmon',atum:'tuna',bacalhau:'cod',sardinha:'sardine',peixe:'fish',maca:'apple',peras:'pears',pera:'pear',morango:'strawberry',morangos:'strawberries',laranja:'orange',nozes:'walnuts',amendoas:'almonds',azeite:'olive oil',brocolos:'broccoli',cenoura:'carrot',tomate:'tomato',espinafres:'spinach',feijao:'beans',lentilhas:'lentils',grao:'chickpeas',quinoa:'quinoa',abacate:'avocado',manteiga:'butter',porco:'pork',vaca:'beef'};
 const source='https://fdc.nal.usda.gov/';
 const foods=(data?.rows||[]).map(([id,name,release,kcal,protein_g,fat_g,carbohydrate_g,fibre_g,energy_id])=>({id:'usda:'+id,name,release,kcal,protein_g,fat_g,carbohydrate_g,fibre_g,energy_id,source:`https://fdc.nal.usda.gov/food-details/${id}/nutrients`,source_name:'USDA',version:`USDA ${release} · ${id} · H totais`,checked:data.checked,carbohydrate_basis:'Hidratos totais, incluindo fibra',basis_g:100,search:norm(name),priority:release.startsWith('Foundation')?1:2}));
 const byId=new Map(foods.map(f=>[f.id,f]));
 function search(query,limit=20){
  const q=norm(query);if(q.length<2)return [];
  const original=q.split(/\s+/).filter(Boolean),translated=original.filter(t=>!['de','da','do','com'].includes(t)).flatMap(t=>(dictionary[t]||t).split(' '));
  return foods.filter(f=>original.every(t=>f.search.includes(t))||translated.length&&translated.every(t=>f.search.includes(t)))
   .sort((a,b)=>a.priority-b.priority||a.name.length-b.name.length||a.name.localeCompare(b.name)).slice(0,Math.min(limit,100));
 }
 const round=n=>Math.round(n*10)/10;
 function quantity(value){const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)||n<=0||n>100000)throw Error('Indica uma quantidade em gramas entre 0 e 100 000.');return n;}
 function portion(food,value){const grams=quantity(value);if(!food||['kcal','protein_g','fat_g','carbohydrate_g'].some(k=>typeof food[k]!=='number'||!Number.isFinite(food[k])||food[k]<0))throw Error('Este alimento não tem valores completos.');return {display_name:food.name,quantity:grams,unit:'g',grams,kcal:round(food.kcal*grams/100),protein_g:round(food.protein_g*grams/100),fat_g:round(food.fat_g*grams/100),carbohydrate_g:round(food.carbohydrate_g*grams/100),nutrition_source:food.source,source_checked_on:food.checked,source_version:food.version};}
 function match(item){return foods.find(f=>item.source_version===f.version&&item.nutrition_source===f.source&&item.display_name===f.name&&item.unit==='g');}
 function label(values){
  const name=String(values.name||'').trim(),brand=String(values.brand||'').trim(),checked=values.checked;
  if(!name||!brand||name.length>200||brand.length>200)throw Error('Indica o produto e a marca do rótulo.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(checked||'')||!Number.isFinite(Date.parse(checked+'T00:00:00Z'))||new Date(checked+'T00:00:00Z').toISOString().slice(0,10)!==checked)throw Error('Indica a data de consulta do rótulo.');
  const food={name,source:'Rótulo · '+brand,checked};
  for(const k of ['kcal','protein_g','fat_g','carbohydrate_g']){if(String(values[k]??'').trim()==='')throw Error('Preenche todos os valores por 100 g.');const n=Number(String(values[k]).replace(',','.'));if(!Number.isFinite(n)||n<0||n>(k==='kcal'?1000:100))throw Error('Confirma os valores por 100 g do rótulo.');food[k]=n;}
  food.version='Rotulo100g:'+['kcal','protein_g','fat_g','carbohydrate_g'].map(k=>food[k]).join('|');return food;
 }
 function matchLabel(item){if(item.unit!=='g'||!item.nutrition_source?.startsWith('Rótulo · ')||!/^Rotulo100g:(\d+(?:\.\d+)?\|){3}\d+(?:\.\d+)?$/.test(item.source_version||''))return null;const [kcal,protein_g,fat_g,carbohydrate_g]=item.source_version.slice(11).split('|').map(Number);try{return label({name:item.display_name,brand:item.nutrition_source.slice(9),checked:item.source_checked_on,kcal,protein_g,fat_g,carbohydrate_g});}catch{return null;}}
 return {foods,search,portion,match,label,matchLabel,get:id=>byId.get(id),status:{count:foods.length,portfir:'pending_official_file',checked:data?.checked}};
});
