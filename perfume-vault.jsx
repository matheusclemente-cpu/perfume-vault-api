import { useState, useRef, useEffect } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CLAUDE_API = "https://api.anthropic.com/v1/messages";
const STORAGE_KEY_BACKEND = "pv_backend_url";
const DEFAULT_BACKEND = "https://perfume-vault-api.onrender.com"; // troque pela sua URL

const TABS = ["Coleção", "Wishlist", "Perfil", "Descobrir"];

const ACCORD_COLORS = {
  "Cítrico":"#F9A825","Cítrico Fresco":"#FDD835","Amadeirado":"#8B6914",
  "Floral":"#E91E63","Oriental":"#7B1FA2","Aquático":"#0277BD",
  "Fougère":"#2E7D32","Chypre":"#795548","Gourmand":"#BF360C",
  "Couro":"#6D4C41","Aromático":"#00695C","Almiscarado":"#9E9E9E",
  "Baunilha":"#D4A017","Defumado":"#546E7A","Verde":"#66BB6A",
  "Especiado":"#FF7043","Frutal":"#F06292","Resinoso":"#5D4037",
  "Patchouli":"#4A148C","Âmbar":"#FF8F00","Salgado":"#0097A7",
  "Terroso":"#795548","Fresco":"#00ACC1","Doce":"#F48FB1",
  "Empudrado":"#CE93D8","Herbáceo":"#AED581","Gengibre":"#FF7043",
  "Citrus":"#F9A825","Woody":"#8B6914","Musky":"#9E9E9E",
  "Powdery":"#CE93D8","Fresh":"#00ACC1","Spicy":"#FF7043",
};

const NOTE_EMOJIS = {
  bergamot:"🍋",bergamota:"🍋",grapefruit:"🍊",toranja:"🍊",lemon:"🍋",limão:"🍋",
  orange:"🍊",laranja:"🍊",apple:"🍎",maçã:"🍎",pear:"🍐",pêra:"🍐",peach:"🍑",
  pêssego:"🍑",raspberry:"🫐",framboesa:"🫐",strawberry:"🍓",morango:"🍓",
  vanilla:"🍦",baunilha:"🍦",musk:"🌫️",almíscar:"🌫️",sandalwood:"🪵",sândalo:"🪵",
  cedar:"🌲",cedro:"🌲",vetiver:"🌿",patchouli:"🍂",rose:"🌹",rosa:"🌹",
  jasmine:"🌸",jasmim:"🌸",iris:"💜",íris:"💜",orris:"💜",violet:"💐",
  violeta:"💐",lavender:"🔵",lavanda:"🔵",pepper:"🌶️",pimenta:"🌶️",
  cinnamon:"🌰",canela:"🌰",ginger:"🫚",gengibre:"🫚",amber:"✨",âmbar:"✨",
  incense:"🕯️",incenso:"🕯️",tonka:"☕",coffee:"☕",café:"☕",magnolia:"🌺",
  magnólia:"🌺",herbal:"🌿",herbáceo:"🌿",powdery:"🪞",empudrado:"🪞",
  wood:"🪵",madeira:"🪵",citrus:"🍋",cítrico:"🍋",green:"🌿",verde:"🌿",
  aquatic:"💧",aquático:"💧",marine:"🌊",marinha:"🌊",leather:"🤎",couro:"🤎",
  tobacco:"🍂",tabaco:"🍂",oakmoss:"🌲",smoke:"💨",defumado:"💨",
};

const SEASON_ICONS = {Primavera:"🌸",Verão:"☀️",Outono:"🍂",Inverno:"❄️",Spring:"🌸",Summer:"☀️",Fall:"🍂",Autumn:"🍂",Winter:"❄️"};
const TIME_ICONS   = {Manhã:"🌅",Tarde:"🌞",Noite:"🌙",Morning:"🌅",Day:"🌞",Evening:"🌙",Night:"🌙"};
const OCC_ICONS    = {Casual:"👕",Escritório:"💼",Social:"🎉",Romântico:"❤️",Especial:"⭐",Esportivo:"🏃"};

function getAccordColor(name) {
  if (!name) return "#888";
  const l = name.toLowerCase();
  for (const [k,c] of Object.entries(ACCORD_COLORS)) {
    if (l.includes(k.toLowerCase())) return c;
  }
  const h = [...name].reduce((a,c)=>a+c.charCodeAt(0),0);
  return `hsl(${(h*47)%360},52%,45%)`;
}

function getNoteEmoji(n) {
  const l = (n||"").toLowerCase();
  for (const [k,v] of Object.entries(NOTE_EMOJIS)) {
    if (l.includes(k)) return v;
  }
  return "🌿";
}

// ─── BACKEND API ──────────────────────────────────────────────────────────────
function getBackendUrl() {
  try { return localStorage.getItem(STORAGE_KEY_BACKEND) || DEFAULT_BACKEND; } catch { return DEFAULT_BACKEND; }
}
function setBackendUrl(url) {
  try { localStorage.setItem(STORAGE_KEY_BACKEND, url); } catch {}
}

async function apiFetch(endpoint, body) {
  const base = getBackendUrl().replace(/\/$/, "");
  const r = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json();
  if (data.erro) throw new Error(data.erro);
  return data;
}

async function checkBackend() {
  try {
    const base = getBackendUrl().replace(/\/$/, "");
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch { return false; }
}

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
async function callClaude(messages, system, maxTokens=1200) {
  const r = await fetch(CLAUDE_API, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens, system, messages }),
  });
  const d = await r.json();
  return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
}

async function buildProfile(perfumes) {
  const system = `Especialista em perfumaria. JSON apenas:
{"familias":[{"nome":"string","porcentagem":number}],"acordes":[{"nome":"string","porcentagem":number}],
"notas_topo_fav":["string"],"notas_coracao_fav":["string"],"notas_fundo_fav":["string"],
"resumo":"string","personalidade":"string","estacoes_pref":["string"],"horarios_pref":["string"],
"ocasioes_pref":["string"],"dna_olfativo":["string"],"caracteristicas":["string"],"evitar":["string"]}`;
  const lista = perfumes.map(p=>
    `${p.nome} (${p.marca}) nota:${p.minha_nota??0}/10 família:${p.familia} acordes:[${p.acordes?.slice(0,4).map(a=>a.nome).join(",")}] topo:[${p.notas_topo?.map(n=>n.nome||n).join(",")}] coração:[${p.notas_coracao?.map(n=>n.nome||n).join(",")}] fundo:[${p.notas_fundo?.map(n=>n.nome||n).join(",")}] estações:[${p.estacoes?.join(",")}]`
  ).join("\n");
  const raw = await callClaude([{role:"user",content:`Coleção real do usuário:\n${lista}`}], system, 1500);
  try { return JSON.parse(raw.replace(/```json|```/g,"").trim()); } catch { return null; }
}

async function matchPerfume(perfume, profile) {
  const system = `Especialista. JSON: {"porcentagem":number,"razao":"string","pontos_fortes":["string"],"pontos_fracos":["string"]}`;
  const raw = await callClaude(
    [{role:"user",content:`Perfil: ${JSON.stringify(profile)}\nPerfume: ${JSON.stringify({nome:perfume.nome,familia:perfume.familia,acordes:perfume.acordes?.slice(0,5),estacoes:perfume.estacoes})}`}],
    system, 500
  );
  try { return JSON.parse(raw.replace(/```json|```/g,"").trim()); } catch { return {porcentagem:50,razao:"—",pontos_fortes:[],pontos_fracos:[]}; }
}

