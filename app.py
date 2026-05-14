"""
Perfume Vault Backend v3 — No Playwright
Uses cloudscraper + BeautifulSoup (pure Python, no C++ compilation needed).
"""

import re, json, os, time
from flask import Flask, jsonify, request
from bs4 import BeautifulSoup
import cloudscraper

app = Flask(__name__)

# ── CORS ──────────────────────────────────────────────────────────────────────
@app.after_request
def cors(resp):
    resp.headers["Access-Control-Allow-Origin"]  = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp

@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>",             methods=["OPTIONS"])
def preflight(path): return jsonify({}), 200

# ── Scraper session ───────────────────────────────────────────────────────────
def get_scraper():
    return cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )

# ── Notes parser ──────────────────────────────────────────────────────────────
def parse_notes(text, peso):
    items = re.split(r",\s*", text.strip())
    result = []
    for item in items:
        parts = re.split(r"\s+and\s+", item.strip())
        for p in parts:
            p = p.strip()
            if p and 1 < len(p) < 40:
                result.append({"nome": p, "peso": peso})
    return result

# ── Fragrantica scraper ───────────────────────────────────────────────────────
def scrape_url(url: str) -> dict:
    scraper = get_scraper()
    try:
        r = scraper.get(url, timeout=20)
        if r.status_code != 200:
            return {"erro": f"Fragrantica retornou status {r.status_code}"}

        soup = BeautifulSoup(r.text, "lxml")
        data = {"url": url}

        # ── Name & Brand ─────────────────────────────────────────────────
        h1 = soup.find("h1", {"itemprop": "name"}) or soup.find("h1")
        if h1:
            spans = h1.find_all("span")
            if len(spans) >= 2:
                data["marca"] = spans[0].get_text(strip=True)
                data["nome"]  = spans[1].get_text(strip=True)
            else:
                data["nome"] = h1.get_text(strip=True)

        # ── Image ─────────────────────────────────────────────────────────
        img = soup.find("img", {"itemprop": "image"})
        if img:
            src = img.get("src") or img.get("data-src", "")
            if src and not src.startswith("data:"):
                data["imagem"] = src if src.startswith("http") else "https://www.fragrantica.com" + src
        if "imagem" not in data:
            og = soup.find("meta", property="og:image")
            if og: data["imagem"] = og.get("content", "")

        # ── Rating ────────────────────────────────────────────────────────
        rv = soup.find(attrs={"itemprop": "ratingValue"})
        if rv:
            try: data["fragrantica_nota"] = float(rv.get_text(strip=True))
            except: pass
        rc = soup.find(attrs={"itemprop": "ratingCount"})
        if rc:
            try: data["votos_comunidade"] = int(rc.get_text(strip=True).replace(",","").replace(".",""))
            except: pass

        # ── Year ──────────────────────────────────────────────────────────
        yr = soup.find(attrs={"itemprop": "releaseYear"})
        if yr:
            try: data["ano"] = int(yr.get_text(strip=True))
            except: pass
        if "ano" not in data:
            m = re.search(r"\b(20\d{2})\b", r.text)
            if m: data["ano"] = int(m.group(1))

        # ── Perfumer ──────────────────────────────────────────────────────
        pf = soup.find("a", href=re.compile(r"/noses/"))
        if pf: data["perfumista"] = pf.get_text(strip=True)

        # ── Notes from JSON-LD ────────────────────────────────────────────
        notes_top, notes_mid, notes_base = [], [], []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                jd = json.loads(script.string or "")
                desc = ""
                if isinstance(jd, dict):
                    desc = jd.get("description", "")
                    if not desc and "aggregateRating" in jd:
                        desc = ""
                    if jd.get("name") and "nome" not in data:
                        raw_name = jd["name"]
                        if " " in raw_name and "marca" in data:
                            data["nome"] = raw_name.replace(data["marca"], "").strip()

                if desc:
                    top_m  = re.search(r"[Tt]op notes? (?:are )?(.+?)(?:;|\.|\bmiddle\b|\bheart\b|\bbase\b)", desc, re.I)
                    mid_m  = re.search(r"(?:middle|heart) notes? (?:are )?(.+?)(?:;|\.|\bbase\b)", desc, re.I)
                    base_m = re.search(r"base notes? (?:are )?(.+?)(?:;|\.|$)", desc, re.I)

                    if top_m:  notes_top  = parse_notes(top_m.group(1),  8)
                    if mid_m:  notes_mid  = parse_notes(mid_m.group(1),  7)
                    if base_m: notes_base = parse_notes(base_m.group(1), 6)

                    data.setdefault("descricao", desc[:500])
                    if notes_top: break
            except: pass

        # ── Notes fallback: page text ─────────────────────────────────────
        if not notes_top:
            txt = soup.get_text(" ", strip=True)
            top_m  = re.search(r"[Tt]op notes? (?:are )?(.+?)(?:middle|heart|base|\n)", txt, re.I)
            mid_m  = re.search(r"(?:middle|heart) notes? (?:are )?(.+?)(?:base|\n)", txt, re.I)
            base_m = re.search(r"base notes? (?:are )?(.+?)(?:\n|$)", txt, re.I)
            if top_m:  notes_top  = parse_notes(top_m.group(1),  8)
            if mid_m:  notes_mid  = parse_notes(mid_m.group(1),  7)
            if base_m: notes_base = parse_notes(base_m.group(1), 6)

        data["notas_topo"]    = notes_top[:8]
        data["notas_coracao"] = notes_mid[:8]
        data["notas_fundo"]   = notes_base[:8]

        # ── Accords from inline styles ─────────────────────────────────────
        accords = []
        seen = set()
        for el in soup.find_all(style=re.compile(r"width:\s*[\d.]+%")):
            style = el.get("style", "")
            wm = re.search(r"width:\s*([\d.]+)%", style)
            if not wm: continue
            pct = float(wm.group(1))
            if pct < 5: continue
            name = el.get_text(strip=True)
            name = re.sub(r"[\d.%]+", "", name).strip()
            if name and len(name) > 1 and len(name) < 30 and name.lower() not in seen:
                seen.add(name.lower())
                accords.append({"nome": name, "porcentagem": round(pct, 1)})

        data["acordes"] = sorted(accords, key=lambda x: -x["porcentagem"])[:8]

        # ── Seasonality ───────────────────────────────────────────────────
        page_text = soup.get_text(" ")
        seasons = []
        for en, pt in [("Spring","Primavera"),("Summer","Verão"),("Fall","Outono"),("Autumn","Outono"),("Winter","Inverno")]:
            if en in page_text: seasons.append(pt)
        if seasons: data["estacoes"] = list(dict.fromkeys(seasons))

        times = []
        for en, pt in [("Morning","Manhã"),("Day","Tarde"),("Evening","Noite"),("Night","Noite")]:
            if en in page_text: times.append(pt)
        if times: data["horarios"] = list(dict.fromkeys(times))

        # ── Performance ───────────────────────────────────────────────────
        for kw, val in [("Eternal","Excelente"),("Very Long","Excelente"),("Long lasting","Boa"),("Moderate","Moderada"),("Weak","Fraca"),("Poor","Fraca")]:
            if kw in page_text: data.setdefault("longevidade", val); break
        for kw, val in [("Enormous","Bestial"),("Beast","Bestial"),("Strong","Forte"),("Moderate","Moderada"),("Soft","Íntima"),("Intimate","Íntima")]:
            if kw in page_text: data.setdefault("projecao", val); break

        # ── Concentration ─────────────────────────────────────────────────
        for c, v in [("Extrait","Extrait"),("Eau de Parfum","EDP"),("EDP","EDP"),("Eau de Toilette","EDT"),("EDT","EDT"),("EDC","EDC"),("Cologne","EDC")]:
            if c in r.text: data.setdefault("concentracao", v); break

        data.setdefault("genero", "Unissex")
        data.setdefault("concentracao", "EDP")
        data.setdefault("familia", "Não classificada")
        return data

    except Exception as e:
        return {"erro": str(e)}

