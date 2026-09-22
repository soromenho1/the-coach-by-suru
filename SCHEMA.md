# Schema confirmado para a v0.6

Confirmado pelo proprietário em 19/09/2026 e validado por SELECT explícito de todas as colunas com `limit=0` na Data API (HTTP 200). A consulta sem registos não verifica políticas autenticadas, constraints ou defaults; estes foram confirmados pelo proprietário.

| Coluna em public.assessments | Tipo | Utilização |
| --- | --- | --- |
| id | uuid | Identificador; default gen_random_uuid(); enviado UUID estável por formulário para repetir pedidos sem duplicação |
| student_id | uuid | Aluno selecionado; obrigatório |
| assessment_date | date | Data da avaliação; default CURRENT_DATE |
| weight | numeric | Peso em kg |
| height | numeric | Altura em cm |
| body_fat | numeric | Gordura corporal em % |
| muscle_mass | numeric | Massa muscular em kg; não é reinterpretada como massa magra |
| chest | numeric | Peito em cm |
| waist | numeric | Cintura em cm |
| abdomen | numeric | Abdómen em cm |
| hips | numeric | Anca/quadril em cm |
| left_arm | numeric | Braço esquerdo em cm |
| right_arm | numeric | Braço direito em cm |
| left_thigh | numeric | Coxa esquerda em cm |
| right_thigh | numeric | Coxa direita em cm |
| left_calf | numeric | Gémeo/panturrilha esquerdo em cm |
| right_calf | numeric | Gémeo/panturrilha direito em cm |
| notes | text | Observações |
| created_at | timestamp with time zone | Default now(); gerado pelo servidor |

As medições e observações podem ser NULL. Nenhuma coluna adicional é utilizada.

## Políticas existentes, conforme confirmação do proprietário

- `assessments_select`: SELECT autenticado quando `student_id = auth.uid()` ou `is_trainer_of(student_id)`.
- `assessments_insert`: INSERT autenticado, com WITH CHECK para o próprio aluno ou `is_trainer_of(student_id)`.
- `assessments_update`: UPDATE autenticado para o próprio aluno ou `is_trainer_of(student_id)`; a v0.6 não faz UPDATE.
- `is_trainer_of(student uuid)` verifica a relação do treinador autenticado em `trainer_students` com `active = true`.
- `trainer_students`: SELECT das relações do treinador ou do aluno autenticado; INSERT quando `trainer_id = auth.uid()`. A v0.6 não cria relações.

A UI de criação é limitada ao treinador/admin associado, apesar de a política também permitir INSERT pelo próprio aluno. Nenhuma política foi alterada, enfraquecida ou substituída. Não há migração SQL necessária para os campos ou operações confirmados. Uma eventual rejeição em produção deve ser diagnosticada com o erro real, sem conceder permissões mais amplas como tentativa de correção.


# Schema de treinos confirmado para a v0.7

Fonte: export CSV fornecido pelo proprietário em 19/09/2026, seguido da confirmação de execução dos dois blocos SQL propostos. As colunas abaixo foram verificadas na Data API por SELECT explícito de cada tabela com `limit=0` (HTTP 200). O código não executa DDL nem altera políticas.

| Tabela | Colunas utilizadas |
| --- | --- |
| workout_plans | id uuid, student_id uuid, trainer_id uuid, name text, objective text, active bool, created_at timestamptz, start_date date, end_date date |
| workouts | id uuid, plan_id uuid, name text, position int4 |
| exercises | id uuid, workout_id uuid, name text, sets int4, reps text, rest_seconds int4, notes text, position int4, target_weight numeric, target_rir numeric |
| workout_sessions | id uuid, student_id uuid, workout_id uuid, started_at timestamptz, finished_at timestamptz, notes text |
| set_logs | id uuid, session_id uuid, exercise_id uuid, set_number int4, weight numeric, reps int4, rir numeric, completed bool, notes text |

As novas colunas aplicadas pelo proprietário são `workout_plans.start_date/end_date`, `exercises.target_weight/target_rir` e `set_logs.notes`. Têm valores opcionais; os checks adicionados validam datas e alvos não negativos.

Todos os IDs têm default `gen_random_uuid()`. O frontend envia UUIDs estáveis para poder confirmar/repetir INSERT sem UPSERT. `workout_plans.created_at` e `workout_sessions.started_at` usam `now()` do servidor. `finished_at` é enviado ao concluir. Nomes e relações obrigatórias são validados; outras colunas opcionais são NULL quando não preenchidas.

Relações: `workouts.plan_id → workout_plans.id`, `exercises.workout_id → workouts.id`, `workout_sessions.workout_id → workouts.id`, `set_logs.session_id → workout_sessions.id`, `set_logs.exercise_id → exercises.id`. A identidade de progressão é `exercise_id`, não o nome do exercício.

