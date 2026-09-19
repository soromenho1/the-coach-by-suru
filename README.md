# The Coach by Suru · v0.5

Aplicação estática em português. `index.html` conserva os estilos da v0.4 e carrega `app.js`, com Supabase Auth e encaminhamento pelo perfil autenticado.

## Executar

Servir a pasta com `python3 -m http.server 8000` e abrir `http://localhost:8000`. É necessária ligação à Internet para o SDK e Supabase. Testes automáticos: `node --test tests/app.test.cjs` (Node 18 ou superior).

## Autenticação e dados

- A configuração pública existente aponta para `ihpqwfxxjbpjizuoeqqf.supabase.co`. O frontend contém apenas a Publishable Key.
- `public.profiles`: `id` corresponde ao utilizador autenticado; `full_name` e `role` definem o nome e a área. Roles suportados: `student`, `trainer`, `admin`. Perfil ausente, role desconhecido ou erro de leitura bloqueiam o acesso à área.
- O aluno vê o seu próprio perfil. Treinador e administrador têm áreas identificadas separadamente; ambos consultam apenas os seus alunos associados, sem acesso global implícito para admin.
- `public.trainer_students`: filtra `trainer_id = session.user.id` e `active = true`; só lê perfis `student` dos `student_id` encontrados. Suporta UUIDs, paginação e associações vazias.
- A sessão inicial e alterações de autenticação recarregam o perfil. Logout ou mudança de conta invalidam respostas pendentes e removem os dados anteriores do ecrã. Os antigos dados `tc_*` de localStorage não são utilizados.
- Os cartões e estilos de acompanhamento mantêm-se. Valores fictícios e gravações simuladas foram substituídos por estados sem dados. A persistência de anamnese, avaliações, planos, treinos, água, cardio e check-ins não é implementada nesta versão; não se assumem colunas dessas tabelas.

## Segurança e validação

O filtro no frontend não substitui RLS. Segundo a configuração confirmada pelo proprietário, RLS está ativo nas tabelas e `public.is_trainer_of(student uuid)` verifica associações ativas. As políticas devem permitir leitura do próprio perfil e dos alunos associados, impedir acesso a alunos alheios/inativos e impedir alterações do próprio `role` ou criação não autorizada de associações. A definição das políticas não foi disponibilizada nem alterada nesta entrega.

As consultas de schema às colunas confirmadas, com `limit=0` e a chave pública, responderam HTTP 200. Isto verifica a disponibilidade das colunas, não comprova isolamento RLS. Os testes locais simulam respostas Supabase; antes de publicar, validar com contas reais de treinador e aluno, incluindo dois treinadores, uma associação inativa, logout e recarregamento da página.

Referências: [eventos de autenticação](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [chaves públicas](https://supabase.com/docs/guides/getting-started/api-keys), [segurança e RLS](https://supabase.com/docs/guides/database/secure-data).

Validação desta entrega: 16 testes automáticos aprovados; login carregado no Chromium com SDK Supabase real; navegação treinador → aluno → módulo → voltar verificada no navegador com dados simulados, sem erros JavaScript. Layout mobile inspecionado a 390 px e CSS comparado com o backup da v0.4, sem alterações.
