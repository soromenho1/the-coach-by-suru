# The Coach by Suru v0.8 — revisão local

A base v0.7 estava concluída no commit `b656e55`. Os 66 testes existentes e os quatro fluxos de navegador (avaliações/treinos, 390/1440 px) foram repetidos com sucesso. A v0.8 acrescenta um ciclo mensal privado para o treinador sem mudar o CSS original.

## Utilização

Treinador → Aluno → Plano de treino → **Planos mensais · rever e aprovar**.

1. Guardar objetivo, experiência, dias por semana, limitações/lesões e feedback disponível. Escrever «Sem limitações conhecidas» quando aplicável: ausência de informação não é interpretada como ausência de limitações.
2. A geração automática começa no dia 25 para o mês seguinte; também existe geração a pedido. Usa o plano ativo mais recente, exercícios, sessões/cargas dos últimos 90 dias e até 12 avaliações recentes, além dos dados do treinador.
3. Rever o rascunho, editar nome/objetivo/treinos/exercícios, adicionar/remover itens ou substituir por um plano criado do zero. Guardar antes de aprovar.
4. Aprovar: no mês futuro fica privado como `approved`; no mês devido a publicação é atómica e passa a `active`. O aluno vê apenas o plano mensal normal. As justificações internas e a origem não são copiadas para as tabelas públicas de treino.

## Implementação e segurança

- `monthly-plans.js`: acesso do treinador, leituras e chamadas às RPCs/Edge Function, com verificação da sessão antes de gravar.
- `monthly-ui.js`: formulários e revisão no visual existente, campos preservados em falhas, revisão otimista e aprovação explícita.
- `workout-ui.js`, `index.html`, `app.js`: entrada para a área mensal, scripts e versão v0.8.
- `supabase/functions/monthly-plans/core.mjs`: geração com Responses API, `store:false`, JSON Schema, validação de números/estrutura/continuidade e bloqueio de referências ao gerador no conteúdo do aluno.
- `handler.mjs` e `index.ts`: verificação do JWT com Supabase Auth ou secret do scheduler, autorização por associação, leitura apenas de colunas existentes, contexto limitado, tratamento de falhas e conclusão da reserva de trabalho.
- Duas migrações SQL: RLS privado, validação também no servidor, revisão para evitar sobrescritas, publicação numa transação e registo de geração/aprovação sem cópia dos dados clínicos.
- `monthly_scheduler.sql`: uma reserva por chamada, de minuto a minuto entre os dias 25–31; até três tentativas por treinador/aluno/mês, com intervalo mínimo de dez minutos. Publicação verificada a cada minuto, com data em `Europe/Lisbon`. Uma reserva abandonada pode ser retomada; o token impede conclusões de tentativas antigas.
- Nenhum segredo é incluído no frontend. O browser continua a usar a Publishable Key existente. A credencial de serviço é usada apenas pela Edge Function. Nenhuma escrita foi feita no Supabase remoto.

## Instalação posterior à revisão

Esta entrega não instala a v0.8 no projeto remoto. Antes da instalação, rever as migrações face ao DDL completo, triggers e políticas atuais; a verificação remota desta tarefa foi apenas SELECT de colunas com zero registos.