## RLS exportado e reforços confirmados

- Planos: SELECT do próprio aluno ou treinador associado; INSERT/UPDATE por `is_trainer_of(student_id)`. O export contém políticas permissivas duplicadas de INSERT/UPDATE; não foram removidas nem alteradas.
- Treinos/exercícios: SELECT através do plano do aluno ou treinador associado; INSERT pelo treinador associado. Sem UPDATE/DELETE usados pela aplicação.
- Sessões: SELECT do aluno ou treinador associado; INSERT/UPDATE pelo próprio aluno.
- Séries: SELECT através da sessão do aluno ou treinador associado; INSERT pelo próprio aluno. Sem UPDATE/DELETE usados pela aplicação.
- RLS ativo nas cinco tabelas.
- `sessions_own_workout_insert` (RESTRICTIVE): exige que o treino pertença a um plano do aluno autenticado.
- `sessions_own_workout_update` (RESTRICTIVE): mantém essa propriedade e permite workout_id NULL para sessões cujo treino tenha sido eliminado.
- `sets_match_session_workout` (RESTRICTIVE): exige sessão do próprio aluno, exercício pertencente ao treino da sessão e plano do próprio aluno.

Estes três reforços foram executados pelo proprietário antes da implementação. O serviço faz também verificações de associação, propriedade e relação exercício/sessão, mas estas não substituem as políticas do servidor. A execução real das políticas não foi auditada com contas autenticadas nesta entrega; os testes automatizados simulam-nas.

# v0.8 — migrações propostas, apenas testadas localmente

A 19/09/2026, as colunas utilizadas de `profiles`, `trainer_students`, `assessments` e das cinco tabelas da v0.7 foram novamente aceites pela API remota com SELECT explícito e `limit=0` (HTTP 200). Não foram lidos registos pessoais nem auditadas políticas remotas autenticadas. O schema SQL abaixo é uma proposta nova e não é apresentado como já existente no Supabase.

- `supabase/migrations/202609190001_monthly_plans.sql`: cria `monthly_plan_context` (objetivo, experiência, dias, limitações e feedback registados pelo treinador), `monthly_plan_drafts` (JSON privado, mês, estados, origem, revisão, geração/aprovação e referência ao plano publicado) e `monthly_plan_events` (evento, identificadores, momento; sem medições ou notas). Contém RLS e RPCs de edição, aprovação e publicação atómica.
- `supabase/migrations/202609190002_generation_jobs.sql`: cria `monthly_generation_jobs`, reserva de trabalho, tentativas, token da tentativa, estado e código de erro limitado. A conclusão revalida a associação e não substitui um rascunho existente.
- `supabase/sql/monthly_scheduler.sql`: SQL de instalação opcional do scheduler, separado das migrações. Requer `pg_cron`, `pg_net` e secrets no Vault.

Nenhuma coluna das tabelas existentes é adicionada ou renomeada. Nenhuma política antiga é removida ou alargada. A aprovação antecipada guarda o JSON como `approved` na tabela privada; só no mês devido a publicação insere o plano, treinos e exercícios nas tabelas v0.7, dentro da mesma transação. Assim, mesmo as políticas antigas que permitem ao aluno ler planos inativos não revelam rascunhos ou planos futuros.

As tabelas novas têm RLS e não concedem INSERT/UPDATE/DELETE ao browser. RPCs de treinador verificam `auth.uid()`, role e associação ativa; as operações críticas bloqueiam a relação durante a transação. Funções de geração/publicação são exclusivas do servidor. O aluno não dispõe de política SELECT para nenhuma tabela privada. A publicação conserva o plano anterior quando ainda não existe substituto aprovado; quando publica, desativa os planos anteriores do aluno e arquiva os registos mensais ativos.

Validação local usa PostgreSQL via PGlite, com um fixture mínimo das colunas documentadas, roles, RLS e funções reais das migrações. Isto não substitui uma revisão do DDL, triggers e policies completos do projeto remoto antes da instalação.

# Anamnese — tabelas existentes, integração de 20/09/2026

Schema e permissões fornecidos pelo proprietário. As colunas abaixo foram novamente aceites pela Data API com SELECT explícito e `limit=0` (HTTP 200), sem leitura de registos. Não houve migração, criação de tabela, alteração de RLS ou gravação remota.

| Tabela | Colunas utilizadas | Unicidade comunicada |
| --- | --- | --- |
| `anamneses` | `id uuid`, `student_id uuid`, `status text`, `answers jsonb`, `completed_at timestamptz`, `created_at timestamptz`, `updated_at timestamptz` | `UNIQUE(student_id)` |
| `anamnesis_trainer_notes` | `id uuid`, `student_id uuid`, `trainer_id uuid`, `notes text`, `created_at timestamptz`, `updated_at timestamptz` | `UNIQUE(student_id, trainer_id)` |

