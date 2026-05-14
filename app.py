"""
Perfume Vault Backend — Render.com Ready
Scrapes Fragrantica in real-time using Playwright (Chromium headless).
"""

import re, json, time, threading, os
from flask import Flask, jsonify, request
from bs4 import BeautifulSoup

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

# ── Playwright singleton ──────────────────────────────────────────────────────
from playwright.sync_api import sync_playwright

_pw      = None
_browser = None
_lock    = threading.Lock()

def get_browser():
    global _pw, _browser
    if _browser is None or not _browser.is_connected():
        if _pw:
            try: _pw.stop()
            except: pass
        _pw = sync_playwright().start()
        _browser = _pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-setuid-sandbox",
                "--no-zygote",
                "--single-process",
                "--disable-blink-features=AutomationControlled",
            ],
        )
    return _browser

def new_page():
    ctx = get_browser().new_context(
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 800},
        locale="pt-BR",
        extra_http_headers={
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "DNT": "1",
        },
    )
    page = ctx.new_page()
    page.add_init_script(
        "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
    )
    return page, ctx

# ── Fragrantica scraper ───────────────────────────────────────────────────────
def scrape_url(url: str) -> dict:
    with _lock:
        page, ctx = new_page()
        try:
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            time.sleep(2)
            html = page.content()
            soup = BeautifulSoup(html, "lxml")
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
            # Try itemprop first, then og:image meta
            img = soup.find("img", {"itemprop": "image"})
            if not img:
                og = soup.find("meta", property="og:image")
                if og: data["imagem"] = og.get("content","")
            if img:
                src = img.get("src") or img.get("data-src","")
                if src and not src.startswith("data:"):
                    data["imagem"] = src if src.startswith("http") else "https://www.fragrantica.com" + src

            # ── Year ──────────────────────────────────────────────────────────
            for tag in soup.find_all(attrs={"itemprop": "releaseYear"}):
                val = tag.get_text(strip=True)
                if val.isdigit(): data["ano"] = int(val); break
            if "ano" not in data:
                m = re.search(r"\b(20\d{2})\b", html)
                if m: data["ano"] = int(m.group(1))

            # ── Perfumer ──────────────────────────────────────────────────────
            pf = soup.find("a", href=re.compile(r"/noses/"))
            if pf: data["perfumista"] = pf.get_text(strip=True)

            # ── Rating ────────────────────────────────────────────────────────
            rv = soup.find(attrs={"itemprop": "ratingValue"})
            if rv:
                try: data["fragrantica_nota"] = float(rv.get_text(strip=True))
                except: pass
            rc = soup.find(attrs={"itemprop": "ratingCount"})
            if rc:
                try: data["votos_comunidade"] = int(rc.get_text(strip=True).replace(",","").replace(".",""))
                except: pass

            # ── Notes pyramid ─────────────────────────────────────────────────
            # Strategy A: JSON-LD description
            notes_top, notes_mid, notes_base = [], [], []
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    jd = json.loads(script.string or "")
                    desc = jd.get("description","") if isinstance(jd,dict) else ""
                    if not desc: continue
                    def parse(pattern, peso):
                        m = re.search(pattern, desc, re.I)
                        if not m: return []
                        return [{"nome": n.strip(), "peso": peso}
                                for n in re.split(r"[,;]|\band\b", m.group(1))
                                if 2 < len(n.strip()) < 35]
                    notes_top  = parse(r"[Tt]op notes?\s+(?:are\s+)?(.+?)(?:\s*;\s*|[Mm]iddle|[Hh]eart|[Bb]ase|\.)", 8)
                    notes_mid  = parse(r"(?:[Mm]iddle|[Hh]eart) notes?\s+(?:are\s+)?(.+?)(?:\s*;\s*|[Bb]ase|\.)", 7)
                    notes_base = parse(r"[Bb]ase notes?\s+(?:are\s+)?(.+?)(?:\s*;|\.|\Z)", 6)
                    if jd.get("name") and "nome" not in data:
                        data["nome"] = jd["name"]
                    if desc: data.setdefault("descricao", desc[:500])
                    if notes_top: break
                except: pass

            # Strategy B: page text
            if not notes_top:
                txt = soup.get_text(" ")
                def parse_txt(pat, peso):
                    m = re.search(pat, txt, re.I)
                    if not m: return []
                    items = re.split(r"[,;]|\band\b", m.group(1))
                    return [{"nome": i.strip(), "peso": peso} for i in items if 2 < len(i.strip()) < 35]
                notes_top  = parse_txt(r"[Tt]op notes?\s+(?:are\s+)?(.+?)(?:[Mm]iddle|[Hh]eart|[Bb]ase|\n)", 8)
                notes_mid  = parse_txt(r"(?:[Mm]iddle|[Hh]eart) notes?\s+(?:are\s+)?(.+?)(?:[Bb]ase|\n)", 7)
                notes_base = parse_txt(r"[Bb]ase notes?\s+(?:are\s+)?(.+?)(?:\n|$)", 6)

            # Strategy C: JS rendered note spans
            if not notes_top:
                try:
                    js_notes = page.evaluate("""
                    () => {
                        const layers = {top:[], mid:[], base:[]};
                        document.querySelectorAll('[class*="pyramid"] [class*="accord"], [class*="note"]').forEach(el => {
                            const txt = el.textContent.trim();
                            if (txt && txt.length < 35 && txt.length > 2) {
                                const rect = el.getBoundingClientRect();
                                if (rect.top < 400) layers.top.push(txt);
                                else if (rect.top < 600) layers.mid.push(txt);
                                else layers.base.push(txt);
                            }
                        });
                        return layers;
                    }
                    """)
                    if js_notes.get("top"):
                        notes_top  = [{"nome": n, "peso": 8} for n in js_notes["top"][:8]]
                        notes_mid  = [{"nome": n, "peso": 7} for n in js_notes["mid"][:8]]
                        notes_base = [{"nome": n, "peso": 6} for n in js_notes["base"][:8]]
                except: pass

            data["notas_topo"]    = notes_top[:8]
            data["notas_coracao"] = notes_mid[:8]
            data["notas_fundo"]   = notes_base[:8]

            # ── Accords ───────────────────────────────────────────────────────
            accords = []
            try:
                accords = page.evaluate("""
                () => {
                    const results = [];
                    const seen = new Set();
                    // Method 1: rendered accord bars with inline width style
                    document.querySelectorAll('[style*="width"]').forEach(el => {
                        const style = el.getAttribute('style') || '';
                        const wm = style.match(/width:\\s*([\\d.]+)%/);
                        if (!wm) return;
                        const pct = parseFloat(wm[1]);
                        if (pct < 5 || pct > 100) return;
                        // find sibling or child text
                        const parent = el.parentElement;
                        if (!parent) return;
                        const name = (parent.textContent || '').replace(/[\\d.%]/g,'').trim();
                        if (name && name.length > 1 && name.length < 30 && !seen.has(name.toLowerCase())) {
                            seen.add(name.toLowerCase());
                            results.push({nome: name, porcentagem: pct});
                        }
                    });
                    // Method 2: data-* attributes
                    document.querySelectorAll('[data-width],[data-accord]').forEach(el => {
                        const name = el.dataset.accord || el.textContent.trim();
                        const pct  = parseFloat(el.dataset.width || '0');
                        if (name && pct > 5 && !seen.has(name.toLowerCase())) {
                            seen.add(name.toLowerCase());
                            results.push({nome: name, porcentagem: pct});
                        }
                    });
                    return results.sort((a,b) => b.porcentagem - a.porcentagem).slice(0, 8);
                }
                """)
            except: pass

            # Fallback: parse CSS from style tags
            if not accords:
                for style in soup.find_all("style"):
                    for m in re.finditer(r'\.accord.*?{.*?width:\s*([\d.]+)%', style.string or "", re.S):
                        pass  # too noisy, skip

            data["acordes"] = [a for a in accords if a.get("nome") and a.get("porcentagem",0)>0]

            # ── Seasonality / Time / Performance ─────────────────────────────
            page_text = soup.get_text(" ", strip=True)

            seasons = []
            for en, pt in [("Spring","Primavera"),("Summer","Verão"),("Fall","Outono"),("Autumn","Outono"),("Winter","Inverno")]:
                if en in page_text: seasons.append(pt)
            if seasons: data["estacoes"] = list(dict.fromkeys(seasons))

            times = []
            for en, pt in [("Morning","Manhã"),("Day","Tarde"),("Evening","Noite"),("Night","Noite")]:
                if en in page_text: times.append(pt)
            if times: data["horarios"] = list(dict.fromkeys(times))

            lon_map  = {"Poor":"Fraca","Weak":"Fraca","Moderate":"Moderada","Long":"Boa","Very Long":"Excelente","Eternal":"Excelente"}
            proj_map = {"Intimate":"Íntima","Soft":"Íntima","Moderate":"Moderada","Strong":"Forte","Enormous":"Bestial","Beast":"Bestial"}
            for kw, val in lon_map.items():
                if kw in page_text: data.setdefault("longevidade", val); break
            for kw, val in proj_map.items():
                if kw in page_text: data.setdefault("projecao", val); break

            # ── Concentration ─────────────────────────────────────────────────
            for c in ["Parfum","Extrait","EDP","Eau de Parfum","EDT","Eau de Toilette","EDC","Cologne"]:
                if c in html:
                    data.setdefault("concentracao", "EDP" if "Parfum" in c else ("EDT" if "Toilette" in c else c))
                    break

            data.setdefault("genero", "Unissex")
            data.setdefault("concentracao", "EDP")
            data.setdefault("familia", "Não classificada")

            return data

        except Exception as e:
            print(f"[ERROR] scrape_url {url}: {e}")
            return {"erro": str(e), "url": url}
        finally:
            ctx.close()