1. Aplicar, pela ordem dos nomes, as duas migrações SQL num ambiente de staging autorizado que já tenha a base v0.7.
2. Configurar secrets da Edge Function: `OPENAI_API_KEY`, `OPENAI_MODEL` (modelo da conta que suporte Responses/Structured Outputs), `MONTHLY_SCHEDULER_SECRET` (aleatório, pelo menos 32 bytes) e `COACH_APP_ORIGIN` (origem exata, sem caminho/barra final). `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizados pelo Supabase. Não colocar estes valores em Git.
3. Instalar a Edge Function `monthly-plans`. `verify_jwt=false` é intencional: o handler valida utilizadores via Auth e aceita separadamente o secret de backend. Não remover estas verificações.
4. Ativar `pg_cron` e `pg_net`; configurar no Vault `coach_project_url` e `coach_scheduler_secret` (o mesmo valor do secret da função). Rever/executar o SQL separado do scheduler.
5. Preencher os dados dos alunos; testar com contas/dados de staging autorizados. Só depois publicar o frontend. Se o backend não estiver instalado, a área mensal apresenta indisponibilidade; a v0.7 continua operacional.

## Testes

Resultado final em 20/09/2026: **81 testes automáticos aprovados** (66 existentes, 13 de geração/serviço/endpoint e 2 suites de PostgreSQL). **6 cenários de navegador aprovados**: avaliações, treinos e planos mensais a 390 e 1440 px. Sem erros JavaScript nem overflow horizontal. Inspeção visual do editor mobile concluída. `git diff --check` sem erros.

```sh
node --test tests/*.test.cjs
# Dependências apenas de teste: @electric-sql/pglite e playwright.
node --test tests/monthly-db.cjs
node tests/browser-monthly.cjs
node tests/browser-workouts.cjs
node tests/browser-assessments.cjs
```

Se as dependências estiverem fora do projeto, definir `COACH_PGLITE` e `COACH_PLAYWRIGHT` com os respetivos caminhos absolutos. Instalar Chromium compatível com a versão do Playwright e com o sistema operativo. Nesta tarefa: Node 22.16.0, PGlite 0.5.8 e Playwright 1.51.1 num diretório de ferramentas isolado, sem dependências de produção adicionadas à app.

Cobertura: geração e contexto; recusas/JSON inválido/indisponibilidade do fornecedor; autenticação do endpoint; secret incorreto; associação inativa; edição e criação manual; aprovação repetida; revisão desatualizada; RLS real em PostgreSQL; aluno e outro treinador sem acesso; tentativa direta de alterar tabelas privadas; falha de escrita com rollback; reservas, repetição, atraso e tokens antigos; publicação só no mês devido; persistência ao fechar e reabrir o armazenamento local; navegador mobile/desktop, recarregamento, falha com campos preservados e ausência de overflow.

## Limitações concretas

- O modelo real, o runtime Supabase Edge, o Vault e o cron remoto não foram executados. A geração é testada com respostas simuladas; o SQL é executado em PostgreSQL local. A qualidade dos planos reais precisa de revisão do treinador e validação em staging após configurar o modelo.
- O schema confirmado não inclui anamnese estruturada nem check-ins autónomos. O novo formulário recolhe experiência, disponibilidade, limitações e feedback; não inventa fontes existentes. Sem os campos essenciais, não gera. Depois de três falhas, o treinador pode criar manualmente; um operador pode investigar e reabrir uma tentativa no backend.
- A adesão enviada é o número de sessões iniciadas/concluídas no período. Não se inventa uma percentagem face a sessões agendadas, porque não existe agendamento na v0.7.
- Os exercícios são preservados semanticamente e o rascunho mantém a referência interna ao exercício anterior. Cada novo plano recebe novos UUIDs nas tabelas v0.7; o histórico geral conserva as cargas anteriores, mas o cartão de PR da v0.7 continua limitado ao UUID de cada exercício, sem agregação entre planos.
- Um rascunho por treinador/aluno/mês. Se mais de um treinador estiver associado, cada um vê apenas os seus rascunhos; a última publicação desse mês passa a ser o plano ativo do aluno.
- Planos aprovados ficam imutáveis nesta fase. A edição faz-se antes de aprovar. O plano ativo anterior não expira automaticamente só porque mudou o mês; mantém-se até uma substituição aprovada, salvo datas/estado definidos pelo treinador na v0.7.
- O scheduler processa um aluno por chamada, com contexto de no máximo 180 mil caracteres. Históricos acima desse limite falham de forma explícita; não se cortam silenciosamente limitações ou cargas. Cron/Vault e limites operacionais devem ser observados em staging antes de aumentar a escala.

Referências de implementação: [Structured Outputs da OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs) e [agendamento de Edge Functions do Supabase](https://supabase.com/docs/guides/functions/schedule-functions).
