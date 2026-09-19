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