def search_and_scrape(query: str) -> dict:
    """Search Fragrantica, get first result URL, scrape it."""
    search_url = f"https://www.fragrantica.com/search/?query={query.replace(' ', '+')}"
    with _lock:
        page, ctx = new_page()
        try:
            page.goto(search_url, timeout=20000, wait_until="domcontentloaded")
            time.sleep(1.5)
            links = page.query_selector_all('a[href*="/perfume/"]')
            best = None
            for link in links:
                href = link.get_attribute("href") or ""
                if re.search(r"/perfume/[^/]+/[^/]+-\d+\.html", href):
                    best = href if href.startswith("http") else "https://www.fragrantica.com" + href
                    break
        except Exception as e:
            return {"erro": f"Busca falhou: {e}"}
        finally:
            ctx.close()

    if not best:
        return {"erro": f"Nenhum resultado encontrado para '{query}'"}
    return scrape_url(best)

def scrape_ml_price(nome: str, marca: str) -> dict:
    """Scrape Mercado Livre for BR prices."""
    q   = f"{marca} {nome} perfume".replace(" ", "%20")
    url = f"https://lista.mercadolivre.com.br/{q}"
    with _lock:
        page, ctx = new_page()
        try:
            page.goto(url, timeout=20000, wait_until="domcontentloaded")
            time.sleep(1)
            html = page.content()
            soup = BeautifulSoup(html, "lxml")
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
                    "url_busca": url,
                }
            return {"preco_brl": 0, "fonte": "Não encontrado no Mercado Livre"}
        except Exception as e:
            return {"preco_brl": 0, "fonte": f"Erro: {e}"}
        finally:
            ctx.close()

# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "version": "2.0"})

@app.route("/api/perfume/search", methods=["POST"])
def api_search():
    body  = request.get_json(force=True) or {}
    query = (body.get("query") or "").strip()
    if not query: return jsonify({"erro": "Campo 'query' obrigatório"}), 400
    result = search_and_scrape(query)
    return jsonify(result), (500 if result.get("erro") else 200)

@app.route("/api/perfume/url", methods=["POST"])
def api_url():
    body = request.get_json(force=True) or {}
    url  = (body.get("url") or "").strip()
    if not url or "fragrantica" not in url:
        return jsonify({"erro": "URL do Fragrantica obrigatória"}), 400
    result = scrape_url(url)
    return jsonify(result), (500 if result.get("erro") else 200)

@app.route("/api/price/br", methods=["POST"])
def api_price():
    body  = request.get_json(force=True) or {}
    nome  = (body.get("nome")  or "").strip()
    marca = (body.get("marca") or "").strip()
    if not nome: return jsonify({"erro": "Campo 'nome' obrigatório"}), 400
    return jsonify(scrape_ml_price(nome, marca))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n🫧  Perfume Vault Backend  →  http://0.0.0.0:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=False)
