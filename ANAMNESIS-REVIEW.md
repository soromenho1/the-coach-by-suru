# Anamnese — revisão local

## Estado inicial e âmbito

O trabalho começou com working tree limpo e HEAD em `42d8827`. Esse commit mantém-se na história. A implementação é aditiva: dois módulos de JavaScript e uma entrada no router já existente. Não foram alterados serviços de treinos, séries, sessões, PRs, avaliações ou geração mensal; não se acrescentaram frameworks ou dependências de produção.

A versão visível continua **v0.8**, preservando a identificação atual. Sugestão para a próxima publicação: **v0.9**, por acrescentar um módulo funcional completo. Nenhum número de versão foi alterado sem aprovação de uma publicação.

## Ficheiros

Criados:

- `anamnesis.js`: definição das 12 secções, normalização condicional, validação, resumo, alertas e serviço Supabase.
- `anamnesis-ui.js`: formulário por etapas, retoma, consulta completa, dashboard do treinador e observações separadas.
- `tests/anamnesis-fixture.cjs`: backend isolado com identidades, associações e simulação das permissões comunicadas.
- `tests/anamnesis.test.cjs`: testes do serviço, validação e permissões.
- `tests/browser-anamnesis.cjs`: testes da aplicação real e SDK Supabase, com Auth/REST interceptados; nenhum dado de teste chega à base real.
- `ANAMNESIS-REVIEW.md`: relatório e teste manual.

Alterados:

- `app.js`: apenas integração do módulo no botão de Anamnese e passagem do contexto autenticado.
- `index.html`: carregamento dos dois scripts depois do serviço partilhado de avaliações.
- `tests/app.test.cjs`: o ambiente de teste passa a disponibilizar o novo mount; o teste de navegação existente mantém as suas verificações.
- `tests/browser-assessments.cjs` e `tests/browser-workouts.cjs`: os servidores locais de teste passam a servir os dois scripts novos. Nenhum cenário ou asserção anterior foi removido.
- `SCHEMA.md` e `README.md`: documentação das tabelas, JSON, permissões e funcionamento.

## Tabelas e verificação de schema

A Data API remota aceitou, em 20/09/2026, um SELECT explícito de todas as colunas indicadas em `anamneses` e `anamnesis_trainer_notes`, com `limit=0` (HTTP 200). A consulta não leu respostas, observações nem outros registos pessoais.

Não se encontrou divergência nos nomes das tabelas/colunas. Tipos, unicidades, defaults e políticas completas não são demonstrados por essa consulta; as unicidades e permissões usadas são as fornecidas pelo proprietário no pedido. Não foram executados DDL, migrações, alterações de RLS ou gravações remotas. **Não é necessário SQL novo para esta implementação.**

A aplicação usa apenas as colunas comunicadas, envia UUIDs próprios e datas de criação/atualização nas escritas, e aceita as datas devolvidas pelo servidor. `completed_at` regista a conclusão mais recente; volta a `NULL` quando se guarda uma edição como rascunho. Se existir um trigger de timestamps, prevalece o valor devolvido pelo servidor. Sem esse trigger, os timestamps escritos são do relógio do cliente; não são um registo de auditoria inviolável.

## Estrutura de `answers`

```json
{
  "_meta": {"version": 1, "currentStep": 4, "saveId": "UUID da gravação"},
  "personal": {"birthDate": "1990-01-01", "sex": "Feminino", "occupation": "Exemplo", "height": 170, "weight": 70},
  "goals": {"primary": "Ganhar massa muscular", "secondary": ["Melhorar condição física"], "goalWeight": false, "hasDeadline": false, "importance": 8, "reason": "Exemplo"},
  "training": {"current": false, "previous": false, "level": "Iniciante", "hadTrainer": false, "sport": false},
  "health": {"cardiovascular": false, "hypertension": false, "diabetes": false, "respiratory": false, "otherCondition": false, "medication": false, "medicalRestriction": false, "symptoms": ["Nenhuma das anteriores"]},
  "limitations": {"currentPain": false, "previousInjury": false, "surgery": false},
  "activity": {"level": "Moderadamente ativa", "work": "Misto", "sittingHours": 5, "knowsSteps": false},
  "recovery": {"sleepHours": 8, "sleepQuality": 7, "stress": 3, "refreshed": "Frequentemente"},
  "nutrition": {"quality": 7, "meals": 4, "plan": false, "nutritionist": false, "allergies": false, "water": 2, "alcohol": "Ocasionalmente", "tobacco": "Não", "supplements": false},
  "availability": {"frequency": 3, "days": ["SEG", "QUA", "SEX"], "duration": "60 min", "time": "Tarde", "locations": ["Ginásio"], "unavailable": false, "irregular": false},
  "preferences": {"types": ["Musculação"], "likes": "Exemplo", "dislikes": "Exemplo", "refuses": "Exemplo"},
  "motivation": {"difficulty": "Falta de tempo", "attempts": 2, "consistency": "Exemplo", "confidence": 7},
  "relationship": {"expectations": "Exemplo", "style": "Exigente mas equilibrado", "response": "Tente perceber a razão e ajuste", "additional": "Exemplo"}
}
```

