# 🫧 Perfume Vault — Deploy no Render.com

Backend que scrapa o Fragrantica em tempo real. Siga os passos abaixo para colocar no ar em ~5 minutos.

---

## Passo 1 — Criar conta no GitHub

Acesse **github.com** e crie uma conta gratuita se ainda não tiver.

---

## Passo 2 — Criar repositório no GitHub

1. Clique em **"New repository"** (botão verde)
2. Nome: `perfume-vault-api`
3. Visibilidade: **Public** (necessário para o plano free do Render)
4. Clique em **"Create repository"**

---

## Passo 3 — Fazer upload dos arquivos

Na página do repositório recém-criado:

1. Clique em **"uploading an existing file"**
2. Arraste ou selecione **todos os arquivos** desta pasta:
   - `app.py`
   - `requirements.txt`
   - `render.yaml`
   - `build.sh`
   - `Procfile`
   - `runtime.txt`
   - `.gitignore`
3. Clique em **"Commit changes"**

---

## Passo 4 — Criar conta no Render

Acesse **render.com** → **"Get Started for Free"**  
Faça login com sua conta do **GitHub** (mais fácil).

---

## Passo 5 — Criar o Web Service

1. No dashboard do Render, clique em **"New +"** → **"Web Service"**
2. Selecione **"Build and deploy from a Git repository"**
3. Conecte sua conta GitHub e selecione o repositório `perfume-vault-api`
4. Preencha as configurações:

| Campo | Valor |
|-------|-------|
| **Name** | `perfume-vault-api` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt && playwright install chromium && playwright install-deps chromium` |
| **Start Command** | `gunicorn app:app --workers 1 --timeout 120 --bind 0.0.0.0:$PORT` |
| **Plan** | `Free` |

5. Clique em **"Create Web Service"**

---

## Passo 6 — Aguardar o build

O Render vai:
1. Instalar as dependências Python (~2 min)
2. Baixar o Chromium (~2 min)
3. Iniciar o servidor

Você verá os logs em tempo real. Quando aparecer:

```
🫧  Perfume Vault Backend  →  http://0.0.0.0:10000
```

Está pronto! ✅

---

## Passo 7 — Pegar sua URL

Na parte superior da página do serviço você verá algo como:

```
https://perfume-vault-api.onrender.com
```

Copie essa URL.

---

## Passo 8 — Atualizar o app (artifact no Claude)

No artifact do Perfume Vault, a primeira linha do código é:

```js
const BACKEND = "http://localhost:5000";
```

Substitua por:

```js
const BACKEND = "https://perfume-vault-api.onrender.com";
```

Pronto! O app funciona no celular, tablet e qualquer dispositivo. 🎉

---

## ⚠️ Importante sobre o plano Free

O Render Free "hiberna" o serviço após **15 minutos sem uso**.  
A primeira requisição depois disso demora ~30 segundos para "acordar".

Para evitar isso, você pode usar o **UptimeRobot** (gratuito) para fazer ping a cada 14 minutos:
1. Acesse uptimerobot.com → criar monitor
2. Tipo: HTTP(S)
3. URL: `https://perfume-vault-api.onrender.com/api/health`
4. Intervalo: 14 minutos

Isso mantém o servidor sempre ativo. ✅

---

## Endpoints disponíveis

```
GET  /api/health
POST /api/perfume/search  { "query": "Sospiro Vibrato" }
POST /api/perfume/url     { "url": "https://www.fragrantica.com/perfume/..." }
POST /api/price/br        { "nome": "Vibrato", "marca": "Sospiro" }
```
