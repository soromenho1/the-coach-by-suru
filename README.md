# The Coach by Suru · v0.6

Aplicação estática em português com Supabase Auth. A v0.6 liga a Avaliação física e a Evolução a `public.assessments`, preservando o CSS da v0.5.

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
# Se o Playwright estiver instalado fora do projeto:
COACH_PLAYWRIGHT=/caminho/para/node_modules/playwright node tests/browser-assessments.cjs
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

Os restantes módulos permanecem com os estados sem dados da v0.5. O formulário usa os cartões, cores e campos existentes; inputs decimais e datas têm tamanho de letra adequado a iPhone.

## Segurança e schema

A aplicação usa exclusivamente a Publishable Key já configurada para `ihpqwfxxjbpjizuoeqqf.supabase.co`. Não contém chave secreta nem credencial com privilégios de serviço. Não modifica políticas, tabelas ou permissões.

O proprietário confirmou as 19 colunas, defaults e políticas documentados em [SCHEMA.md](SCHEMA.md). A API aceitou um SELECT explícito dessas 19 colunas com `limit=0` (HTTP 200). Não foi identificada necessidade de migração SQL.

## Validação da v0.6

- 44 testes automáticos: regressão da v0.5, validação de todos os campos, acesso por role/associação, paginação, datas, diferenças, erros de RLS e repetição de pedidos sem duplicação.
- Chromium, a 390 e 1440 px: fluxo treinador → Maria → Avaliação física, todos os campos, erro de INSERT, gravação, histórico, cartões, avaliação retroativa, recarregamento, evolução, associação desativada e erro de leitura. Sem erros JavaScript nem overflow horizontal. O teste carrega o SDK real e simula os endpoints Auth/REST; as medições de teste nunca são enviadas ao Supabase real.
- A persistência após recarregamento foi confirmada nesse servidor simulado. A gravação e leitura autenticadas na Maria real não foram testadas: falta uma sessão de treinador e medidas reais ou autorização explícita para registos de teste. A configuração RLS foi confirmada pelo proprietário, mas não auditada diretamente no servidor.

Para validação real, iniciar sessão como treinador em `http://localhost:8000`, abrir Maria, guardar medidas autorizadas, recarregar e confirmar histórico, cartões e evolução. Testar também um aluno não associado e uma associação inativa com contas de teste autorizadas. Não introduzir medições fictícias num perfil real.

Referências: [INSERT Supabase](https://supabase.com/docs/reference/javascript/insert), [eventos de autenticação](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