def search_and_scrape(query: str) -> dict:
    scraper = get_scraper()
    try:
        url = f"https://www.fragrantica.com/search/?query={query.replace(' ', '+')}"
        r   = scraper.get(url, timeout=20)
        soup = BeautifulSoup(r.text, "lxml")
        for a in soup.find_all("a", href=re.compile(r"/perfume/[^/]+/[^/]+-\d+\.html")):
            href = a.get("href", "")
            full = href if href.startswith("http") else "https://www.fragrantica.com" + href
            return scrape_url(full)
        return {"erro": f"Nenhum resultado encontrado para '{query}'"}
    except Exception as e:
        return {"erro": str(e)}

def scrape_ml_price(nome: str, marca: str) -> dict:
    scraper = get_scraper()
    try:
        q   = f"{marca} {nome} perfume".replace(" ", "%20")
        url = f"https://lista.mercadolivre.com.br/{q}"
        r   = scraper.get(url, timeout=20)
        soup = BeautifulSoup(r.text, "lxml")
        prices = []
        for el in soup.find_all(class_=re.compile(r"price__fraction|andes-money-amount__fraction", re.I)):
            txt = el.get_text(strip=True).replace(".","").replace(",","")
            if txt.isdigit():
                p = int(txt)
                if 80 < p < 25000:
                    prices.append(p)
        if prices:
            prices.sort()
            trim = max(1, len(prices)//5)
            mid  = prices[trim:-trim] if len(prices) > 4 else prices
            return {
                "preco_brl": round(sum(mid)/len(mid)),
                "preco_min": prices[0],
                "preco_max": prices[-1],
                "fonte": "Mercado Livre",
                "amostras": len(prices),
            }
        return {"preco_brl": 0, "fonte": "Não encontrado"}
    except Exception as e:
        return {"preco_brl": 0, "fonte": f"Erro: {e}"}

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "version": "3.0"})

@app.route("/api/perfume/search", methods=["POST"])
def api_search():
    body  = request.get_json(force=True) or {}
    query = (body.get("query") or "").strip()
    if not query: return jsonify({"erro": "Campo 'query' obrigatório"}), 400
    result = search_and_scrape(query)
    return jsonify(result), (500 if "erro" in result else 200)

@app.route("/api/perfume/url", methods=["POST"])
def api_url():
    body = request.get_json(force=True) or {}
    url  = (body.get("url") or "").strip()
    if not url or "fragrantica" not in url:
        return jsonify({"erro": "URL do Fragrantica obrigatória"}), 400
    result = scrape_url(url)
    return jsonify(result), (500 if "erro" in result else 200)

@app.route("/api/price/br", methods=["POST"])
def api_price():
    body  = request.get_json(force=True) or {}
    nome  = (body.get("nome")  or "").strip()
    marca = (body.get("marca") or "").strip()
    if not nome: return jsonify({"erro": "Campo 'nome' obrigatório"}), 400
    return jsonify(scrape_ml_price(nome, marca))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n🫧  Perfume Vault Backend v3  →  http://0.0.0.0:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