`status` é `draft` ou `completed`. O aluno tem SELECT/INSERT/UPDATE da própria anamnese. O treinador associado tem SELECT das respostas e não as altera. Observações do treinador são gravadas exclusivamente em `anamnesis_trainer_notes`, limitadas ao seu `trainer_id` e à associação ativa. O aluno não consulta essa tabela na aplicação. A política remota concreta das notas não foi exportada/auditada por esta tarefa; a integração usa apenas as permissões declaradas pelo proprietário.

`answers` contém `_meta: {version: 1, currentStep: 0..11, saveId: UUID}` e as 12 secções `personal`, `goals`, `training`, `health`, `limitations`, `activity`, `recovery`, `nutrition`, `availability`, `preferences`, `motivation`, `relationship`. `limitations` contém listas condicionais `pains`, `injuries` e `surgeries`; `nutrition` contém a lista condicional `supplementList`. Booleans são JSON boolean, medições/escalas são números e seleções múltiplas são arrays de strings. Campos não aplicáveis são removidos; valores em falta não são inventados. Observações do treinador nunca entram neste JSON.

O módulo envia IDs estáveis e timestamps de cliente; um trigger de servidor, se existir, pode substituir os timestamps e o valor devolvido passa a ser utilizado. UPDATE usa também o `updated_at` lido como controlo de concorrência. `completed_at` recebe a data da conclusão e volta a NULL ao guardar alterações como draft. Formatos JSON não vazios sem versão reconhecida não são sobrescritos automaticamente.

Consultar [ANAMNESIS-REVIEW.md](ANAMNESIS-REVIEW.md) para o JSON completo, campos condicionais, regras de validação, alertas e testes manuais. Os alertas são regras de atenção/UX para revisão do treinador; **não constituem diagnóstico nem decisão médica**. As regras de sono/stress são regras internas de coaching e estão documentadas nessa revisão.

## Nutrição — integridade e acesso

As migrações `20260921182042_nutrition_module.sql`, `20260921185157_nutrition_integrity_and_editor.sql` e `20260921191124_nutrition_policy_evaluation.sql` definem oito tabelas com RLS:

| Tabela | Finalidade e acesso |
| --- | --- |
| `nutrition_profiles` | Preferências e triagem, com `revision`. O aluno lê os seus campos públicos; o treinador associado grava por RPC. Os campos legados `notes`, `sex`, `date_of_birth` não são concedidos ao cliente. |
| `nutrition_trainer_notes` | Notas por aluno/treinador. Só o autor ainda associado lê ou grava. |
| `nutrition_targets` | Versões imutáveis calculadas no servidor. `context_hash` vincula a meta à anamnese, avaliações e preferências; `request_payload` e UUID permitem repetir o mesmo pedido sem duplicar. |
| `meal_plans` | Rascunho, revisão, aprovação. FK composta impede associar metas de outro aluno ou treinador. `revision` evita alterações desatualizadas. |
| `meal_plan_days` | Sete datas e posições únicas por plano. |
| `meal_plan_meals` | Refeições ordenadas, horário e notas visíveis ao aluno quando o plano é aprovado. |
| `meal_plan_items` | Alimentos, quantidade, nutrientes por porção, fonte, versão e data de consulta. |
| `hydration_logs` | O aluno pode ler, inserir e eliminar os próprios registos. Sem UPDATE ou atribuição a outro aluno. |

Todos os clientes anónimos ficam sem privilégios nestas tabelas e RPCs. Os autenticados recebem apenas leitura e as operações próprias de hidratação. Não há `TRUNCATE`, `TRIGGER`, `REFERENCES` ou UPDATE direto para estes perfis.

As RPCs públicas `nutrition_context`, `nutrition_save_profile`, `nutrition_save_target`, `nutrition_create_meal_plan`, `nutrition_edit_meal_plan`, `nutrition_review_meal_plan` e `nutrition_approve_meal_plan` usam `SECURITY INVOKER`. As implementações privilegiadas ficam no schema não exposto `nutrition_private`, com `search_path=''`, objetos qualificados e verificação explícita de `auth.uid()`, papel e associação ativa. As funções auxiliares não são executáveis pelos clientes.

O cálculo usa as fontes atuais do servidor; resultados e snapshots enviados pelo navegador não são autoridade. A revisão/aprovação verifica contexto, propriedade da meta, sete dias e preenchimento de todas as refeições. Não existe exceção pelo cliente para ultrapassar a triagem profissional. Nenhum cálculo ou plano fictício foi criado na base real durante os testes.