`currentStep` vai de 0 a 11. `saveId` permite reconhecer a repetição de uma gravação cuja resposta se perdeu. Não se guardam cópias da anamnese em localStorage/sessionStorage. Os nomes dos campos e todas as opções estão definidos em `CoachAnamnesis.sections`.

Campos condicionais só existem quando aplicáveis:

- Objetivo: `targetWeight`, `deadline`, `other`.
- Treino atual: `duration`, `frequency`, `sessionMinutes`, `type`; treino anterior: `previous`, `stoppedWhen`, `stoppedWhy`; desporto: `sportName`, `sportFrequency`, `sportPurpose`, `sportDays`.
- Saúde: cada Sim permite `<nomeDoCampo>Details`.
- `limitations.pains[]`: `zone`, `otherZone`, `side`, `intensity`, `duration`, `aggravating`, `assessed`, `diagnosis`, `diagnosisDetails`, `avoid`, `avoidDetails`.
- `limitations.injuries[]`: `zone`, `otherZone`, `type`, `year`, `treatment`, `recovered`, `limitations`.
- `limitations.surgeries[]`: `name`, `when`, `limited`, `limitations`.
- Atividade: `steps`; alimentação: `allergyDetails`, `supplementList[]` com `name`/`dose`.
- Disponibilidade: `equipment`, `unavailableDetails`, `irregularDetails`; preferências: `otherType`; motivação: `otherDifficulty`.

Mudar Sim para Não, remover Casa ou mudar de ramo de treino elimina os valores que deixaram de ser aplicáveis, incluindo dentro das listas. As listas admitem até 20 entradas. Textos de resposta têm até 4000 caracteres; notas do treinador, 12000. Estes são limites de produto, não limites clínicos.

JSON existente não vazio sem `_meta.version = 1`, ou com versão diferente, não é sobrescrito: a UI informa que precisa de revisão de compatibilidade. Não se tentou converter formatos desconhecidos.

## Comportamento do aluno

- Sem linha: POR PREENCHER; com `draft`: EM PREENCHIMENTO; com `completed`: CONCLUÍDA. Mostra a última atualização.
- 12 etapas, nome da secção, progresso, Anterior, Seguinte e Guardar e sair. O botão de conclusão está na última etapa.
- Anterior/Seguinte guardam as respostas e a etapa de destino antes de navegar. Guardar e sair só sai após confirmação do servidor. Falhas mantêm os campos no ecrã.
- Campos com `*` são obrigatórios apenas para concluir; rascunhos incompletos são permitidos. Datas, escalas, números, listas e coerência entre frequência/dias são validados. Aceita vírgula ou ponto decimal.
- Pode consultar todas as secções e editar depois de concluir. A primeira gravação da edição regressa a `draft`; ao concluir novamente, atualiza `completed_at`. A UI explica esta transição.
- Textos ainda não guardados têm aviso de saída/recarregamento do navegador enquanto houver alterações. Fecho forçado do browser/dispositivo pode perder alterações ainda não guardadas; não há autosave por tecla.
- O nome do profile é apenas apresentado; a anamnese não atualiza o profile nem avaliações físicas.

## Comportamento do treinador

- Só alunos com associação ativa. A página mostra estado, objetivo, peso/meta, experiência, disponibilidade, recuperação, dores/limitações e aderência.
- “Ver anamnese completa” abre a consulta organizada nas 12 secções. Não existem inputs editáveis das respostas para o treinador.
- “Observações do treinador” permite criar/editar apenas a sua linha em `anamnesis_trainer_notes`. `trainer_id` é a identidade autenticada e nunca é guardado em `answers`.
- A área de observações também existe se o aluno ainda não iniciou a anamnese. O aluno não consulta esta tabela neste módulo.

## Alertas de atenção, não diagnósticos

