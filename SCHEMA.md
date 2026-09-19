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
