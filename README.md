# Amigo Secreto da Família Senhorinha

Site estático em HTML, CSS e JavaScript, com Supabase Auth, Postgres e Edge Functions. O visual natalino original foi mantido.

## Integração já preparada

- `config.js` contém somente a URL do Supabase e a chave pública `anon`. A chave é adequada para o navegador e continua protegida pelas políticas RLS.
- `supabase/schema.sql` descreve as tabelas, as chaves, o RLS e as funções que suportam o código atual. A instância Supabase conectada já tem esse schema e a família/evento inicial.
- Os resultados, convites em hash, sessões e listas ficam inacessíveis diretamente pelo navegador. As Edge Functions usam a chave de serviço apenas no servidor.
- A conta de administrador precisa estar registrada em `public.admins`; só estar autenticada não libera o painel.
- Participantes conseguem criar, editar e remover suas sugestões antes do sorteio. A lista da pessoa sorteada aparece para quem a tirou.
- O painel permite configurar o evento, gerenciar participantes, definir restrições e sortear uma vez.

## Ativar o primeiro administrador

1. No Supabase, abra **Authentication → Users → Add user** e crie o usuário do organizador.
2. Copie o UUID desse usuário.
3. No **SQL Editor**, execute, trocando o marcador pelo UUID copiado:

   ```sql
   insert into public.admins (user_id)
   values ('UUID_DO_USUARIO_AUTH');
   ```

Isso autoriza somente o usuário listado. Não cadastre a família como participante antes de publicar as funções.

## Implantar as Edge Functions

Instale e autentique o Supabase CLI, abra o terminal na pasta deste projeto e vincule o projeto existente:

```sh
supabase login
supabase link --project-ref kiepppjaomqffxqwmxvk
```

Publique as funções de acesso por código sem exigir JWT de usuário no gateway; elas validam seu token individual de sessão. As funções administrativas exigem JWT válido e também consultam `public.admins`:

```sh
supabase functions deploy participant-access --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy participant-me --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy participant-wishes --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy admin-create-participant --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy admin-draw --project-ref kiepppjaomqffxqwmxvk --yes
```

As funções usam as variáveis gerenciadas pelo Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`). Não adicione a chave de serviço aos arquivos do site nem ao repositório. O projeto Supabase já conectado recebeu o código dessas funções pelo conector Codex; use os comandos acima quando republicar após uma alteração.

## Publicar o site

Publique `index.html`, `app.js`, `styles.css` e `config.js` juntos em um host estático, como Vercel ou Netlify. `config.js` é intencionalmente carregado antes de `app.js`. A chave `anon` é própria para o navegador e permanece limitada pelas políticas RLS.

No Vercel: crie um projeto novo, importe o repositório que contém esta pasta, escolha **Other** como framework, deixe o comando de build vazio, use `.` como diretório de saída e clique em **Deploy**. Inclua `config.js` junto com os arquivos; ele contém somente valores públicos.

Para desenvolvimento local, abra a pasta em VS Code e use Live Server (não abra o arquivo como `file://`).

## Banco de dados

Em um projeto Supabase novo, execute `supabase/schema.sql` no SQL Editor antes de publicar as funções e insira a família/evento inicial. No projeto já conectado, as tabelas e políticas correspondem ao schema atual; não execute novamente o arquivo como uma migração. O histórico remoto de migrações estava vazio: o schema de referência está neste arquivo, e os ajustes de segurança foram aplicados diretamente pelo conector Supabase. O SQL de bootstrap para a família/evento é:

```sql
insert into public.familias (nome)
select 'Família Senhorinha'
where not exists (select 1 from public.familias where nome = 'Família Senhorinha');

insert into public.sorteios (familia_id, nome, status, valor_minimo, valor_maximo, max_desejos)
select id, 'Amigo Secreto da Família Senhorinha', 'rascunho', 0, 100, 5
from public.familias
where nome = 'Família Senhorinha'
  and not exists (select 1 from public.sorteios s where s.familia_id = familias.id);
```

O painel usa a sessão Supabase Auth do organizador. Antes de usar com dados reais, cadastre o usuário em `public.admins`, publique as cinco funções e confira um ciclo completo com participantes fictícios.

Se a instalação usar outro projeto Supabase, depois de criar a família e o evento, consulte o UUID da família com `select id from public.familias where nome = 'Família Senhorinha';` e atualize a constante `FAMILY_ID` no início de `app.js`. `config.js` continua contendo apenas `url` e `anonKey`.
