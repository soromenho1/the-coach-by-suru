# The Coach by Suru · v0.11.0


A v0.8 inclui anamnese, planos mensais, séries flexíveis e Nutrição. As migrações de Nutrição foram aplicadas ao Supabase. Ver [revisão da v0.8](V08-REVIEW.md) para a configuração original dos planos mensais e scheduler; as secções abaixo descrevem também as funcionalidades posteriores.

Aplicação estática em português com Supabase Auth. A v0.7 acrescenta planos, treinos, sessões e registo de séries no Supabase. Mantém a Avaliação física e a Evolução da v0.6, a autenticação existente e o CSS original.

## Executar e testar

```sh
python3 -m http.server 8000 --bind 127.0.0.1
# Abrir http://localhost:8000
node --test tests/*.test.cjs
```

Node 18 ou superior para os testes. A aplicação precisa de Internet para o SDK e o Supabase. Não existe compilação nem dependência Node em produção.

O teste de navegador requer Playwright e Chromium instalados no ambiente de testes:

```sh
node tests/browser-assessments.cjs
node tests/browser-workouts.cjs
# Se o Playwright estiver instalado fora do projeto:
COACH_PLAYWRIGHT=/caminho/para/node_modules/playwright node tests/browser-assessments.cjs
node tests/browser-workouts.cjs
```

## Funcionalidades

- Áreas por `profiles.role`: `trainer`, `student` e `admin`. O aluno consulta apenas as suas avaliações. O formulário de criação é disponibilizado a treinador/admin com associação ativa, sem acesso global implícito para admin.
- Antes de consultar ou gravar, confirma `trainer_students.trainer_id = account.id`, `student_id` e `active = true`. As políticas RLS continuam a ser a autoridade no servidor.
- Avaliação com data, peso, altura, massa gorda, massa muscular, peito, cintura, abdómen, anca, braços, coxas, gémeos e observações. Os nomes exatos estão em [SCHEMA.md](SCHEMA.md).
- Aceita vírgula ou ponto decimal; rejeita números negativos, valores não finitos, datas inválidas e gordura acima de 100%. Exige uma data e pelo menos uma medição. Campos opcionais vazios são enviados como `NULL`; zero não é confundido com ausência de dados.
- INSERT em `assessments` com o `student_id` selecionado. Um UUID por formulário evita duplicação ao repetir uma tentativa cuja resposta se perdeu; não usa UPDATE nem UPSERT. `created_at` usa o default `now()` do servidor.
- Mensagens claras de sucesso e erro. Falhas preservam os campos preenchidos. Erros de permissão não desencadeiam alterações de RLS nem gravações alternativas.
- Histórico completo, paginado na leitura, ordenado por `assessment_date DESC`, depois `created_at DESC` e `id DESC` para desempate. Detalhes de todas as medidas e observações podem ser expandidos.
- Cartões Peso/Massa gorda mostram a avaliação cronologicamente mais recente. Sem avaliação ou sem uma dessas medidas, mostram `—`; não recuperam silenciosamente valores de uma avaliação antiga.
- Evolução mostra histórico real de peso e massa gorda e a diferença última − primeira avaliação. Gordura é comparada em pontos percentuais. Se uma medição faltar num extremo, a diferença é `—`.
- Perfil, histórico e evolução consultam novamente o Supabase ao serem abertos, incluindo após recarregar. Não guardam avaliações em localStorage.
- Respostas de consultas antigas não substituem uma nova página ou conta. Uma mudança de sessão durante a verificação de associação impede a gravação pendente. Eventos de autenticação repetidos ao focar a janela não apagam um formulário em preenchimento.

Água, cardio e check-in permanecem com os estados sem dados da v0.5. A Anamnese já tem integração própria, descrita abaixo. O formulário usa os cartões, cores e campos existentes; inputs decimais e datas têm tamanho de letra adequado a iPhone.

## Segurança e schema

A aplicação usa exclusivamente a Publishable Key já configurada para `ihpqwfxxjbpjizuoeqqf.supabase.co`. Não contém chave secreta nem credencial com privilégios de serviço. Não modifica políticas, tabelas ou permissões.