- **Vermelho — Rever antes de treino intenso:** declaração de restrição médica ao exercício ou qualquer sintoma de esforço selecionado, excluindo “Nenhuma”. Exibe exatamente a declaração que originou o alerta. Não afirma que existe uma doença.
- **Amarelo — Atenção:** condições de saúde/medicação declaradas, dor atual, lesão com recuperação incompleta/limitação, cirurgia com limitação, ou respostas incompletas.
- Regras internas de **UX/coaching**, não thresholds médicos: qualidade do sono ≤3/10 ou stress ≥8/10 geram atenção amarela, com o valor declarado e explicação.
- **Verde — Sem alertas relevantes:** apenas quando a anamnese está concluída, os campos necessários são válidos e não há sinalizações pelas regras acima. Não significa autorização médica ou ausência garantida de risco.
- “Nenhuma” é exclusiva no formulário: a última escolha desmarca a alternativa incompatível. Se um JSON recebido contiver simultaneamente sintomas e “Nenhuma”, a normalização conserva os sintomas e remove “Nenhuma”, evitando esconder uma declaração relevante.
- Nenhum alerta bloqueia a aplicação, prescreve tratamento ou toma uma decisão médica.

## Segurança, concorrência e limites

Cada operação verifica o utilizador com Supabase Auth, confirma o role no próprio profile e reutiliza o helper existente de associação. O aluno só pode escrever quando `student_id` é a sua identidade autenticada. O treinador é recusado pelo serviço em escritas de respostas, mesmo que tente invocá-lo sem o formulário. As RLS existentes continuam a ser a autoridade no servidor.

INSERT usa o UUID do formulário e UNIQUE existente; UPDATE limita-se ao aluno/treinador correto e ao `updated_at` que foi lido. Uma edição concorrente não é sobrescrita: apresenta conflito e preserva o conteúdo no ecrã. Para resolver, conservar o texto necessário e voltar a carregar a versão do servidor. Não existe resolução automática de conflitos.

Todo o texto introduzido pelo utilizador é escapado na apresentação, incluindo resumo, alertas, listas e observações. Mensagens de falha não imprimem respostas médicas nem erros brutos do backend. Nenhuma RLS foi alterada ou enfraquecida; nenhum secret foi adicionado ao frontend; a Publishable Key existente não mudou.

A geração mensal de `42d8827` não foi alterada nem passou a transmitir estas novas respostas a serviços externos. Uma integração futura exige trabalho separado.

Os testes novos simulam as políticas fornecidas pelo proprietário e interceptam o backend. Não auditam as RLS remotas com sessões reais de Tiago/Maria. É necessária a verificação manual abaixo com as contas autorizadas antes de publicação.

## Teste manual com Maria e Tiago

1. Abrir um terminal no projeto local e executar `python3 -m http.server 8000 --bind 127.0.0.1`. Abrir `http://localhost:8000`. Não abrir o HTML diretamente como ficheiro.
2. Entrar com as credenciais habituais da **Maria**, cujo profile deve ter role `student`. Não foram criadas nem alteradas passwords nesta tarefa.
3. Abrir **🩺 Anamnese — Saúde, histórico e objetivos**. Se ainda não houver registo, confirmar “Anamnese por preencher” e premir **Começar anamnese**.
4. Preencher as duas primeiras etapas com respostas reais ou dados expressamente autorizados. Selecionar peso objetivo Sim, preencher, mudar para Não e confirmar que o campo desaparece. Premir **Seguinte** e **Guardar e sair**.
5. Recarregar a página, voltar a Anamnese → **Continuar anamnese**. Confirmar a etapa guardada e os valores já preenchidos; usar Anterior e Seguinte.
6. Em Saúde, testar as condições apenas com respostas verdadeiras. Confirmar que “Nenhuma das anteriores” é exclusiva. Se houver dores/lesões/suplementos a declarar, adicionar mais de um item. Não introduzir diagnósticos fictícios no perfil real.
7. Completar as 12 etapas; premir **Concluir anamnese**. Confirmar estado concluído, data de atualização, resumo e **Ver anamnese completa**.
8. Premir **Editar anamnese**, atualizar uma resposta e guardar. Confirmar que fica em preenchimento, retomar e concluir novamente. Verificar persistência após recarregar.
9. Terminar sessão. Entrar com a conta habitual do **Tiago**, cujo profile deve ter role `trainer`/`admin` e associação ativa à Maria.
10. **Gerir alunos → Maria → Anamnese**. Confirmar resumo, alertas explicados, consulta completa e ausência de formulário para alterar respostas.
11. Em **Observações do treinador**, escrever uma observação real/autorizada e premir **Guardar observações**. Atualizá-la, guardar e voltar ao perfil/Anamnese para confirmar persistência. As respostas da Maria devem manter-se iguais.
12. Voltar à conta Maria e confirmar que as respostas continuam iguais e que não existe área de observações do treinador. Confirmar também avaliações, evolução, planos, histórico e treino habitual.
13. Testes de revogação de associação/RLS devem usar contas e relações de teste autorizadas num ambiente de teste. Não alterar a associação real Tiago–Maria apenas para esse teste.

