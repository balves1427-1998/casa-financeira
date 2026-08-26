# 🚀 Guia de Deploy

Backend (NestJS + PostgreSQL + Redis) e frontend (Next.js) são hospedados
separadamente. Este guia usa **Render** ou **Railway** para a API e **Vercel**
para a interface.

---

## Antes de começar: o que já está resolvido

Alguns ajustes eram obrigatórios para qualquer hospedagem e já estão no código:

| Ajuste | Por quê |
|---|---|
| `PORT` respeitada em `main.ts` | Railway/Render injetam `PORT` e roteiam para ela. A aplicação lia só `API_PORT` e o health check falharia com a API no ar |
| `listen(port, '0.0.0.0')` | Em `localhost`, o processo só aceitaria conexões de dentro do próprio contêiner |
| `DATABASE_URL` e `REDIS_URL` | Serviços gerenciados entregam uma URL única, não host/porta separados |
| `DB_SSL` | O PostgreSQL gerenciado exige TLS; sem isso a conexão é recusada |
| `/health` e `/health/ready` | Sem endpoint de saúde, a plataforma só sabe que a porta abriu — não que o banco responde |
| `deploy:start` roda migrations | Código novo com schema antigo quebra em runtime, não no build |
| `FRONTEND_URL` aceita lista | Permite liberar o domínio final e as URLs de preview da Vercel juntos |
| `exposedHeaders: Content-Disposition` | Sem isso o download de relatórios chega sem nome de arquivo |
| Bloco `env` removido do `next.config.js` | Ele sobrescrevia `NEXT_PUBLIC_API_URL` e o build de produção apontava para `localhost` |

---

## Opção A — Render (blueprint, mais automático)

O arquivo `render.yaml` na raiz declara os três serviços.

1. **Render Dashboard → New → Blueprint**
2. Conecte o repositório `casa-financeira`
3. O Render lê o `render.yaml` e cria: API, PostgreSQL e Redis
4. A única variável que você precisa preencher é **`FRONTEND_URL`** — deixe em
   branco por enquanto e volte depois do passo da Vercel

O `JWT_SECRET` é gerado automaticamente (`generateValue: true`) — não há segredo
versionado no repositório.

> ⚠️ No plano gratuito, o Render **suspende** o serviço após 15 minutos sem
> tráfego. A primeira requisição depois disso leva ~30 segundos para responder.

---

## Opção B — Railway

O `backend/railway.json` traz o build, o start e o health check.

1. **Railway → New Project → Deploy from GitHub repo**
2. Em *Settings → Root Directory*, informe **`backend`**
3. **+ New → Database → PostgreSQL**
4. **+ New → Database → Redis**
5. Nas variáveis do serviço da API, referencie os outros dois:

```
DATABASE_URL = ${{Postgres.DATABASE_URL}}
REDIS_URL    = ${{Redis.REDIS_URL}}
DB_SSL       = true
NODE_ENV     = production
JWT_SECRET   = <gere uma chave aleatória de 32+ caracteres>
FRONTEND_URL = <preencher após o deploy da Vercel>
```

Para gerar o `JWT_SECRET`:

```powershell
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
```

```bash
# bash
openssl rand -base64 36
```

---

## Frontend na Vercel

1. **Vercel → Add New → Project**, conecte o repositório
2. Em *Root Directory*, informe **`frontend`** — este passo é obrigatório, é um
   monorepo
3. Framework: **Next.js** (detectado automaticamente)
4. Em *Environment Variables*:

```
NEXT_PUBLIC_API_URL = https://sua-api.onrender.com
```

(sem barra no final)

5. Deploy

### Fechando o ciclo do CORS

Volte ao Render/Railway e preencha `FRONTEND_URL` com a URL da Vercel:

```
FRONTEND_URL = https://casa-financeira.vercel.app
```

Para liberar também os previews de branch, use lista separada por vírgula:

```
FRONTEND_URL = https://casa-financeira.vercel.app,https://casa-financeira-git-dev-seu-usuario.vercel.app
```