O proprietário confirmou as 19 colunas, defaults e políticas documentados em [SCHEMA.md](SCHEMA.md). A API aceitou um SELECT explícito dessas 19 colunas com `limit=0` (HTTP 200). Não foi identificada necessidade de migração SQL.

## Validação das avaliações (v0.6, repetida na v0.7)

- 44 testes automáticos: regressão da v0.5, validação de todos os campos, acesso por role/associação, paginação, datas, diferenças, erros de RLS e repetição de pedidos sem duplicação.
- Chromium, a 390 e 1440 px: fluxo treinador → Maria → Avaliação física, todos os campos, erro de INSERT, gravação, histórico, cartões, avaliação retroativa, recarregamento, evolução, associação desativada e erro de leitura. Sem erros JavaScript nem overflow horizontal. O teste carrega o SDK real e simula os endpoints Auth/REST; as medições de teste nunca são enviadas ao Supabase real.
- A persistência após recarregamento foi confirmada nesse servidor simulado. A gravação e leitura autenticadas na Maria real não foram testadas: falta uma sessão de treinador e medidas reais ou autorização explícita para registos de teste. A configuração RLS foi confirmada pelo proprietário, mas não auditada diretamente no servidor.

Para validação real, iniciar sessão como treinador em `http://localhost:8000`, abrir Maria, guardar medidas autorizadas, recarregar e confirmar histórico, cartões e evolução. Testar também um aluno não associado e uma associação inativa com contas de teste autorizadas. Não introduzir medições fictícias num perfil real.