async function discoverPerfumes(profile, collection) {
  const system = `Especialista em perfumaria. JSON array de 6 perfumes reais:
[{"nome":"string","marca":"string","razao":"string","familia":"string","notas_principais":["string"],"porcentagem":number,"concentracao":"string","estacoes":["string"]}]`;
  const raw = await callClaude(
    [{role:"user",content:`Perfil: ${JSON.stringify(profile)}\nNão recomendar: ${collection.map(p=>p.nome).join(", ")}\nRecomende 6 perfumes reais bem avaliados no Fragrantica.`}],
    system, 1200
  );
  try { const p=JSON.parse(raw.replace(/```json|```/g,"").trim()); return Array.isArray(p)?p:[]; } catch { return []; }
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function Dots({ color="#D4A843" }) {
  return (
    <span style={{display:"inline-flex",gap:3,alignItems:"center"}}>
      {[0,1,2].map(i=>(
        <span key={i} style={{width:5,height:5,borderRadius:"50%",background:color,
          animation:"pulse 1.2s ease-in-out infinite",
          animationDelay:`${i*0.2}s`,display:"inline-block"}}/>
      ))}
    </span>
  );
}

function AccordBar({name, pct, max}) {
  const color = getAccordColor(name);
  const w = Math.min(100, Math.round((pct/(max||100))*100));
  return (
    <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
        <span style={{fontSize:12,color:"#ddd"}}>{name}</span>
        <span style={{fontSize:11,color,fontWeight:700}}>{Math.round(pct)}%</span>
      </div>
      <div style={{height:11,background:"#181818",borderRadius:6,overflow:"hidden"}}>
        <div style={{width:`${w}%`,height:"100%",background:color,borderRadius:6,transition:"width 0.9s ease",
          boxShadow:`inset 0 1px 0 rgba(255,255,255,0.2),0 0 8px ${color}55`}}/>
      </div>
    </div>
  );
}

function NoteChip({note, size="md"}) {
  const nm = typeof note==="string"?note:note?.nome||"";
  const emoji = getNoteEmoji(nm);
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,background:"#181818",border:"1px solid #2a2a2a",
      borderRadius:20,padding:size==="sm"?"3px 8px":"4px 11px",fontSize:size==="sm"?10:12,color:"#ccc",margin:"2px 3px 2px 0"}}>
      <span style={{fontSize:size==="sm"?12:14}}>{emoji}</span>{nm}
    </span>
  );
}

function SBadge({label, icon}) {
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,background:"#141414",border:"1px solid #252525",
      borderRadius:8,padding:"4px 10px",fontSize:11,color:"#aaa",margin:"2px 3px 2px 0"}}>
      {icon} {label}
    </span>
  );
}

function Ring({value, max=100, color, label, size=60}) {
  const pct = Math.min(1, value/max);
  const r = (size-10)/2;
  const circ = 2*Math.PI*r;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e1e1e" strokeWidth={5}/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${pct*circ} ${circ}`} strokeLinecap="round" style={{transition:"stroke-dasharray 1s ease"}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:size*0.22,fontWeight:700,color,fontFamily:"Georgia,serif"}}>{Math.round(value)}</span>
        </div>
      </div>
      <span style={{fontSize:10,color:"#555"}}>{label}</span>
    </div>
  );
}

function MyRating({value, onChange}) {
  const c = value===0?"#333":value>=8?"#4CAF50":value>=6?"#D4A843":value>=4?"#FF9800":"#e57373";
  const lbl = ["—","Horrível","Ruim","Não curti","Mediano","Ok","Bom","Muito bom","Ótimo","Excelente","Perfeito!"][value];
  return (
    <div style={{background:"#0d0d0d",borderRadius:10,padding:"10px 12px",marginTop:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:"0.1em"}}>Minha nota</span>
        <div style={{display:"flex",alignItems:"baseline",gap:4}}>
          <span style={{fontSize:20,fontWeight:700,color:c,fontFamily:"Georgia,serif"}}>{value}</span>
          <span style={{fontSize:10,color:"#444"}}>/10</span>
          <span style={{fontSize:10,color:c,marginLeft:4,fontStyle:"italic"}}>{lbl}</span>
        </div>
      </div>
      <input type="range" min={0} max={10} step={1} value={value}
        onChange={e=>onChange(Number(e.target.value))} style={{width:"100%",cursor:"pointer",accentColor:c}}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
        {["0","5","10"].map(n=><span key={n} style={{fontSize:9,color:"#333"}}>{n}</span>)}
      </div>
    </div>
  );
}

// ─── BOTTLE ───────────────────────────────────────────────────────────────────
function Bottle({nome, marca, color, imagem, size=52}) {
  const c = color||getAccordColor(nome);
  const [imgOk, setImgOk] = useState(!!imagem);
  if (imagem && imgOk) {
    return (
      <div style={{width:size,height:size*1.4,borderRadius:8,overflow:"hidden",flexShrink:0,border:`1.5px solid ${c}55`,background:"#0a0a0a"}}>
        <img src={imagem} alt={nome} onError={()=>setImgOk(false)}
          style={{width:"100%",height:"100%",objectFit:"contain"}}/>
      </div>
    );
  }
  return (
    <div style={{width:size,height:size*1.4,borderRadius:size*0.13,flexShrink:0,
      background:`linear-gradient(145deg,${c}33,${c}99,${c}cc)`,border:`1.5px solid ${c}88`,
      position:"relative",overflow:"hidden",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"flex-end",boxShadow:`0 4px 14px ${c}44`}}>
      <div style={{position:"absolute",top:0,left:"10%",width:"28%",height:"50%",background:"rgba(255,255,255,0.22)",borderRadius:"0 0 50% 50%"}}/>
      <div style={{position:"absolute",top:0,left:"28%",width:"44%",height:"20%",background:`${c}dd`,borderRadius:"3px 3px 0 0"}}/>
      <div style={{position:"absolute",top:0,left:"23%",width:"54%",height:"10%",background:"#D4A843",borderRadius:"3px 3px 0 0"}}/>
      <div style={{fontSize:size*0.28,color:"rgba(255,255,255,0.9)",fontWeight:700,fontFamily:"Georgia,serif",zIndex:1,marginBottom:size*0.06}}>
        {(nome||"?")[0].toUpperCase()}
      </div>
      <div style={{fontSize:size*0.1,color:"rgba(255,255,255,0.5)",letterSpacing:"0.03em",textTransform:"uppercase",zIndex:1,marginBottom:size*0.06,maxWidth:"90%",overflow:"hidden",textAlign:"center",textOverflow:"ellipsis",whiteSpace:"nowrap",padding:"0 2px"}}>
        {(marca||"").slice(0,10)}
      </div>
    </div>
  );
}