Sem isso o navegador bloqueia as chamadas e a interface aparece vazia, sem erro
visível na tela — só no console.

---

## Verificação pós-deploy

```bash
curl https://sua-api.onrender.com/health
# {"status":"ok","timestamp":"...","uptimeSeconds":42}

curl https://sua-api.onrender.com/health/ready
# {"status":"ok","database":"up","timestamp":"..."}
```

Se `database` vier `down`, confira `DATABASE_URL` e `DB_SSL=true`.

Depois, pela interface: cadastre-se, adicione a segunda pessoa em **Família**,
lance uma receita e uma despesa e gere um relatório.

---

## Variáveis de ambiente — referência

### Backend (obrigatórias)

| Variável | Exemplo | Observação |
|---|---|---|
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | fornecida pela plataforma |
| `DB_SSL` | `true` | obrigatório em banco gerenciado |
| `REDIS_URL` | `redis://host:6379` | filas do Bull |
| `JWT_SECRET` | 32+ caracteres aleatórios | **nunca** reutilize o do exemplo |
| `FRONTEND_URL` | `https://app.vercel.app` | aceita lista separada por vírgula |

`PORT` é injetada pela plataforma — não defina manualmente.

### Backend (opcionais — alertas por e-mail)

`SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASSWORD` · `EMAIL_FROM`

Sem elas o sistema funciona normalmente; apenas os lembretes de vencimento não
são enviados.

### Frontend

| Variável | Exemplo |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://sua-api.onrender.com` |

---

## Limitação conhecida: arquivos em disco

Os relatórios em PDF/XLSX/CSV são gravados em `storage/` no sistema de arquivos
do contêiner. Render e Railway usam **disco efêmero**: a cada redeploy ou
reinício, os arquivos gerados desaparecem.

Na prática isso significa que um relatório antigo pode não estar mais disponível
para download — basta gerá-lo de novo, já que os dados continuam no banco. Para
uso doméstico é aceitável.

Se incomodar, as saídas são:

- **Disco persistente** — Render oferece em planos pagos; monte em `/opt/render/project/src/backend/storage`
- **Object storage** — trocar a gravação local por S3, Cloudflare R2 ou Backblaze B2 em `ReportExportService`

---

## Sobre o Lovable

O Lovable constrói e hospeda aplicações **React + Vite**, com backend via
Supabase. A arquitetura deste projeto é diferente:

| | Este projeto | O que o Lovable espera |
|---|---|---|
| Frontend | Next.js 14 (App Router) | React + Vite |
| Backend | NestJS (servidor Node dedicado) | Supabase / edge functions |
| Banco | PostgreSQL com 23 migrations TypeORM | Supabase |
| Fila | Redis + Bull | — |

**A API NestJS não roda no Lovable.** Importar o repositório lá faria a
plataforma tratar a raiz como um app Vite, e o build falharia.

Três caminhos possíveis:

**A — Hospedagem convencional (recomendado).** É o que este guia descreve:
Render/Railway + Vercel. Preserva tudo o que foi construído.

**B — Lovable só para a interface.** Manter o backend hospedado em outro lugar e
criar no Lovable um frontend novo em React + Vite consumindo a API. Funciona,
mas significa refazer as 20 telas.

**C — Reescrever para o modelo do Lovable.** Migrar o banco para Supabase e
converter os 24 módulos em edge functions. Na prática é recomeçar o backend.

---

## Validação feita antes de publicar este guia

O fluxo de produção foi simulado localmente com o build compilado (`dist/`),
`DATABASE_URL` única, `REDIS_URL`, `PORT` injetada e banco vazio:

```
migrations aplicadas no start ... 23
API running on port 4000 ....... ok
/health ........................ {"status":"ok"}
/health/ready .................. {"status":"ok","database":"up"}
7 endpoints autenticados ....... todos 200
CORS com origem de produção .... Access-Control-Allow-Origin correto
erros no log ................... 0
```
