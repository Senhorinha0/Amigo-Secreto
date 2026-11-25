# Amigo Secreto da Família Senhorinha

Site estático em HTML, CSS e JavaScript, com Supabase Auth, Postgres e Edge Functions. O visual natalino original foi mantido.

## Integração já preparada

- `config.js` contém somente a URL do Supabase e a chave pública `anon`. A chave é adequada para o navegador e continua protegida pelas políticas RLS.
- `supabase/schema.sql` descreve as tabelas, as chaves, o RLS e as funções que suportam o código atual. A instância Supabase conectada já tem esse schema e a família/evento inicial.
- Os resultados, convites em hash, sessões e listas ficam inacessíveis diretamente pelo navegador. As Edge Functions usam a chave de serviço apenas no servidor.
- A conta de administrador precisa estar registrada em `public.admins`; só estar autenticada não libera o painel.
- Participantes conseguem criar, editar e remover suas sugestões antes do sorteio. A lista da pessoa sorteada aparece para quem a tirou.
- Cada participante pode salvar tamanho de roupa, número do calçado, presentes desejados e, opcionalmente, itens que não quer ganhar. Depois do sorteio, esse perfil aparece somente para quem tirou a pessoa.
- No primeiro acesso com o código, a pessoa preenche esse perfil antes de continuar. O nome do amigo secreto fica escondido até o organizador realizar o sorteio; com a página aberta, o resultado é atualizado automaticamente.
- O familiar pode solicitar um código pelo nome. O código é enviado ao e-mail do organizador para ele repassar; esse envio depende da configuração do Resend abaixo.
- O painel permite configurar o evento, gerenciar participantes, definir restrições e sortear uma vez.
- Depois de um sorteio, o organizador pode anulá-lo no painel. Isso apaga os pares e reabre o evento, preservando participantes, perfis e listas de presentes.
- Cada evento funciona como uma sala anual, com código próprio, organizador, data, orçamento e lista de familiares. Os familiares existentes não são apagados; ao entrar com o novo código, são associados à nova sala.
- Depois de entrar com o código pessoal, o familiar fica na tela da sala, com os detalhes, a lista de participantes e a mensagem de espera até o sorteio.

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

Todas as funções usam `@supabase/server` para verificar a autenticação dentro da função. Por isso, publique com `--no-verify-jwt`; as funções administrativas validam a sessão Auth e consultam `public.admins` sob a política RLS do próprio usuário antes de fazer qualquer operação privilegiada:

```sh
supabase functions deploy participant-access --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy participant-me --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy participant-join-room --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy participant-wishes --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy participant-profile --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy request-participant-code --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy admin-create-participant --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy admin-draw --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
supabase functions deploy admin-reset-draw --no-verify-jwt --project-ref kiepppjaomqffxqwmxvk --yes
```

As funções usam as variáveis gerenciadas pelo Supabase (`SUPABASE_URL`, chaves públicas e `SUPABASE_SECRET_KEYS`). O `@supabase/server` cuida dos cabeçalhos e da autenticação. A checagem de administrador usa a sessão do usuário e a política RLS de `admins`; operações de servidor usam `ctx.supabaseAdmin`. Chaves secretas nunca são enviadas pelo navegador. Não adicione chaves secretas aos arquivos do site nem ao repositório.

### Ativar pedidos de código por e-mail

O site envia o convite ao organizador usando o Resend:

1. Crie uma conta no [Resend](https://resend.com/) e verifique um domínio que você controla. O remetente precisa usar esse domínio.
2. No Supabase, abra **Edge Functions → Secrets** e salve `RESEND_API_KEY` com a chave do Resend e `EMAIL_FROM` com o remetente verificado, por exemplo `Amigo Secreto <convites@seu-dominio.com>`.
3. Entre no painel do site como administrador e salve seu endereço no cartão **E-mail para pedidos de código**.
4. Publique o site atualizado no host e teste com um nome ainda não cadastrado.

A chave do Resend deve ficar apenas nos segredos do Supabase. Não a coloque em `config.js`, HTML, JavaScript do site nem no repositório. O Supabase disponibiliza segredos às Edge Functions sem gravá-los no código.

## Publicar o site

Publique `index.html`, `app.js`, `styles.css` e `config.js` juntos em um host estático, como Vercel ou Netlify. `config.js` é intencionalmente carregado antes de `app.js`. A chave `anon` é própria para o navegador e permanece limitada pelas políticas RLS.

No Vercel: crie um projeto novo, importe o repositório que contém esta pasta, escolha **Other** como framework, deixe o comando de build vazio, use `.` como diretório de saída e clique em **Deploy**. Inclua `config.js` junto com os arquivos; ele contém somente valores públicos.

### Recuperar a senha do organizador

O site agora reconhece o link de recuperação do Supabase e mostra o formulário para cadastrar e confirmar uma nova senha. Publique esta versão do site primeiro. No Supabase, abra **Authentication → URL Configuration** e configure a **Site URL** com o endereço publicado (por exemplo, `https://SEU-SITE.vercel.app`). Em **Redirect URLs**, inclua esse endereço e, se for testar localmente, o endereço exato do servidor local (por exemplo `http://127.0.0.1:5500/**`).

Depois, abra o site publicado, clique em **Administrador**, digite o e-mail da conta e use **Esqueci minha senha**. Abra o link novo no mesmo site e informe a nova senha duas vezes. Links antigos ou expirados devem ser substituídos por um link novo. A página precisa estar publicada e acessível; `localhost:3000` só funciona quando há um servidor do projeto ativo nessa porta.

Para desenvolvimento local, abra a pasta em VS Code e use Live Server (não abra o arquivo como `file://`).

## Banco de dados

Em um projeto Supabase novo, execute `supabase/schema.sql` no SQL Editor antes de publicar as funções e insira a família/evento inicial. No projeto conectado, a migração `participant_profiles_and_code_requests` foi aplicada com os campos do perfil, o e-mail do organizador e o limite de solicitações. O SQL de bootstrap para a família/evento é:

Para este banco que já tem participantes, execute também `supabase/rooms-migration.sql` no SQL Editor antes de publicar as funções. Ela cria a sala do evento atual e gera um código, sem apagar cadastros, perfis, listas ou resultados. O comando da Edge Function `participant-join-room` também deve ser implantado; `admin-draw` foi atualizado para sortear apenas as pessoas que entraram na sala.

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

O painel usa a sessão Supabase Auth do organizador. Antes de usar com dados reais, cadastre o usuário em `public.admins`, aplique o schema/migração, publique as funções e configure o envio de e-mail.

Se a instalação usar outro projeto Supabase, depois de criar a família e o evento, consulte o UUID da família com `select id from public.familias where nome = 'Família Senhorinha';` e atualize a constante `FAMILY_ID` no início de `app.js`. `config.js` continua contendo apenas `url` e `anonKey`.


## Acesso do participante

Depois de validar o código uma vez, o site guarda a sessão neste navegador para continuar após fechar e reabrir a página. Por segurança, a sessão de acesso vence após 14 dias ou pode ser revogada; nesse caso, será necessário usar o código novamente. Não use computadores compartilhados para permanecer conectado.


## Perfil e contagem de sorteios

Após entrar, o perfil no canto superior direito mostra o nome do familiar e quantos sorteios participou. Para o organizador, mostra o nome da conta Auth (ou o início do e-mail, se não houver nome cadastrado) e quantos sorteios organizou. O botão de saída encerra a sessão ativa.

Em uma instalação Supabase existente, execute supabase/profile-stats.sql no SQL Editor antes de publicar o frontend. Esse script adiciona contadores cumulativos: anular e refazer o sorteio conta como uma nova participação/execução. O backfill consegue contar resultados que ainda estão guardados no banco e eventos atualmente sorteados; execuções antigas já anuladas não podem ser recuperadas porque os pares anteriores foram apagados.

Depois, publique novamente a Edge Function participant-me conforme os comandos acima e publique os arquivos do site. Em uma instalação nova, supabase/schema.sql já inclui os campos e gatilhos.