Os botões Guardar destes testes manuais gravam nas duas tabelas existentes da conta usada. Nesta implementação, nenhum destes testes foi executado contra contas reais.


## Resultado dos testes e regressão

Baseline antes de alterações: **81/81 testes automáticos**, **6/6 cenários de navegador**. Resultado final: **104/104 testes automáticos aprovados, 0 falhados, 0 ignorados**; **8/8 cenários de navegador aprovados, 0 falhados**, com as duas larguras 390 e 1440 px.

Os **23 testes novos** verificam ausência de registo; criação do primeiro draft; 12 etapas e cursor; validação de conclusão; completed_at e edição posterior; limpeza de todas as dependências condicionais; treino atual/anterior e equipamento; listas múltiplas e detalhes internos; exclusividade de sintomas; números/datas/escalas/limites; consulta do treinador e proibição de alterar respostas; criação/edição de observações; aluno alheio e notas privadas; associação inativa; Auth/profile adulterado; falha de backend; mudança de sessão durante pedido; edição concorrente; resposta perdida; JSON desconhecido; resumo; e alertas vermelhos/amarelos/verdes.

Os **2 cenários novos de navegador** percorrem a aplicação real em mobile/desktop: login da aluna, 12 etapas, erro simulado de gravação com campos preservados, guardado/retoma/recarregamento, Anterior/Seguinte, condições e listas, conclusão, consulta completa, edição posterior, troca para treinador, respostas não editáveis, criação/edição de notas, associação revogada e escape de conteúdo XSS. Não houve erros JavaScript nem overflow horizontal na execução final. O formulário e o resumo mobile foram também inspecionados visualmente.

Os **6 cenários anteriores** continuam aprovados: avaliações, treinos e planos mensais, cada um em mobile/desktop. O código de `supabase/`, `workouts.js`, `workout-ui.js`, `assessments.js`, `monthly-plans.js` e `monthly-ui.js` permanece idêntico ao commit `42d8827`. O CSS original e a Publishable Key também estão inalterados. `git diff --check` sem erros.

Problemas encontrados e resolvidos durante a implementação: diretiva strict incompatível com parâmetros desestruturados no novo módulo visual; mensagem de sucesso anterior mantida durante uma nova gravação de notas; e sincronização de um teste que recarregava a página antes de Guardar e sair terminar. Nenhum teste existente foi removido. Não ficaram falhas conhecidas na suite; mantêm-se as limitações de validação remota e timestamps descritas acima.

## Entrega

Novo commit local separado, com mensagem `feat: add student anamnesis module`, mantendo `42d8827` como antecessor. Não houve squash, push, deploy, alteração da base remota, instalação de migrações ou enfraquecimento de RLS. Nenhuma chave secreta foi adicionada ao frontend.

## Correção de UX/validação numérica

Os campos numéricos aceitam agora o número sozinho ou unidades inequívocas relacionadas com a pergunta. A normalização ocorre na validação/armazenamento, não altera campos de texto e mantém os limites existentes.

Aceites incluem:

- altura/peso/meta: `175 cm`, `58 kg`;
- horas/duração: `5h`, `5 horas`, `5 horas/dia`, `60 min`;
- frequências: `4x`, `4 vezes`, `4x/semana`, `4 vezes por semana`;
- passos/refeições: `8000 passos`, `4 vezes`;
- água: `2 L`, `2 litros`, `2,5 L`, `2.5L`;
- escalas de dor, sono, stress, qualidade e confiança: `5/10`, `8/10`.

A interpretação é deliberadamente estrita: texto ambíguo como `aproximadamente 5`, `5 horas e meia`, `cinco horas` ou `5kg extra` continua a pedir correção. Valores fora dos limites, como `15/10`, continuam inválidos. O valor original permanece no campo após o erro; a validação acontece ao avançar/guardar.

Foram auditados os campos numéricos dos 12 passos: altura, peso, peso objetivo, frequência/duração de treino, frequência de desporto, intensidade de dor, ano de lesão, atividade sedentária/passos, sono, escalas, refeições, água, disponibilidade, tentativas e confiança. Datas, escolhas, multi-seleções, listas e texto não foram convertidos.