Referências: [INSERT Supabase](https://supabase.com/docs/reference/javascript/insert), [eventos de autenticação](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).


## Planos e cargas — v0.7

- Treinador/admin associado: criar plano com nome, objetivo, início, fim opcional e estado; ativar/desativar; criar vários treinos ordenados; adicionar exercícios com ordem, séries, repetições alvo, carga/RIR alvo, descanso e notas. As operações verificam novamente a associação ativa antes de gravar.
- Aluno: abre os seus planos, escolhe o treino do dia e inicia/retoma uma sessão. O schema não contém agendamento por dia da semana; a escolha é do aluno. Novas sessões exigem plano ativo e dentro das datas. Sessões já iniciadas podem ser retomadas pelo histórico.
- Cada série guarda kg, repetições, RIR opcional e notas no Supabase. Aceita vírgula/ponto decimal e carga zero para peso corporal. Rejeita negativos, valores não finitos e repetições/séries não inteiras. Séries prescritas: 1–100; repetições alvo: inteiro positivo ou intervalo crescente.
- Uma série guardada fica apenas para consulta: não existe política UPDATE/DELETE de `set_logs`. A gravação usa um UUID determinístico por sessão/exercício/número da série, evitando duplicações em repetições do mesmo pedido. Não se inventam políticas de edição. Valores ainda não guardados no formulário não sobrevivem ao recarregamento.
- Após recarregar, «Iniciar treino / Retomar» recupera a sessão em curso e os registos já guardados. Uma nova sessão só é criada quando não existe sessão inacabada desse treino. O histórico também permite retomar sessões em curso.
- «Concluir treino» exige todas as séries prescritas guardadas e confirma `finished_at` no servidor. Erros de gravação mantêm a sessão em curso, com mensagens e possibilidade de repetir o pedido.
- Histórico de sessões por data, incluindo sessões em curso/concluídas. Cada exercício mostra o último registo e até 10 registos recentes de sessões concluídas.
- PR simples: carga estritamente superior ao melhor registo anterior do mesmo `exercise_id`, comparando sessões por `started_at` e séries por `set_number`. Empates e primeiro registo não são PR. RIR/repetições não são usados para inventar recordes ou estimativas de 1RM. Exercícios com nomes iguais mas UUIDs diferentes têm históricos separados.
- RIR é a escala suportada pelo schema; não se converte RIR em RPE. Não existem políticas UPDATE para treinos/exercícios; esta versão implementa criação, sem edição desses registos.

## Regras de prescrição e séries flexíveis — v0.8

- A geração mensal usa Full Body A/B para 2 dias, Full Body A/B/C para 3, Upper/Lower repetido para 4, Upper/Lower mais Push/Pull/Legs para 5 e Push/Pull/Legs repetido para 6. Distribui o volume conforme experiência, objetivo e prioridades, procurando dois estímulos semanais por grupo muscular.
- Dentro de cada treino, a ordem prescrita é: compostos/multiarticulares, músculos grandes, isolamentos de músculos pequenos e abdominais.
- Cada treino gerado deve ter **8 a 12 exercícios**. O limite é aplicado no schema enviado ao gerador e verificado no servidor antes de guardar o rascunho. Planos já existentes não são reescritos por esta alteração.
- As séries prescritas são um objetivo. O aluno pode terminar com menos, todas ou mais séries. Séries extra usam as mesmas colunas de set_logs, mantêm numeração inteira e não alteram registos persistidos.
- «Terminar treino» confirma quando existem séries incompletas, guarda apenas rascunhos válidos e deixa a sessão concluída mesmo sem séries ou sem exercícios disponíveis. Falhas de RLS mantêm a sessão aberta para repetir.

## Dashboard do aluno — 27/09/2026

O ecrã inicial do aluno segue a referência visual fornecida: fundo claro, faixa escura, quatro cartões em duas colunas, Resumo do dia, sequência de próximos treinos e navegação inferior. O CSS é exclusivo deste ecrã; a área do treinador e os restantes módulos mantêm o aspeto anterior.

- **Água:** objetivo da meta nutricional visível, consumo diário e registos de 250 ml / 500 ml / 1 L em `hydration_logs`. A leitura inclui registos antigos de `water_logs` no dia local, sem duplicar UUIDs iguais. Não inventa um objetivo quando não existe meta.
- **Nutrição:** calorias e macros **planeados** nas refeições do dia de um plano aprovado; abre o módulo existente. Não apresenta estes valores como ingestão confirmada.
- **Plano de treino:** primeiro treino da sequência do plano ativo ou sessão por terminar. Iniciar/retomar usa o serviço de treinos existente. Os próximos treinos seguem a ordem do plano, sem datas ou durações inventadas.
- **Cardio:** minutos registados no dia e formulário de atividade/duração no próprio Dashboard, guardado na tabela `cardio_logs` existente.

O resumo apresenta água, kcal planeadas, treinos concluídos e minutos de cardio. Anamnese, avaliações, evolução e check-in continuam acessíveis em Mais acompanhamento. As gravações pertencem ao aluno autenticado; repetem o mesmo UUID após falha para evitar duplicados. Erros de leitura não são apresentados como zero e respostas de uma página abandonada não a reabrem.

Verificação: 153 testes automáticos aprovados, incluindo cinco novos testes de dados/permissões/repetição. `tests/browser-dashboard.cjs` testa login de treinador e aluno, navegação, registos, recarregamento, início/retoma, falha parcial e saída durante leitura a 390 e 1440 px. Usa perfis fictícios e pedidos Supabase intercetados: não foram criados registos de teste em contas reais. Não exige migração da base de dados.

## Nutrição — metas e editor semanal

- O contexto usa data de nascimento e sexo da anamnese; peso e altura vêm da avaliação mais recente com esse valor, ou da anamnese quando não existe avaliação. Avaliações futuras são ignoradas. A origem fica guardada em cada versão da meta. Os campos demográficos legados de `nutrition_profiles` não são usados nem expostos.
- O servidor calcula TMB, TDEE, calorias, macros e água com os dados atuais e valida os parâmetros enviados. Aceita vírgulas decimais, mantém a meta calculada quando o ajuste opcional está vazio e exige motivo para ajustes. Repetir um pedido cuja resposta se perdeu devolve o mesmo registo, sem duplicação.
- Preferências e triagem são guardadas com controlo de versão. Notas privadas ficam em `nutrition_trainer_notes`, acessíveis apenas ao treinador autor ainda associado. Não aparecem nos dados do aluno nem nos planos alimentares.
- A triagem lê booleans estruturados da anamnese e respostas explícitas sobre gravidez/amamentação, condição renal e perturbação alimentar. Respostas em falta não significam ausência de risco. Condições sinalizadas bloqueiam o cálculo automático e a aprovação no servidor, com o percurso específico de rascunho e revisão clínica para diabetes descrito abaixo. O cálculo automático está limitado a adultos.
- O editor permite adicionar/remover refeições e alimentos, indicar horário e notas para o aluno, copiar um dia para os restantes seis, guardar e retomar. Cada alimento inclui quantidade, unidade, nutrientes **para essa quantidade**, fonte e data de consulta. A app soma os valores introduzidos, sem voltar a multiplicá-los pela quantidade. Não existe verificação automática dos rótulos.
- Os totais diários são comparados com a meta. O percurso é `draft → pending_review → approved`. Revisão e aprovação exigem sete dias completos, alimentos em todas as refeições, nutrientes/fontes preenchidos e uma meta do mesmo aluno/treinador baseada no contexto atual. Os totais não têm de coincidir exatamente com a estimativa; cabe ao treinador rever as diferenças. Editar um plano em revisão devolve-o a rascunho. Um plano aprovado é imutável; uma alteração exige novo rascunho.
- As gravações são transações com autorização no servidor, associação ativa, bloqueios e controlo de revisão. Alunos só leem os próprios planos aprovados. Nenhuma tabela de Nutrição tem privilégios anónimos, e os perfis autenticados não podem fazer `TRUNCATE` nem alterações diretas aos planos.
- As migrações `20260921182042`, `20260921185157` e `20260921191124` constroem a base, corrigem integridade/permissões e otimizam a avaliação das políticas RLS. A publicação dos ficheiros JavaScript é separada da aplicação das migrações.

### Geração de alimentos — 26/09/2026

Criar plano semanal propõe por defeito alimentos para os sete dias. A alternativa manual continua disponível. Nos rascunhos existentes, usar **Editar plano → Gerar alimentos para os sete dias**. A proposta abre no editor e só persiste os alimentos ao carregar em **Guardar plano**; criar guarda primeiro a estrutura vazia, para permitir retoma. Regenerar pede confirmação antes de substituir conteúdo do editor. Não altera planos aprovados nem os disponibiliza automaticamente ao aluno.

O gerador local usa 20 alimentos de [CoFID 2021](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid), folha **1.3 Proximates**, valores por 100 g comestíveis, consultados em 26/09/2026. Mantém o código da fonte, preparação e data em cada alimento. Os 80 valores do catálogo foram comparados com o ficheiro oficial. Valores `Tr` são tratados como zero à precisão da fonte. Contém informação do setor público licenciada pela [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). Não envia informação pessoal a fornecedores de IA.

São suportadas 3–6 refeições e os padrões Variado, Vegetariano, Vegano e Pescetariano. Preferências e exclusões usam nomes do catálogo ou grupos reconhecidos, separados por vírgulas. Exclusões prevalecem sobre preferências; texto desconhecido bloqueia a geração em vez de ser ignorado. Triagem incompleta, alertas clínicos/alergias sem percurso suportado, menores, meta de outro treinador ou meta desatualizada também bloqueiam. As restrições não devem ser apagadas para contornar bloqueios. Casos não suportados mantêm o editor manual.

Ajusta porções dentro de limites definidos na aplicação e só propõe dias com desvio até 10% nas calorias e 20% em cada macro relativamente à meta. Estes limites servem para avaliar o ajuste matemático, não são recomendações clínicas nem garantem adequação nutricional completa. Mostra os totais para revisão. Não otimiza micronutrientes, não promete reproduzir marcas específicas e não gera dietas terapêuticas. Se não encontrar uma combinação, explica a limitação sem preencher parcialmente o plano. Alterar **Quantidade** recalcula os nutrientes dos alimentos cujo nome, unidade em gramas e fonte ainda correspondem ao catálogo; alimentos manuais exigem valores para a porção introduzida.

Verificação: 146 testes automáticos e percursos Chromium a 390 e 1440 px, incluindo geração, mudança de quantidade, gravação, recarregamento, regeneração e invisibilidade do rascunho para o aluno. Os testes usam dados fictícios numa base isolada.

### Diabetes: proposta e aprovação clínica

Quando diabetes é o único alerta clínico e a triagem está completa, o treinador pode registar o tipo, medicação, risco/episódios de hipoglicemia, rotina e orientação existente do profissional de saúde. A orientação inclui autor, data e horários/intervalos de hidratos para 3–6 refeições. Não são sugeridos limites clínicos por defeito nem alterações de medicação. Sem essa informação, a geração continua bloqueada. Outros alertas concomitantes mantêm o bloqueio.

As metas são estimativas provisórias. O gerador ajusta alimentos aos intervalos de hidratos de **cada** refeição e mantém os horários registados. Se o catálogo não permitir cumprir simultaneamente as metas e os intervalos, não devolve uma proposta parcial. O editor continua disponível para composição manual. O envio para revisão e a aprovação voltam a validar horários e hidratos no servidor, incluindo alimentos editados manualmente.

O professor (`trainer` ou `admin`) com associação ativa ao aluno pode rever e autorizar o plano, incluindo planos para diabetes. Não é necessária uma conta de nutricionista nem inscrição no registo adicional de revisores. Pode consultar e editar rascunhos desse aluno; as notas privadas de cada treinador continuam separadas. A aprovação exige confirmação e nota de revisão e guarda autor, papel da conta, data, revisão do plano e contexto clínico em registo privado de auditoria. Uma identificação profissional só é registada quando existe, sem atribuir ao professor o título de nutricionista. O plano aprovado permanece imutável. Metas provisórias e planos pendentes não são visíveis ao aluno; uma alteração posterior ao contexto clínico oculta o plano clínico desatualizado e exige um novo rascunho/revisão.

A migração `20260926213103_diabetes_clinical_review.sql` criou o percurso inicial; a migração posterior `teacher_nutrition_approval` permite a autorização pelo professor associado. A criação de um tipo de conta próprio para nutricionistas fica para uma alteração futura. O registo de medicação serve de contexto para o revisor humano, não de motor de interações medicamentosas. Permanecem as verificações dos dados, horários, hidratos e necessidade de confirmação explícita.

Validação deste percurso: 148 testes automáticos aprovados e testes completos no Chromium a 390 e 1440 px, com perfis fictícios de treinador, nutricionista e aluno. Inclui rejeição de horários incompatíveis, bloqueio da autoatribuição de permissões, separação entre alunos, aprovação por outro profissional e ocultação de planos clínicos desatualizados.

Referências do desenho do fluxo: [NIDDK — Healthy living with diabetes](https://www.niddk.nih.gov/health-information/diabetes/overview/healthy-living-with-diabetes) e [CDC — Diabetes meal planning](https://www.cdc.gov/diabetes/healthy-eating/diabetes-meal-planning.html). A adequação clínica depende da revisão profissional e não é garantida pelo ajuste matemático do gerador.

### Testes de Nutrição

```sh
npm ci --prefix tests --ignore-scripts
node --test tests/*.test.cjs
COACH_PLAYWRIGHT=/caminho/para/node_modules/playwright node tests/browser-nutrition.cjs
```

`tests/package-lock.json` fixa PGlite 0.5.8. `COACH_PGLITE` permite indicar outra instalação desta versão. PGlite executa as migrações e políticas reais num PostgreSQL isolado, com perfis fictícios. O teste de navegador usa o SDK Supabase e executa as operações contra essa base isolada, em 390 e 1440 px. Inclui perda de resposta após gravação, repetição sem duplicados, edição, recarregamento, revisão/aprovação, notas privadas, XSS e navegação durante pedidos pendentes. Não escreve dados de teste no Supabase real.

Validação de 21/09/2026: 142 testes automáticos aprovados e dois percursos completos de Nutrição no Chromium. Testar num navegador de secretária com largura de telemóvel não equivale a testar Safari num iPhone físico.

## Validação da v0.7

- **66 testes automáticos aprovados** (44 existentes + 22 novos). Cobrem plano/treino/exercício/sessão/séries, validações, autorização, associação desativada, leitura de dados próprios, conclusão, erros, repetição de gravações, retoma e PR.
- **4 cenários completos no Chromium**: avaliações e treinos, ambos a 390 e 1440 px. O fluxo de treinos cobre treinador → Maria → plano → treino → exercício; aluno → iniciar → guardar → recarregar/retomar → concluir → segundo treino com carga anterior/PR → histórico após recarregar. Inclui erros RLS, números negativos e associação inativa. Sem erros JavaScript nem overflow horizontal. CSS comparado com a v0.6, sem alterações.
- Os testes de navegador usam o SDK real com Auth/REST simulados. Nenhuma medição, plano ou carga de teste foi enviado ao projeto Supabase real. A persistência foi validada no servidor simulado entre recarregamentos, não numa conta real da Maria. Testes em largura mobile não equivalem a teste num iPhone físico/Safari.
- Todas as colunas das cinco tabelas foram aceites por SELECT explícito com `limit=0` e Publishable Key (HTTP 200). A aplicação das novas colunas e políticas restritivas foi confirmada pelo proprietário. Não houve alterações de SQL/RLS por esta implementação.

Para testar no projeto real, iniciar sessão com contas autorizadas de treinador/aluno e usar apenas planos e cargas reais ou dados de teste expressamente autorizados. Não partilhar passwords, tokens ou chaves secretas. O commit da v0.7 é local; publicar requer push separado.


## Anamnese — integração adicional à v0.8

O aluno preenche e atualiza a sua anamnese em 12 etapas, guardadas ao navegar, com retoma de rascunho e conclusão. O treinador consulta o resumo e as respostas do aluno associado, e guarda as suas próprias observações numa tabela separada. As tabelas já existentes são usadas sem migrações.

A versão visível mantém-se v0.8; sugere-se v0.9 para uma publicação futura deste módulo. Ver [relatório da Anamnese](ANAMNESIS-REVIEW.md) para JSON, permissões, alertas não diagnósticos, limitações e teste manual com Tiago/Maria.

Testes novos: `node --test tests/anamnesis.test.cjs` e `node tests/browser-anamnesis.cjs` (Playwright, Chromium e variável `COACH_PLAYWRIGHT` quando instalado fora do projeto). A suite anterior deve continuar a passar integralmente.

A validação numérica da Anamnese aceita unidades humanas inequívocas (`58 kg`, `5 horas`, `4 vezes/semana`, `2,5 L`, `5/10`) e guarda números normalizados. Texto ambíguo continua a ser rejeitado com indicação específica, sem apagar o valor escrito.

## Cinco ecrãs do aluno — atualização de 27/09/2026

O início, Água, Nutrição, Plano de Treino e Cardio têm páginas próprias com o estilo da referência: fundo creme, fotografia, cartões e navegação inferior. A ficha acessível pelo treinador também abre este painel em consulta; as ferramentas de gestão continuam disponíveis em Mais e em Ver plano. O consumo privado de hidratação só aparece na conta do aluno, sem representar dados inacessíveis como zero. As fotografias são ilustrativas e os alimentos, quantidades, metas e registos vêm dos dados existentes. Não são inventados objetivos de cardio ou datas de treino.

Verificação: testes automáticos e percursos de treinador/aluno isolados em 390 e 1440 px, incluindo abertura direta do index.html local, registos de água/cardio, navegação pelos cinco ecrãs e início/retoma de treino. Nenhum registo de teste é enviado à base de produção.

## Catálogo alimentar USDA e rótulos — 27/09/2026

No editor de cada refeição, «Procurar alimento no catálogo» pesquisa 8 104 alimentos dos ficheiros oficiais USDA Foundation (abril 2026) e SR Legacy (abril 2018). Os nomes originais e a preparação são preservados; termos comuns em português são traduzidos apenas para pesquisa. A escolha é explícita: não se substitui automaticamente arroz cru por cozinhado nem uma marca por outra. Foundation tem prioridade sobre SR Legacy. Foram excluídas 52 entradas sem energia/macros completos; ausência não se converte em zero.

Os valores publicados por 100 g de parte comestível são escalados pela quantidade, conservando URL específica, FDC ID, versão e data de consulta. Usa-se energia publicada em kcal (1008; na ausência, 2048/2047), sem recalcular kcal a partir dos macros. Os hidratos USDA são totais por diferença e incluem fibra; isto é indicado na escolha e na versão guardada. Não se convertem silenciosamente para hidratos disponíveis das tabelas europeias.

«Adicionar produto pelo rótulo» pede marca/produto, data e quatro valores por 100 g. O estado guardado inclui a base por 100 g na versão da fonte, permitindo recalcular quantidades após reabrir o plano. Não se convertem ml em gramas. Editar nutrientes manualmente desliga a associação para recálculo automático.

**PortFIR ainda não importado:** o endereço oficial apresenta certificado expirado nesta verificação. Não foi desativada a validação TLS nem inventados valores portugueses. Para completar a prioridade PortFIR, é necessário obter o Excel oficial da versão 7.1, confirmar os campos/condições de reutilização e importar os dados com a identificação original. A geração automática continua a usar o catálogo CoFID existente; esta alteração acrescenta pesquisa/seleção e rótulos ao editor, sem substituir planos já guardados.

Os dados USDA são CC0: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central. https://fdc.nal.usda.gov/ . O importador reproduzível está em `scripts/import-usda.py`, com URLs oficiais, hashes das transferências e exclusões em `scripts/usda-import-manifest.json`. Os ZIPs originais ficam em `work/` (ignorado pelo Git); não são necessárias chaves API no navegador. Os ficheiros publicados são `food-catalog-data.js` e `food-catalog.js`. Testes cobrem fontes, quantidades, pesquisa, rótulos, gravação e reabertura em PostgreSQL isolado; não há migrações nem alterações aos dados de produção.


## Ecrã inicial do treinador — 27/09/2026

O painel responsivo do treinador/admin usa `trainer-dashboard.js` e `trainer-dashboard.css`, carregados em `index.html` e integrados em `app.js`. Reutiliza `suru-fitness.png`. A saudação usa o primeiro nome do perfil autenticado. Os atalhos de treinos, nutrição e progresso abrem a seleção de um aluno associado e depois o módulo existente; não criam dados ao clicar.

As quatro métricas mostram associações ativas, planos de treino ativos dentro da validade, sessões iniciadas no dia local e avaliações desde o início do mês até hoje. As consultas são paginadas e limitadas aos IDs associados já carregados pela sessão; as políticas RLS continuam a controlar o acesso. Falhas parciais mostram «Indisponível», nunca um zero inventado. Respostas de um ecrã ou sessão anterior são descartadas.

«Alunos recentes» ordena os alunos pela atividade disponível (avaliações deste mês e sessões de hoje); os restantes aparecem por nome, sem inventar datas de associação. «Calendário de hoje» mostra sessões reais e respetivo estado, não compromissos futuros: ainda não existe uma agenda de marcações integrada.

Verificação local: `node --test tests/*.test.cjs`, `node tests/browser-trainer.cjs` e `node tests/browser-dashboard.cjs`. O teste do treinador usa os fixtures existentes, com chamadas remotas intercetadas; cobre atalhos, dados, ausência de alunos, falhas parciais, logout durante leitura e larguras 320/390/768/1440 px, incluindo abertura por ficheiro. `COACH_OUTPUT` permite escolher a pasta das capturas. Não requer migração, publicação ou alteração da autenticação.


### Continuidade visual: alunos, treinos e nutrição

A mesma sidebar e identidade visual acompanham agora a seleção de alunos e os módulos do treinador. A lista permite pesquisar por nome (sem distinguir acentos/maiúsculas), mostra o número de resultados e dá acesso direto aos treinos, nutrição e progresso de cada aluno associado.

O módulo de treinos organiza planos e treinos em cartões, com os formulários ao lado em ecrãs largos e abaixo em telemóvel. Nutrição mostra energia e macronutrientes em cartões, preferências e metas em secções expansíveis, planos semanais e editor com a mesma linguagem visual. Cálculos, dados, permissões, gravações, revisões e aprovações mantêm os serviços existentes.

A navegação da sidebar respeita a confirmação já existente para descartar edições nutricionais e não sai durante uma gravação desse módulo. O módulo de treinos também impede esta navegação durante gravações. Não são criados alunos, medições, planos ou refeições pelo novo layout.

Verificação adicional: navegador do treinador com pesquisa e atalhos a 320/390/768/1440 px; fluxo completo de treinos a 390/1440 px; nutrição com PostgreSQL isolado a 390/1440 px, incluindo cálculo, edição, aprovação, acesso do aluno, catálogo, cancelamento da saída pela sidebar e ausência de transbordo horizontal. Sem escrita de teste na base real, deploy ou commits.