// ─── PREVIEW DRAWER ───────────────────────────────────────────────────────────
function Preview({perfume, isWishlist, onConfirm, onCancel}) {
  const fc = getAccordColor(perfume.acordes?.[0]?.nome||perfume.familia);
  const maxA = Math.max(...(perfume.acordes||[{porcentagem:1}]).map(a=>a.porcentagem));
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",zIndex:300,display:"flex",alignItems:"flex-end"}}>
      <div style={{background:"#0b0b0b",borderTop:`2px solid ${fc}77`,borderRadius:"20px 20px 0 0",
        width:"100%",maxHeight:"92vh",overflowY:"auto",padding:"14px 16px 44px"}}>
        <div style={{width:36,height:4,background:"#2a2a2a",borderRadius:2,margin:"0 auto 16px"}}/>

        <div style={{display:"flex",gap:14,marginBottom:14,alignItems:"flex-start"}}>
          <Bottle nome={perfume.nome} marca={perfume.marca} color={fc} imagem={perfume.imagem} size={68}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"Georgia,serif",fontSize:16,color:"#F0E6C8",fontWeight:600,lineHeight:1.2}}>{perfume.nome}</div>
            <div style={{fontSize:11,color:"#666",margin:"4px 0 2px"}}>{perfume.marca}{perfume.perfumista?` · ${perfume.perfumista}`:""}</div>
            <div style={{fontSize:11,color:"#444"}}>{[perfume.concentracao,perfume.ano].filter(Boolean).join(" · ")}</div>
            {perfume.fragrantica_nota>0&&(
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
                <span style={{fontSize:13,color:"#D4A843"}}>⭐</span>
                <span style={{fontSize:13,color:"#D4A843",fontWeight:700}}>{Number(perfume.fragrantica_nota).toFixed(2)}</span>
                {perfume.votos_comunidade>0&&<span style={{fontSize:9,color:"#444"}}>({perfume.votos_comunidade?.toLocaleString()} votos)</span>}
              </div>
            )}
            <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
              {[perfume.familia,perfume.genero].filter(Boolean).map(v=>(
                <span key={v} style={{background:`${fc}22`,border:`1px solid ${fc}44`,borderRadius:12,color:fc,fontSize:10,padding:"2px 8px"}}>{v}</span>
              ))}
            </div>
          </div>
        </div>

        {perfume.acordes?.length>0&&(
          <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:12,marginBottom:12}}>
            <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:10}}>Acordes</div>
            {perfume.acordes.slice(0,7).map(a=><AccordBar key={a.nome} name={a.nome} pct={a.porcentagem} max={maxA}/>)}
          </div>
        )}

        {(perfume.estacoes?.length||perfume.horarios?.length)>0&&(
          <div style={{marginBottom:12,display:"flex",flexWrap:"wrap",gap:4}}>
            {perfume.estacoes?.map(s=><SBadge key={s} label={s} icon={SEASON_ICONS[s]||"🌟"}/>)}
            {perfume.horarios?.map(h=><SBadge key={h} label={h} icon={TIME_ICONS[h]||"⏰"}/>)}
            {perfume.ocasioes?.map(o=><SBadge key={o} label={o} icon={OCC_ICONS[o]||"✨"}/>)}
          </div>
        )}

        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {[["Longevidade",perfume.longevidade],["Projeção",perfume.projecao]].map(([k,v])=>v&&(
            <div key={k} style={{flex:1,background:"#0e0e0e",border:"1px solid #1a1a1a",borderRadius:8,padding:"6px 8px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"#555",textTransform:"uppercase"}}>{k}</div>
              <div style={{fontSize:11,color:"#ccc",marginTop:2,fontWeight:600}}>{v}</div>
            </div>
          ))}
        </div>

        {[["notas_topo","#D4A843","TOPO"],["notas_coracao","#E91E63","CORAÇÃO"],["notas_fundo","#9C27B0","FUNDO"]].map(([key,col,lbl])=>
          perfume[key]?.length>0&&(
            <div key={key} style={{marginBottom:10}}>
              <div style={{fontSize:9,color:col,letterSpacing:"0.1em",marginBottom:5}}>{lbl}</div>
              {perfume[key].map(n=><NoteChip key={typeof n==="string"?n:n.nome} note={n}/>)}
            </div>
          )
        )}

        {perfume.descricao&&<p style={{fontSize:12,color:"#888",fontStyle:"italic",fontFamily:"Georgia,serif",lineHeight:1.7,margin:"10px 0 16px"}}>"{perfume.descricao}"</p>}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button onClick={onCancel} style={{background:"none",border:"1px solid #252525",borderRadius:12,color:"#555",padding:"13px",cursor:"pointer",fontSize:13,fontFamily:"Georgia,serif"}}>✕ Cancelar</button>
          <button onClick={onConfirm} style={{background:`linear-gradient(135deg,${fc}dd,${fc}88)`,border:"none",borderRadius:12,color:"#fff",padding:"13px",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"Georgia,serif"}}>
            {isWishlist?"✦ Quero este":"✦ Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────
function SettingsModal({onClose}) {
  const [url, setUrl] = useState(getBackendUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const base = url.replace(/\/$/, "");
      const r = await fetch(`${base}/api/health`, {signal: AbortSignal.timeout(8000)});
      setTestResult(r.ok ? "✅ Conectado!" : "❌ Erro na resposta");
    } catch(e) {
      setTestResult(`❌ ${e.message.includes("Failed to fetch")?"Servidor não encontrado":e.message}`);
    }
    setTesting(false);
  };

  const save = () => {
    setBackendUrl(url.trim());
    onClose();
    window.location.reload();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#0e0e0e",border:"1px solid #D4A84333",borderRadius:20,padding:24,width:"100%",maxWidth:360}}>
        <div style={{fontFamily:"Georgia,serif",fontSize:16,color:"#F0E6C8",marginBottom:4}}>⚙️ Configurações</div>
        <div style={{fontSize:11,color:"#555",marginBottom:20}}>URL do backend (Render.com)</div>

        <input value={url} onChange={e=>setUrl(e.target.value)}
          placeholder="https://perfume-vault-api.onrender.com"
          style={{width:"100%",background:"#0d0d0d",border:"1px solid #252525",borderRadius:10,color:"#F0E6C8",padding:"11px 14px",fontSize:12,outline:"none",fontFamily:"Georgia,serif",marginBottom:10}}/>

        {testResult&&<div style={{fontSize:11,marginBottom:10,color:testResult.includes("✅")?"#4CAF50":"#e06060"}}>{testResult}</div>}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          <button onClick={test} disabled={testing} style={{background:"#141414",border:"1px solid #252525",borderRadius:10,color:"#888",padding:"10px",cursor:"pointer",fontSize:12,fontFamily:"Georgia,serif"}}>
            {testing?<Dots/>:"🔍 Testar"}
          </button>
          <button onClick={save} style={{background:"linear-gradient(135deg,#D4A843,#8B6914)",border:"none",borderRadius:10,color:"#000",padding:"10px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"Georgia,serif"}}>
            💾 Salvar
          </button>
        </div>

        <div style={{background:"#0a0a0a",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
          <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Onde encontrar sua URL</div>
          <div style={{fontSize:11,color:"#777",lineHeight:1.6}}>
            1. Acesse <span style={{color:"#D4A843"}}>render.com</span><br/>
            2. Abra seu serviço <span style={{color:"#ccc"}}>perfume-vault-api</span><br/>
            3. Copie a URL no topo da página
          </div>
        </div>

        <button onClick={onClose} style={{width:"100%",background:"none",border:"1px solid #1a1a1a",borderRadius:10,color:"#444",padding:"10px",cursor:"pointer",fontSize:12,fontFamily:"Georgia,serif"}}>Fechar</button>
      </div>
    </div>
  );
}

// ─── PERFUME CARD ─────────────────────────────────────────────────────────────
function PerfumeCard({perfume, onDelete, onRatingChange, showMatch, match, extraFooter}) {
  const [open, setOpen] = useState(false);
  const fc = getAccordColor(perfume.acordes?.[0]?.nome||perfume.familia);
  const nota = perfume.minha_nota??0;
  const nc = nota===0?"#333":nota>=8?"#4CAF50":nota>=6?"#D4A843":nota>=4?"#FF9800":"#e57373";
  const maxA = Math.max(...(perfume.acordes||[{porcentagem:1}]).map(a=>a.porcentagem));
  const commPct = Math.round(((perfume.fragrantica_nota||0)/5)*100);
  const myPct   = Math.round((nota/10)*100);

  return (
    <div style={{background:"#101010",border:`1px solid ${fc}33`,borderRadius:16,marginBottom:10,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
        <Bottle nome={perfume.nome} marca={perfume.marca} color={fc} imagem={perfume.imagem} size={48}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"Georgia,serif",fontSize:13,color:"#F0E6C8",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{perfume.nome}</div>
          <div style={{fontSize:10,color:"#555",marginTop:1}}>{perfume.marca}{perfume.familia?` · ${perfume.familia}`:""}</div>
          <div style={{display:"flex",gap:8,marginTop:3,alignItems:"center",flexWrap:"wrap"}}>
            {perfume.fragrantica_nota>0&&<span style={{fontSize:10,color:"#D4A843"}}>⭐ {Number(perfume.fragrantica_nota).toFixed(2)}</span>}
            {nota>0&&<span style={{fontSize:10,color:nc}}>👤 {nota}/10</span>}
            {perfume.preco_brl>0&&<span style={{fontSize:10,color:"#4CAF50"}}>R$ {perfume.preco_brl}</span>}
            {perfume.estacoes?.slice(0,2).map(s=><span key={s} style={{fontSize:11}}>{SEASON_ICONS[s]||""}</span>)}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flexShrink:0}}>
          {showMatch&&match&&<span style={{fontSize:11,fontWeight:700,color:match.porcentagem>=70?"#4CAF50":match.porcentagem>=50?"#D4A843":"#e57373"}}>{Math.round(match.porcentagem)}%</span>}
          <span style={{color:"#333",fontSize:10,transform:open?"rotate(180deg)":"none",transition:"transform 0.3s",display:"inline-block"}}>▼</span>
        </div>
      </div>

      {open&&(
        <div style={{padding:"0 14px 14px",borderTop:"1px solid #181818"}}>
          <div style={{display:"flex",justifyContent:"space-around",padding:"14px 0 12px",borderBottom:"1px solid #181818",marginBottom:12}}>
            <Ring value={commPct} color="#D4A843" label="Fragrantica" size={60}/>
            <div style={{fontSize:9,color:"#2a2a2a",alignSelf:"center"}}>vs</div>
            <Ring value={myPct} color={nc} label="Minha nota" size={60}/>
          </div>

          {onRatingChange&&<MyRating value={nota} onChange={v=>onRatingChange(perfume.id,v)}/>}

          {showMatch&&match&&(
            <div style={{background:"#0a0d0a",border:"1px solid #1a2a1a",borderRadius:10,padding:10,marginTop:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:10,color:"#555",textTransform:"uppercase",letterSpacing:"0.08em"}}>Compatibilidade</span>
                <span style={{fontSize:13,fontWeight:700,color:match.porcentagem>=70?"#4CAF50":match.porcentagem>=50?"#D4A843":"#e57373"}}>{Math.round(match.porcentagem)}%</span>
              </div>
              <div style={{height:5,background:"#181818",borderRadius:3,overflow:"hidden",marginBottom:7}}>
                <div style={{width:`${match.porcentagem}%`,height:"100%",background:match.porcentagem>=70?"#4CAF50":match.porcentagem>=50?"#D4A843":"#e57373",borderRadius:3,transition:"width 1s"}}/>
              </div>
              <p style={{fontSize:11,color:"#666",margin:"0 0 5px",fontStyle:"italic",lineHeight:1.5}}>{match.razao}</p>
              {match.pontos_fortes?.length>0&&<div style={{fontSize:10,color:"#4CAF50"}}>{match.pontos_fortes.map(p=>`✦ ${p}`).join(" · ")}</div>}
            </div>
          )}

          {perfume.acordes?.length>0&&(
            <div style={{marginTop:12}}>
              <div style={{fontSize:9,color:"#444",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>Acordes</div>
              {perfume.acordes.slice(0,6).map(a=><AccordBar key={a.nome} name={a.nome} pct={a.porcentagem} max={maxA}/>)}
            </div>
          )}

          {(perfume.estacoes?.length||perfume.horarios?.length)>0&&(
            <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:4}}>
              {perfume.estacoes?.map(s=><SBadge key={s} label={s} icon={SEASON_ICONS[s]||"🌟"}/>)}
              {perfume.horarios?.map(h=><SBadge key={h} label={h} icon={TIME_ICONS[h]||"⏰"}/>)}
            </div>
          )}

          {[["notas_topo","#D4A843","TOPO"],["notas_coracao","#E91E63","CORAÇÃO"],["notas_fundo","#9C27B0","FUNDO"]].map(([key,col,lbl])=>
            perfume[key]?.length>0&&(
              <div key={key} style={{marginTop:9}}>
                <div style={{fontSize:9,color:col,marginBottom:4}}>{lbl}</div>
                {perfume[key].map(n=><NoteChip key={typeof n==="string"?n:n.nome} note={n} size="sm"/>)}
              </div>
            )
          )}

          {(perfume.preco_usd||perfume.preco_brl)&&(
            <div style={{display:"flex",gap:8,marginTop:12}}>
              {perfume.preco_usd>0&&<div style={{flex:1,background:"#0d0d0d",borderRadius:8,padding:"6px 10px",textAlign:"center"}}><div style={{fontSize:9,color:"#444",textTransform:"uppercase"}}>USD</div><div style={{fontSize:13,color:"#ccc",fontWeight:700}}>US$ {perfume.preco_usd}</div></div>}
              {perfume.preco_brl>0&&<div style={{flex:1,background:"#060e06",border:"1px solid #152015",borderRadius:8,padding:"6px 10px",textAlign:"center"}}><div style={{fontSize:9,color:"#2E7D32",textTransform:"uppercase"}}>Brasil</div><div style={{fontSize:13,color:"#4CAF50",fontWeight:700}}>R$ {perfume.preco_brl}</div>{perfume.preco_fonte&&<div style={{fontSize:9,color:"#2E7D32"}}>{perfume.preco_fonte}</div>}</div>}
            </div>
          )}

          {perfume.descricao&&<p style={{fontSize:11,color:"#666",fontStyle:"italic",fontFamily:"Georgia,serif",lineHeight:1.6,margin:"10px 0 0"}}>"{perfume.descricao}"</p>}

          {extraFooter}

          {onDelete&&<button onClick={()=>onDelete(perfume.id)} style={{width:"100%",background:"none",border:"1px solid #2a1515",borderRadius:8,color:"#5a2020",padding:"7px",cursor:"pointer",fontSize:11,fontFamily:"Georgia,serif",marginTop:12}}>Remover</button>}
        </div>
      )}
    </div>
  );
}

// ─── STORE MANAGER ────────────────────────────────────────────────────────────
function StoreManager({perfumeId, stores, onUpdate}) {
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [link, setLink] = useState("");
  const add = () => {
    if (!nome.trim()) return;
    onUpdate(perfumeId, [...(stores||[]), {nome:nome.trim(),preco:preco.trim(),link:link.trim(),id:Date.now()}]);
    setNome(""); setPreco(""); setLink("");
  };
  return (
    <div style={{background:"#060e06",border:"1px solid #152015",borderRadius:12,padding:12,marginTop:10}}>
      <div style={{fontSize:9,color:"#2E7D32",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>🛒 Onde comprar</div>
      {(stores||[]).map(s=>(
        <div key={s.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,background:"#0d0d0d",borderRadius:8,padding:"6px 10px"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,color:"#ccc",fontWeight:600}}>{s.nome}</div>
            <div style={{display:"flex",gap:8,fontSize:10}}>
              {s.preco&&<span style={{color:"#4CAF50"}}>R$ {s.preco}</span>}
              {s.link&&<a href={s.link} target="_blank" rel="noreferrer" style={{color:"#64B5F6",textDecoration:"none"}}>🔗 ver</a>}
            </div>
          </div>
          <button onClick={()=>onUpdate(perfumeId,(stores||[]).filter(x=>x.id!==s.id))} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:16,padding:"0 4px"}}>×</button>
        </div>
      ))}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <input value={nome} onChange={e=>setNome(e.target.value)} placeholder="Loja"
          style={{flex:2,minWidth:80,background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:8,color:"#ccc",padding:"7px 9px",fontSize:11,outline:"none"}}/>
        <input value={preco} onChange={e=>setPreco(e.target.value)} placeholder="R$"
          style={{width:55,background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:8,color:"#ccc",padding:"7px 9px",fontSize:11,outline:"none"}}/>
      </div>
      <div style={{display:"flex",gap:6,marginTop:6}}>
        <input value={link} onChange={e=>setLink(e.target.value)} placeholder="Link (opcional)"
          style={{flex:1,background:"#0d0d0d",border:"1px solid #1e1e1e",borderRadius:8,color:"#ccc",padding:"7px 9px",fontSize:11,outline:"none"}}/>
        <button onClick={add} style={{background:"#0a1a0a",border:"1px solid #1e3a1e",borderRadius:8,color:"#4CAF50",padding:"7px 12px",cursor:"pointer",fontSize:11,whiteSpace:"nowrap"}}>+ Add</button>
      </div>
    </div>
  );
}

// ─── ADD FORM ─────────────────────────────────────────────────────────────────
function AddForm({onPreview, loading}) {
  const [mode, setMode] = useState("text");
  const [q, setQ] = useState("");
  const [fragUrl, setFragUrl] = useState("");
  const fileRef = useRef();
  const camRef  = useRef();

  const doText = () => { if(q.trim()){onPreview({type:"name",value:q.trim()});setQ("");} };
  const doUrl  = () => { if(fragUrl.includes("fragrantica")){onPreview({type:"url",value:fragUrl.trim()});setFragUrl("");} };
  const doFile = e => {
    const f=e.target.files?.[0]; if(!f) return;
    const mt=f.type||"image/jpeg";
    const r=new FileReader();
    r.onload=ev=>{ onPreview({type:"image",value:ev.target.result.split(",")[1],mediaType:mt}); };
    r.readAsDataURL(f); e.target.value="";
  };

  return (
    <div style={{marginBottom:16}}>
      <div style={{display:"flex",gap:5,marginBottom:10}}>
        {[["text","✏ Nome"],["url","🔗 URL Fragrantica"],["photo","📷 Foto"]].map(([m,l])=>(
          <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:"8px 4px",borderRadius:9,border:"none",cursor:"pointer",background:mode===m?"linear-gradient(135deg,#D4A843,#8B6914)":"#141414",color:mode===m?"#000":"#555",fontSize:10,fontWeight:mode===m?700:400,fontFamily:"Georgia,serif"}}>{l}</button>
        ))}
      </div>

      {mode==="text"&&(
        <div style={{display:"flex",gap:8}}>
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doText()}
            placeholder="Ex: Sospiro Vibrato..." disabled={loading}
            style={{flex:1,background:"#0d0d0d",border:"1px solid #252525",borderRadius:10,color:"#F0E6C8",padding:"11px 14px",fontSize:13,outline:"none",fontFamily:"Georgia,serif"}}/>
          <button onClick={doText} disabled={loading||!q.trim()} style={{background:loading||!q.trim()?"#141414":"linear-gradient(135deg,#D4A843,#8B6914)",border:"none",borderRadius:10,color:loading||!q.trim()?"#444":"#000",padding:"11px 16px",cursor:loading||!q.trim()?"not-allowed":"pointer",fontSize:13,fontWeight:700,flexShrink:0}}>
            {loading?<Dots/>:"Buscar"}
          </button>
        </div>
      )}

      {mode==="url"&&(
        <div>
          <div style={{display:"flex",gap:8}}>
            <input value={fragUrl} onChange={e=>setFragUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doUrl()}
              placeholder="https://www.fragrantica.com/perfume/..." disabled={loading}
              style={{flex:1,background:"#0d0d0d",border:"1px solid #252525",borderRadius:10,color:"#F0E6C8",padding:"11px 12px",fontSize:11,outline:"none",fontFamily:"Georgia,serif"}}/>
            <button onClick={doUrl} disabled={loading||!fragUrl.includes("fragrantica")} style={{background:loading||!fragUrl.includes("fragrantica")?"#141414":"linear-gradient(135deg,#D4A843,#8B6914)",border:"none",borderRadius:10,color:loading||!fragUrl.includes("fragrantica")?"#444":"#000",padding:"11px 14px",cursor:"pointer",fontSize:13,fontWeight:700,flexShrink:0}}>
              {loading?<Dots/>:"Buscar"}
            </button>
          </div>
          <div style={{fontSize:10,color:"#444",marginTop:5,fontStyle:"italic"}}>Cole a URL do Fragrantica → dados 100% precisos</div>
        </div>
      )}

      {mode==="photo"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {[["fileRef","🖼","Galeria / Upload"],["camRef","📸","Câmera"]].map(([ref,icon,label])=>(
              <button key={label} onClick={()=>(ref==="fileRef"?fileRef:camRef).current?.click()} disabled={loading}
                style={{background:"#141414",border:"1px solid #222",borderRadius:14,color:loading?"#333":"#D4A843",padding:"18px 8px",cursor:loading?"not-allowed":"pointer",fontSize:11,fontFamily:"Georgia,serif",textAlign:"center",lineHeight:1.5}}>
                <div style={{fontSize:28,marginBottom:6}}>{icon}</div>{label}
              </button>
            ))}
          </div>
          {loading&&<div style={{textAlign:"center",marginTop:14,color:"#777",fontSize:12}}><Dots/>&nbsp; Identificando...</div>}
          <p style={{fontSize:10,color:"#333",textAlign:"center",margin:"8px 0 0",fontStyle:"italic"}}>Fotografe o frasco, caixa ou rótulo</p>
          <input ref={fileRef} type="file" accept="image/*" onChange={doFile} style={{display:"none"}}/>
          <input ref={camRef}  type="file" accept="image/*" capture="environment" onChange={doFile} style={{display:"none"}}/>
        </div>
      )}
    </div>
  );
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
function exportPDF(collection, wishlist, profile, userName) {
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
  script.onload = () => {
    const date = new Date().toLocaleDateString("pt-BR");
    const el = document.createElement("div");
    el.style.cssText = "font-family:Georgia,serif;color:#1a1a1a;padding:36px;max-width:660px;background:#fff;";
    el.innerHTML = `
      <div style="text-align:center;border-bottom:2px solid #8B6914;padding-bottom:16px;margin-bottom:24px">
        <div style="font-size:9px;letter-spacing:0.3em;color:#8B6914;text-transform:uppercase">✦ OLFACTORY JOURNAL ✦</div>
        <h1 style="font-size:24px;margin:6px 0 4px;font-weight:400">Perfume Vault</h1>
        <div style="font-size:11px;color:#888">${userName||"Minha Coleção"} · ${date}</div>
      </div>
      <h2 style="font-size:14px;color:#8B6914;font-weight:400;text-transform:uppercase;border-bottom:1px solid #eee;padding-bottom:6px;margin-bottom:12px">Coleção (${collection.length})</h2>
      ${collection.map(p=>`
        <div style="margin-bottom:10px;padding:9px 12px;background:#fafafa;border-left:3px solid ${getAccordColor(p.acordes?.[0]?.nome||p.familia)};border-radius:0 8px 8px 0">
          <div style="font-size:13px;font-weight:600">${p.nome} <span style="font-weight:400;font-size:11px;color:#888">— ${p.marca}</span></div>
          <div style="font-size:10px;color:#888;margin:2px 0">${[p.familia,p.concentracao].filter(Boolean).join(" · ")}</div>
          <div style="font-size:10px">${p.fragrantica_nota>0?`<span style="color:#8B6914">⭐ ${Number(p.fragrantica_nota).toFixed(2)}</span>`:""}${p.minha_nota>0?`<span style="margin-left:10px;color:#555">👤 ${p.minha_nota}/10</span>`:""}${p.preco_brl>0?`<span style="margin-left:10px;color:#2E7D32">R$ ${p.preco_brl}</span>`:""}</div>
          ${p.acordes?.length?`<div style="font-size:9px;color:#999;margin-top:2px">Acordes: ${p.acordes.slice(0,5).map(a=>a.nome).join(" · ")}</div>`:""}
        </div>
      `).join("")}
      ${wishlist.length?`<h2 style="font-size:14px;color:#7B1FA2;font-weight:400;text-transform:uppercase;border-bottom:1px solid #eee;padding-bottom:6px;margin:20px 0 12px">Wishlist (${wishlist.length})</h2>${wishlist.map(p=>`<div style="margin-bottom:8px;padding:8px 12px;background:#fafafa;border-left:3px solid #7B1FA2;border-radius:0 8px 8px 0"><div style="font-size:12px;font-weight:600">${p.nome} — ${p.marca}</div>${p.preco_brl>0?`<div style="font-size:10px;color:#2E7D32">R$ ${p.preco_brl}</div>`:""}</div>`).join("")}`:""}
      ${profile?`
        <h2 style="font-size:14px;color:#0277BD;font-weight:400;text-transform:uppercase;border-bottom:1px solid #eee;padding-bottom:6px;margin:20px 0 12px">Perfil Olfativo</h2>
        <p style="font-size:12px;color:#555;font-style:italic;line-height:1.8;margin-bottom:12px">${profile.resumo||""}</p>
        ${profile.dna_olfativo?.length?`<div style="margin-bottom:10px">${profile.dna_olfativo.map(d=>`<span style="display:inline-block;background:#f0f0f0;border-radius:20px;padding:2px 10px;font-size:10px;margin:2px">${d}</span>`).join("")}</div>`:""}
        ${profile.familias?.length?`<div style="margin-bottom:10px"><div style="font-size:9px;color:#888;text-transform:uppercase;margin-bottom:5px">Famílias</div>${profile.familias.slice(0,5).map(f=>`<div style="margin-bottom:4px"><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px"><span>${f.nome}</span><span>${Math.round(f.porcentagem)}%</span></div><div style="height:4px;background:#eee;border-radius:2px"><div style="height:100%;width:${f.porcentagem}%;background:${getAccordColor(f.nome)};border-radius:2px"></div></div></div>`).join("")}</div>`:""}
      `:""}
      <div style="text-align:center;margin-top:32px;padding-top:14px;border-top:1px solid #eee;font-size:9px;color:#ccc;letter-spacing:0.15em">PERFUME VAULT · ${date}</div>
    `;
    document.body.appendChild(el);
    window.html2pdf().set({margin:0,filename:"PerfumeVault.pdf",html2canvas:{scale:2,useCORS:true},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}})
      .from(el).save().then(()=>document.body.removeChild(el));
  };
  document.head.appendChild(script);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function PerfumeVault() {
  const [tab, setTab] = useState(0);
  const [collection, setCollection] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [wishStores, setWishStores] = useState({});
  const [wishMatches, setWishMatches] = useState({});
  const [profile, setProfile] = useState(null);
  const [discoveries, setDiscoveries] = useState([]);

  const [preview, setPreview] = useState(null);
  const [backendOk, setBackendOk] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [loadingPriceId, setLoadingPriceId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [user, setUser] = useState(null);

  // Backend health check
  useEffect(()=>{
    const check = async () => setBackendOk(await checkBackend());
    check();
    const t = setInterval(check, 15000);
    return ()=>clearInterval(t);
  },[]);

  // Persist
  useEffect(()=>{ try{localStorage.setItem("pv5_col",JSON.stringify(collection));}catch{} },[collection]);
  useEffect(()=>{ try{localStorage.setItem("pv5_wsh",JSON.stringify(wishlist));}catch{} },[wishlist]);
  useEffect(()=>{
    try{
      const c=JSON.parse(localStorage.getItem("pv5_col")||"[]");
      const w=JSON.parse(localStorage.getItem("pv5_wsh")||"[]");
      if(c.length)setCollection(c);
      if(w.length)setWishlist(w);
    }catch{}
  },[]);

  const doPreview = async (req, isWishlist) => {
    setLoadingSearch(true); setErrorMsg("");
    try {
      if (!backendOk) throw new Error("Backend offline. Configure sua URL nas ⚙️ Configurações.");
      let data;
      if (req.type==="name")     data = await apiFetch("/api/perfume/search", {query: req.value});
      else if (req.type==="url") data = await apiFetch("/api/perfume/url",    {url: req.value});
      else {
        // identify image via Claude, then search
        const raw = await callClaude(
          [{role:"user",content:[{type:"image",source:{type:"base64",media_type:req.mediaType,data:req.value}},{type:"text",text:"Identifique o perfume. Responda apenas: MARCA: [marca] | NOME: [nome]"}]}],
          "Você identifica perfumes por imagens.", 150
        );
        const nm = raw.match(/NOME:\s*([^|]+)/i)?.[1]?.trim();
        const mk = raw.match(/MARCA:\s*([^|]+)/i)?.[1]?.trim();
        if (!nm) throw new Error("Não foi possível identificar o perfume.");
        data = await apiFetch("/api/perfume/search", {query: `${mk||""} ${nm}`});
      }
      if (!data?.nome) throw new Error("Perfume não encontrado.");
      setPreview({data, isWishlist});
    } catch(e) { setErrorMsg(e.message||"Erro ao buscar."); }
    setLoadingSearch(false);
  };

  const doConfirm = async () => {
    if (!preview) return;
    const item = {...preview.data, id:Date.now(), minha_nota:0};
    if (preview.isWishlist) {
      setWishlist(p=>[item,...p]);
      if (profile) {
        const m = await matchPerfume(item, profile);
        setWishMatches(p=>({...p,[item.id]:m}));
      }
    } else {
      setCollection(p=>[item,...p]);
      setProfile(null);
    }
    setPreview(null);
  };

  const doBRPrice = async (id, nome, marca) => {
    setLoadingPriceId(id);
    try {
      const r = await apiFetch("/api/price/br", {nome, marca});
      const upd = list=>list.map(p=>p.id===id?{...p,preco_brl:r.preco_brl,preco_fonte:r.fonte}:p);
      setCollection(upd); setWishlist(upd);
    } catch {}
    setLoadingPriceId(null);
  };

  const doProfile = async () => {
    setLoadingProfile(true); setErrorMsg("");
    try {
      const p = await buildProfile(collection);
      setProfile(p);
      const ms={};
      for(const w of wishlist){ ms[w.id]=await matchPerfume(w,p); }
      setWishMatches(ms);
    } catch { setErrorMsg("Erro ao gerar perfil."); }
    setLoadingProfile(false);
  };

  const doDiscover = async () => {
    setLoadingDiscover(true); setErrorMsg("");
    try { setDiscoveries(await discoverPerfumes(profile,collection)); } catch { setErrorMsg("Erro."); }
    setLoadingDiscover(false);
  };

  const moveToCollection = (id) => {
    const p=wishlist.find(w=>w.id===id); if(!p) return;
    setWishlist(l=>l.filter(w=>w.id!==id));
    setWishMatches(m=>{const n={...m};delete n[id];return n;});
    setCollection(l=>[{...p,id:Date.now()},...l]);
    setProfile(null);
  };

  const statusColor = backendOk===null?"#555":backendOk?"#4CAF50":"#FF9800";
  const statusText  = backendOk===null?"verificando...":backendOk?"online":"offline";

  return (
    <div style={{background:"#080808",minHeight:"100vh",fontFamily:"Georgia,'Times New Roman',serif",color:"#F0E6C8",maxWidth:430,margin:"0 auto"}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:2px}
        input::placeholder{color:#383838}
        input[type=range]{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:#222;outline:none;width:100%}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:currentColor;cursor:pointer;margin-top:-8px}
        input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:currentColor;cursor:pointer;border:none}
      `}</style>

      {showSettings&&<SettingsModal onClose={()=>setShowSettings(false)}/>}
      {preview&&<Preview perfume={preview.data} isWishlist={preview.isWishlist} onConfirm={doConfirm} onCancel={()=>setPreview(null)}/>}

      {/* HEADER */}
      <div style={{padding:"20px 16px 12px",background:"linear-gradient(180deg,#0c0900,#080808)",borderBottom:"1px solid #141414"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:9,letterSpacing:"0.24em",color:"#8B6914",textTransform:"uppercase",marginBottom:4}}>✦ Olfactory Journal ✦</div>
            <h1 style={{margin:0,fontSize:22,fontWeight:400,background:"linear-gradient(135deg,#F0E6C8,#D4A843,#8B6914)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:"0.05em"}}>Perfume Vault</h1>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:statusColor}}/>
              <span style={{fontSize:9,color:statusColor}}>Backend {statusText}</span>
              {!backendOk&&backendOk!==null&&(
                <button onClick={()=>setShowSettings(true)} style={{background:"none",border:"none",color:"#D4A843",cursor:"pointer",fontSize:9,padding:0,textDecoration:"underline",fontFamily:"Georgia,serif"}}>configurar</button>
              )}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
            {user?(
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:"#D4A84322",border:"1px solid #D4A84444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#D4A843",fontWeight:700}}>{user.name[0]}</div>
                <span style={{fontSize:10,color:"#666"}}>{user.name.split(" ")[0]}</span>
              </div>
            ):(
              <button onClick={()=>{const n=prompt("Seu nome:");if(n)setUser({name:n.trim()});}} style={{background:"none",border:"1px solid #222",borderRadius:8,color:"#D4A843",padding:"5px 10px",cursor:"pointer",fontSize:10,fontFamily:"Georgia,serif"}}>👤 Entrar</button>
            )}
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setShowSettings(true)} style={{background:"none",border:"1px solid #1e1e1e",borderRadius:8,color:"#555",padding:"5px 10px",cursor:"pointer",fontSize:10,fontFamily:"Georgia,serif"}}>⚙️</button>
              <button onClick={()=>exportPDF(collection,wishlist,profile,user?.name)} style={{background:"none",border:"1px solid #1e1e1e",borderRadius:8,color:"#555",padding:"5px 10px",cursor:"pointer",fontSize:10,fontFamily:"Georgia,serif"}}>📄 PDF</button>
            </div>
          </div>
        </div>
        <div style={{fontSize:10,color:"#333",marginTop:6}}>{collection.length} fragrâncias · {wishlist.length} desejos</div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",borderBottom:"1px solid #141414",background:"#080808",position:"sticky",top:0,zIndex:10}}>
        {TABS.map((t,i)=>(
          <button key={t} onClick={()=>setTab(i)} style={{flex:1,background:"none",border:"none",padding:"11px 2px",color:tab===i?"#D4A843":"#444",fontSize:9,letterSpacing:"0.08em",textTransform:"uppercase",borderBottom:tab===i?"2px solid #D4A843":"2px solid transparent",cursor:"pointer",fontFamily:"Georgia,serif"}}>{t}</button>
        ))}
      </div>

      {errorMsg&&(
        <div style={{margin:"10px 14px 0",padding:"10px 12px",background:"#180505",border:"1px solid #4a1515",borderRadius:10,fontSize:11,color:"#e06060"}}>
          ⚠ {errorMsg}
          <button onClick={()=>setErrorMsg("")} style={{float:"right",background:"none",border:"none",color:"#666",cursor:"pointer",fontSize:14}}>×</button>
        </div>
      )}

      <div style={{padding:14,paddingBottom:50}}>

        {/* COLEÇÃO */}
        {tab===0&&(
          <div>
            <div style={{fontSize:9,color:"#444",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Adicionar à coleção</div>
            <AddForm onPreview={req=>doPreview(req,false)} loading={loadingSearch}/>
            {collection.length===0?(
              <div style={{textAlign:"center",padding:"40px 16px"}}>
                <div style={{fontSize:40,marginBottom:12}}>🫙</div>
                <div style={{fontSize:12,fontStyle:"italic",color:"#333",lineHeight:1.7}}>
                  Sua coleção está vazia.<br/>
                  <span style={{color:"#D4A84388"}}>Dica: use 🔗 URL do Fragrantica<br/>para dados 100% precisos.</span>
                </div>
              </div>
            ):collection.map(p=>(
              <PerfumeCard key={p.id} perfume={p}
                onDelete={id=>setCollection(l=>l.filter(x=>x.id!==id))}
                onRatingChange={(id,v)=>{setCollection(l=>l.map(x=>x.id===id?{...x,minha_nota:v}:x));setProfile(null);}}
                extraFooter={
                  <button onClick={()=>doBRPrice(p.id,p.nome,p.marca)} disabled={loadingPriceId===p.id||!backendOk}
                    style={{width:"100%",background:"none",border:"1px solid #152015",borderRadius:8,color:!backendOk?"#333":loadingPriceId===p.id?"#444":"#2E7D32",padding:"7px",cursor:"pointer",fontSize:10,fontFamily:"Georgia,serif",marginTop:10}}>
                    {loadingPriceId===p.id?<><Dots color="#4CAF50"/>&nbsp;Buscando preço...</>:"🇧🇷 Buscar preço no Brasil"}
                  </button>
                }
              />
            ))}
          </div>
        )}

        {/* WISHLIST */}
        {tab===1&&(
          <div>
            <div style={{fontSize:9,color:"#444",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Adicionar à wishlist</div>
            <AddForm onPreview={req=>doPreview(req,true)} loading={loadingSearch}/>
            {!profile&&wishlist.length>0&&<div style={{background:"#0d0a04",border:"1px solid #2a1e00",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:11,color:"#7a5a10",lineHeight:1.5}}>💡 Gere seu <strong>Perfil Olfativo</strong> para ver % de compatibilidade.</div>}
            {wishlist.length===0?(
              <div style={{textAlign:"center",padding:"40px 16px",color:"#282828"}}>
                <div style={{fontSize:40,marginBottom:12}}>✨</div>
                <div style={{fontSize:12,fontStyle:"italic",color:"#333"}}>Sua wishlist está vazia.</div>
              </div>
            ):wishlist.map(p=>(
              <PerfumeCard key={p.id} perfume={p}
                onDelete={id=>{setWishlist(l=>l.filter(x=>x.id!==id));setWishMatches(m=>{const n={...m};delete n[id];return n;});}}
                onRatingChange={(id,v)=>setWishlist(l=>l.map(x=>x.id===id?{...x,minha_nota:v}:x))}
                showMatch={!!profile} match={wishMatches[p.id]}
                extraFooter={
                  <div>
                    <button onClick={()=>doBRPrice(p.id,p.nome,p.marca)} disabled={loadingPriceId===p.id||!backendOk}
                      style={{width:"100%",background:"none",border:"1px solid #152015",borderRadius:8,color:!backendOk?"#333":loadingPriceId===p.id?"#444":"#2E7D32",padding:"7px",cursor:"pointer",fontSize:10,fontFamily:"Georgia,serif",marginTop:10}}>
                      {loadingPriceId===p.id?<><Dots color="#4CAF50"/>&nbsp;Buscando...</>:"🇧🇷 Buscar preço no Brasil"}
                    </button>
                    <StoreManager perfumeId={p.id} stores={wishStores[p.id]} onUpdate={(pid,s)=>setWishStores(x=>({...x,[pid]:s}))}/>
                    <button onClick={()=>moveToCollection(p.id)} style={{width:"100%",background:"linear-gradient(135deg,#D4A843,#8B6914)",border:"none",borderRadius:10,color:"#000",padding:"11px",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"Georgia,serif",marginTop:10}}>
                      ✦ Comprei! Mover para Coleção
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        )}

        {/* PERFIL */}
        {tab===2&&(
          <div>
            <div style={{fontSize:9,color:"#444",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Perfil Olfativo</div>
            {collection.length<2?(
              <div style={{textAlign:"center",padding:"40px 16px",color:"#282828"}}>
                <div style={{fontSize:40,marginBottom:12}}>🌸</div>
                <div style={{fontSize:12,fontStyle:"italic",color:"#333"}}>Adicione ao menos 2 perfumes à coleção.</div>
              </div>
            ):(
              <>
                <button onClick={doProfile} disabled={loadingProfile} style={{width:"100%",padding:"13px",borderRadius:12,background:loadingProfile?"#141414":"linear-gradient(135deg,#D4A843,#8B6914)",border:"none",color:loadingProfile?"#444":"#000",fontSize:13,fontWeight:700,cursor:loadingProfile?"not-allowed":"pointer",fontFamily:"Georgia,serif",marginBottom:18}}>
                  {loadingProfile?<><Dots/>&nbsp;Analisando coleção...</>:"✦ Gerar / Atualizar Perfil"}
                </button>
                {profile&&(
                  <div>
                    <div style={{background:"#0c0900",border:"1px solid #2a1f00",borderRadius:14,padding:14,marginBottom:12}}>
                      <div style={{fontSize:9,color:"#8B6914",letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:8}}>Resumo</div>
                      <p style={{fontSize:12,color:"#ccc",fontStyle:"italic",lineHeight:1.8,margin:0}}>{profile.resumo}</p>
                      {profile.personalidade&&<p style={{fontSize:11,color:"#777",lineHeight:1.6,margin:"8px 0 0"}}>{profile.personalidade}</p>}
                    </div>
                    {profile.dna_olfativo?.length>0&&(
                      <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:12,marginBottom:12}}>
                        <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>DNA Olfativo</div>
                        {profile.dna_olfativo.map((d,i)=>(
                          <span key={i} style={{display:"inline-block",background:`${getAccordColor(d)}22`,border:`1px solid ${getAccordColor(d)}44`,borderRadius:20,padding:"4px 12px",fontSize:12,color:getAccordColor(d),margin:"2px 4px 2px 0",fontFamily:"Georgia,serif"}}>{d}</span>
                        ))}
                      </div>
                    )}
                    {profile.familias?.length>0&&(
                      <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:12,marginBottom:12}}>
                        <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10}}>Famílias Preferidas</div>
                        {profile.familias.slice(0,6).map(f=><AccordBar key={f.nome} name={f.nome} pct={f.porcentagem} max={Math.max(...profile.familias.map(x=>x.porcentagem))}/>)}
                      </div>
                    )}
                    {profile.acordes?.length>0&&(
                      <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:12,marginBottom:12}}>
                        <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10}}>Acordes Dominantes</div>
                        {profile.acordes.slice(0,8).map(a=><AccordBar key={a.nome} name={a.nome} pct={a.porcentagem} max={Math.max(...profile.acordes.map(x=>x.porcentagem))}/>)}
                      </div>
                    )}
                    {[["notas_topo_fav","#D4A843","Notas de Topo Favoritas"],["notas_coracao_fav","#E91E63","Notas de Coração Favoritas"],["notas_fundo_fav","#9C27B0","Notas de Fundo Favoritas"]].map(([k,c,l])=>
                      profile[k]?.length>0&&(
                        <div key={k} style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:12,marginBottom:12}}>
                          <div style={{fontSize:9,color:c,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>{l}</div>
                          {profile[k].map(n=><NoteChip key={n} note={n}/>)}
                        </div>
                      )
                    )}
                    {(profile.estacoes_pref?.length||profile.horarios_pref?.length||profile.ocasioes_pref?.length)>0&&(
                      <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:12,marginBottom:12}}>
                        <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>Quando e Onde Usar</div>
                        {profile.estacoes_pref?.map(s=><SBadge key={s} label={s} icon={SEASON_ICONS[s]||"🌟"}/>)}
                        {profile.horarios_pref?.map(h=><SBadge key={h} label={h} icon={TIME_ICONS[h]||"⏰"}/>)}
                        {profile.ocasioes_pref?.map(o=><SBadge key={o} label={o} icon={OCC_ICONS[o]||"✨"}/>)}
                      </div>
                    )}
                    {profile.caracteristicas?.length>0&&(
                      <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:12,marginBottom:12}}>
                        <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>Você ama</div>
                        {profile.caracteristicas.map((c,i)=><div key={i} style={{fontSize:12,color:"#bbb",padding:"5px 0",borderBottom:"1px solid #111"}}>✦ {c}</div>)}
                      </div>
                    )}
                    {profile.evitar?.length>0&&(
                      <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:12,padding:12}}>
                        <div style={{fontSize:9,color:"#555",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>Tende a evitar</div>
                        {profile.evitar.map((c,i)=><div key={i} style={{fontSize:12,color:"#444",padding:"5px 0",borderBottom:"1px solid #111"}}>○ {c}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* DESCOBRIR */}
        {tab===3&&(
          <div>
            <div style={{fontSize:9,color:"#444",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Descobrir Perfumes</div>
            {!profile?(
              <div style={{textAlign:"center",padding:"40px 16px",color:"#282828"}}>
                <div style={{fontSize:40,marginBottom:12}}>🔭</div>
                <div style={{fontSize:12,fontStyle:"italic",color:"#333",marginBottom:16}}>Gere seu Perfil Olfativo primeiro.</div>
                <button onClick={()=>setTab(2)} style={{background:"none",border:"1px solid #222",borderRadius:8,color:"#D4A843",padding:"9px 18px",cursor:"pointer",fontSize:12,fontFamily:"Georgia,serif"}}>→ Ir para Perfil</button>
              </div>
            ):(
              <>
                <button onClick={doDiscover} disabled={loadingDiscover} style={{width:"100%",padding:"13px",borderRadius:12,background:loadingDiscover?"#141414":"linear-gradient(135deg,#534AB7,#3C3489)",border:"none",color:loadingDiscover?"#444":"#E8E4FF",fontSize:13,fontWeight:700,cursor:loadingDiscover?"not-allowed":"pointer",fontFamily:"Georgia,serif",marginBottom:18}}>
                  {loadingDiscover?<><Dots/>&nbsp;Buscando sugestões...</>:"✦ Buscar Sugestões para Mim"}
                </button>
                {discoveries.length===0&&!loadingDiscover&&<div style={{textAlign:"center",padding:16,color:"#333",fontSize:12,fontStyle:"italic"}}>Clique para receber sugestões do seu perfil.</div>}
                {discoveries.map((d,i)=>{
                  const fc=getAccordColor(d.familia);
                  return (
                    <div key={i} style={{background:"#0d0d0d",border:`1px solid ${fc}44`,borderRadius:14,padding:12,marginBottom:10}}>
                      <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
                        <Bottle nome={d.nome} marca={d.marca} color={fc} size={46}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:"Georgia,serif",fontSize:13,color:"#F0E6C8",fontWeight:600}}>{d.nome}</div>
                          <div style={{fontSize:10,color:"#666",marginTop:1}}>{d.marca} · {d.familia}</div>
                          <div style={{fontSize:11,marginTop:2}}>{d.estacoes?.slice(0,3).map(s=>SEASON_ICONS[s]||"").join(" ")}</div>
                        </div>
                        <div style={{background:`${fc}22`,border:`1px solid ${fc}55`,borderRadius:20,padding:"4px 10px",fontSize:13,color:fc,fontWeight:700,flexShrink:0}}>{Math.round(d.porcentagem)}%</div>
                      </div>
                      <div style={{height:5,background:"#1a1a1a",borderRadius:3,overflow:"hidden",marginBottom:8}}>
                        <div style={{width:`${d.porcentagem}%`,height:"100%",background:fc,borderRadius:3,transition:"width 1s"}}/>
                      </div>
                      <p style={{fontSize:11,color:"#777",margin:"0 0 8px",fontStyle:"italic",lineHeight:1.5}}>{d.razao}</p>
                      {d.notas_principais?.length>0&&<div style={{marginBottom:8}}>{d.notas_principais.map(n=><NoteChip key={n} note={n} size="sm"/>)}</div>}
                      <button onClick={()=>doPreview({type:"name",value:`${d.nome} ${d.marca}`},true)} disabled={loadingSearch||!backendOk}
                        style={{background:"none",border:"1px solid #222",borderRadius:8,color:"#D4A843",padding:"7px 14px",cursor:"pointer",fontSize:11,fontFamily:"Georgia,serif"}}>
                        + Adicionar à Wishlist
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
