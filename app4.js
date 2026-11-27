/* VS — partie 4 (app4.js) : à charger APRÈS app3.js */

// ---------- Réglage : clé publique des notifications (voir supabase-setup.sql) ----------
const VS_VAPID = "BEQuMmBt9zJOv4cJRPZ4aHXKE1B5DZEpEh_zK5wD_I2SVb08xrbcXrZHIaV7MzVvc9zlxQLPYijMgBLQLxKOlKI";
const VS_MAX_COMPTES = 8;

// Évite le flash de la page « mot de passe » au démarrage
ecran("attente");
setTimeout(() => { if ($("#auth").hidden && $("#app").hidden) ecran("auth"); }, 5000);

// Si on revient dans l'appli et qu'une session existe, on entre directement
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || moi) return;
  try {
    const { data } = await db.auth.getSession();
    if (data && data.session) demarrer(data.session.user);
  } catch (e) {}
});

function envelopper(nom, apres, cle) {
  const ancien = window[nom];
  window[nom] = async function (...a) {
    const r = await ancien.apply(this, a);
    try { await apres(...a); } catch (e) {}
    return r;
  };
  if (cle) chargeurs[cle] = window[nom];
}

// ---------- 1. Couleurs de VS ----------
const COULEURS = {
  violet: ["Violet", "#A855F7", "#8B5CF6", "#5B21B6"],
  rose: ["Rose", "#FF4DA6", "#F472B6", "#BE185D"],
  vert: ["Vert", "#22E58A", "#34D399", "#047857"],
  bleu: ["Bleu", "#38BDF8", "#60A5FA", "#1D4ED8"],
  rouge: ["Rouge", "#FF4D5E", "#F87171", "#B91C1C"],
  orange: ["Orange", "#FF9F43", "#FB923C", "#C2410C"],
  turquoise: ["Turquoise", "#2DD4BF", "#5EEAD4", "#0F766E"],
};
function rgbaHex(h, a) {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function appliquerCouleur(nom) {
  const c = COULEURS[nom] || COULEURS.violet;
  const r = document.documentElement.style;
  r.setProperty("--neon", c[1]);
  r.setProperty("--violet", c[2]);
  r.setProperty("--violet-fonce", c[3]);
  r.setProperty("--lueur", "0 0 18px " + rgbaHex(c[1], 0.45));
  r.setProperty("--contour", rgbaHex(c[1], 0.28));
}
appliquerCouleur(localStorage.getItem("vs_couleur") || "violet");

// ---------- 2. Styles ajoutés ----------
(() => {
  const s = document.createElement("style");
  s.textContent = `
    #toast { z-index: 130; }
    .entete .points { display: none !important; }
    #fiche .stat strong, #fiche-autre .stat strong { font-size: 1rem !important; }
    #fiche .stat span, #fiche-autre .stat span { font-size: 0.68rem !important; }

    /* en ligne */
    .pt-ligne { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle;
      background: #2bff88; box-shadow: 0 0 8px #2bff88; }
    .statut { display: block; margin-top: -6px; font-size: 0.72rem; font-weight: 600; color: #2bff88; }
    .note.en-ligne-av::after { content: ""; position: absolute; right: 10px; bottom: 24px; width: 13px; height: 13px; border-radius: 50%;
      background: #2bff88; border: 2px solid var(--noir); box-shadow: 0 0 8px #2bff88; }

    /* messages en grand écran */
    #chat:not([hidden]) { position: fixed; inset: 0; z-index: 55; display: flex; flex-direction: column; background: var(--noir);
      padding: calc(10px + env(safe-area-inset-top, 0px)) 12px calc(10px + env(safe-area-inset-bottom, 0px)); }
    #chat #fil-chat { flex: 1; height: auto; min-height: 0; margin: 0 0 8px; }
    #chat .bulle { max-width: 86%; white-space: pre-wrap; }
    #chat .bulle.vocal { white-space: normal; }
    #f-chat { flex: none; align-items: flex-end !important; margin-top: 8px; }
    #f-chat textarea { margin: 0; resize: none; min-height: 46px; max-height: 130px; flex: 1; border-radius: 22px; line-height: 1.3; }
    #chat-themes { flex: none; padding: 2px 0; }
    #chat-themes .puce { white-space: nowrap; }
    /* thèmes de discussion : fond, bulles, champ, boutons */
    #chat[data-th]:not([data-th="aucun"]) { background: linear-gradient(180deg, var(--th-f1), var(--th-f2)); }
    #chat[data-th]:not([data-th="aucun"])::before { content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none;
      background-image: var(--th-motif); background-size: 140px 140px; opacity: 0.22; }
    #chat[data-th]:not([data-th="aucun"]) > * { position: relative; z-index: 1; }
    #chat[data-th]:not([data-th="aucun"]) #fil-chat { background: rgba(0, 0, 0, 0.22); border-color: var(--th-bord); box-shadow: none; }
    #chat[data-th]:not([data-th="aucun"]) .bulle { background: var(--th-autre); border-color: var(--th-bord); }
    #chat[data-th]:not([data-th="aucun"]) .bulle.moi { background: linear-gradient(135deg, var(--th-m1), var(--th-m2)); border-color: transparent; }
    #chat[data-th]:not([data-th="aucun"]) .bulle.appel-manque { border-color: #ff4d5e; }
    #chat[data-th]:not([data-th="aucun"]) .voc-play { background: linear-gradient(135deg, var(--th-m1), var(--th-m2)); box-shadow: none; }
    #chat[data-th]:not([data-th="aucun"]) .bulle.moi .voc-play { background: rgba(8, 8, 13, 0.85); }
    #chat[data-th]:not([data-th="aucun"]) .voc-onde i.lue { background: var(--th-m1); box-shadow: none; }
    #chat[data-th]:not([data-th="aucun"]) #chat-texte { background: rgba(0, 0, 0, 0.35); border-color: var(--th-bord); }
    #chat[data-th]:not([data-th="aucun"]) #chat-texte:focus { border-color: var(--th-m1); box-shadow: 0 0 14px var(--th-bord); }
    #chat[data-th]:not([data-th="aucun"]) .outil-chat { background: rgba(0, 0, 0, 0.3); border-color: var(--th-bord); }
    #chat[data-th]:not([data-th="aucun"]) #f-chat > .bouton { background: linear-gradient(135deg, var(--th-m1), var(--th-m2)); box-shadow: 0 0 14px var(--th-bord); }
    #chat[data-th]:not([data-th="aucun"]) .lien { color: var(--th-m1); }
    .sys-th { align-self: center; font-size: 0.78rem; color: var(--gris); padding: 4px 12px; border-radius: 999px; background: rgba(0, 0, 0, 0.25); }
    /* appui long : réactions, publication ouverte depuis un message */
    #fil-chat .bulle { position: relative; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
    .bulle.avec-reac { margin-bottom: 14px; }
    .reacs { position: absolute; bottom: -13px; right: 10px; z-index: 2; font-size: 0.8rem; padding: 2px 8px; border-radius: 999px;
      white-space: nowrap; background: var(--noir-2); border: 1px solid var(--contour); }
    .bulle:not(.moi) .reacs { right: auto; left: 10px; }
    .bulle small.modif { text-align: right; font-size: 0.65rem; }
    .reac-barre { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 12px; }
    .reac-btn { flex: 1; max-width: 52px; aspect-ratio: 1; font-size: 1.6rem; line-height: 1; padding: 0; cursor: pointer; border-radius: 50%;
      background: var(--noir); border: 1px solid var(--contour); }
    .reac-btn.actif { border-color: var(--neon); box-shadow: var(--lueur); }
    .bulle[data-vs-reel] { cursor: pointer; }
    .bulle[data-vs-reel]::after { content: "▶"; position: absolute; top: 38%; left: 50%; transform: translate(-50%, -50%);
      font-size: 2.2rem; color: #fff; text-shadow: 0 0 10px #000; pointer-events: none; }
    .bulle[data-vs-duel] { cursor: pointer; }
    #commentaires { z-index: 60; }
    #pub { position: fixed; inset: 0; z-index: 58; background: var(--noir); overflow-y: auto; }
    #pub .reel { height: 100%; margin: 0; border: none; border-radius: 0; box-shadow: none; }
    #pub .reel video { width: 100%; height: 100%; max-height: none; aspect-ratio: auto; object-fit: cover; }
    #pub .reel-info { padding: 40px 80px 28px 16px; }
    #pub-fermer { position: fixed; z-index: 62; top: calc(14px + env(safe-area-inset-top, 0px)); left: 14px; }
    .pub-duel { padding: calc(72px + env(safe-area-inset-top, 0px)) 14px 30px; max-width: 640px; margin: 0 auto; }
    .bulle.appel-manque { border-color: #ff4d5e; color: #ff8a94; }

    /* bouton enregistrer sur les éclairs */
    .reel-actions .sauve.actif svg { stroke: var(--neon); fill: var(--neon); filter: drop-shadow(0 0 6px var(--neon)); }

    /* couleurs */
    .pastilles-couleur { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
    .pastille { width: 44px; height: 44px; border-radius: 50%; cursor: pointer; border: 3px solid transparent; padding: 0; }
    .pastille.actif { border-color: #fff; box-shadow: 0 0 14px rgba(255, 255, 255, 0.5); }

    /* duel à deux */
    .invite-duo { padding: 12px 0; border-bottom: 1px solid var(--contour); }
    .invite-duo:last-child { border-bottom: none; }
    .invite-duo .media { max-height: 220px; }`;
  document.head.appendChild(s);
})();

// ---------- 3. Messages : grand écran, texte long, thèmes ----------
const THEMES_CHAT = [["aucun", "Normal"], ["amour", "💕 Amour"], ["amitie", "🤝 Amitié"], ["flirt", "😘 Flirt"], ["fete", "🎉 Fête"], ["calme", "🌙 Calme"], ["feu", "🔥 Feu"]];
const themeChat = () => (dest ? localStorage.getItem("vs_chat_th_" + dest.id) || "aucun" : "aucun");

(() => {
  const ancien = $("#f-chat input[name=texte]");
  ancien.required = false;
  ancien.style.display = "none";
  const ta = document.createElement("textarea");
  ta.id = "chat-texte";
  ta.rows = 1;
  ta.maxLength = 900;
  ta.autocomplete = "off";
  ta.placeholder = ancien.placeholder || "Ton message";
  ancien.after(ta);
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 130) + "px"; });
  new MutationObserver(() => { ta.placeholder = ancien.placeholder; }).observe(ancien, { attributes: true, attributeFilter: ["placeholder"] });

  // Bouton « trois points » en haut de la discussion : menu des thèmes
  const st = document.createElement("style");
  st.textContent = `
    #chat-menu svg { fill: var(--blanc); stroke: none; }
    #f-chat { position: relative; gap: 8px; padding-top: 6px; }
    #f-chat #chat-photo { order: 1; width: 48px; height: 48px; }
    #f-chat #chat-texte { order: 2; flex: 1; min-width: 0; min-height: 50px; max-height: 140px; font-size: 1.1rem;
      padding: 13px 54px 13px 18px; border-radius: 26px; background: var(--noir-2); }
    #f-chat #chat-vocal { position: absolute; right: 62px; bottom: 6px; width: 40px; height: 40px; border: none; background: transparent; z-index: 2; }
    #f-chat #chat-vocal.actif { background: var(--violet-fonce); }
    #f-chat > .bouton { order: 3; flex: none; width: 50px; height: 50px; padding: 0; border-radius: 50%; display: grid; place-items: center; }
    #f-chat > .bouton svg { width: 22px; height: 22px; stroke: #fff; fill: none; }`;
  const envoi = $("#f-chat > .bouton");
  if (envoi) { envoi.innerHTML = AVION; envoi.setAttribute("aria-label", "Envoyer"); }
  document.head.appendChild(st);
  $("#chat-video").parentNode.insertAdjacentHTML("beforeend",
    '<button type="button" class="outil-chat" id="chat-menu" aria-label="Options de la discussion"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>');
})();

const THEME_DEF = {
  amour: { fond: ["#3d0b24", "#10040b"], moi: ["#ff5e8a", "#b4005a"], autre: "#2b1020", bord: "rgba(255, 94, 138, 0.5)", emojis: ["💕", "💗", "🌹", "💖"] },
  amitie: { fond: ["#08392f", "#04120e"], moi: ["#34d399", "#0f766e"], autre: "#0d2b25", bord: "rgba(52, 211, 153, 0.5)", emojis: ["🤝", "😄", "🌿", "✨"] },
  flirt: { fond: ["#521a33", "#1c0a0a"], moi: ["#ff7ab8", "#ff9a3c"], autre: "#351522", bord: "rgba(255, 154, 60, 0.5)", emojis: ["😘", "😏", "💋", "💘"] },
  fete: { fond: ["#3d1356", "#0d0f33"], moi: ["#ec4899", "#8b5cf6"], autre: "#26143d", bord: "rgba(236, 72, 153, 0.5)", emojis: ["🎉", "🎈", "✨", "🥳"] },
  calme: { fond: ["#0d2147", "#050a18"], moi: ["#60a5fa", "#1e3a8a"], autre: "#0f1b35", bord: "rgba(96, 165, 250, 0.5)", emojis: ["🌙", "⭐", "☁️", "✨"] },
  feu: { fond: ["#4d1305", "#150503"], moi: ["#ff7a18", "#c1121f"], autre: "#301008", bord: "rgba(255, 122, 24, 0.5)", emojis: ["🔥", "⚡", "💥", "🌋"] },
};
let themeVu = null, dernierChoix = 0;

function motifEmojis(liste) {
  const pos = [[10, 38], [76, 26], [38, 84], [100, 98], [112, 58], [8, 124]];
  const t = pos.map((p, k) => `<text x='${p[0]}' y='${p[1]}' font-size='${22 + (k % 3) * 4}'>${liste[k % liste.length]}</text>`).join("");
  return 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>${t}</svg>`) + '")';
}

function appliquerThemeChat(th) {
  const c = $("#chat"), d = THEME_DEF[th];
  const noms = ["--th-f1", "--th-f2", "--th-m1", "--th-m2", "--th-autre", "--th-bord", "--th-motif"];
  c.dataset.th = d ? th : "aucun";
  if (!d) { noms.forEach((n) => c.style.removeProperty(n)); return; }
  c.style.setProperty("--th-f1", d.fond[0]);
  c.style.setProperty("--th-f2", d.fond[1]);
  c.style.setProperty("--th-m1", d.moi[0]);
  c.style.setProperty("--th-m2", d.moi[1]);
  c.style.setProperty("--th-autre", d.autre);
  c.style.setProperty("--th-bord", d.bord);
  c.style.setProperty("--th-motif", motifEmojis(d.emojis));
}
function majThemesChat() { appliquerThemeChat(themeChat()); }

{
  const ancienOuvrir = window.ouvrirChat;
  window.ouvrirChat = function (id, pseudo) {
    ancienOuvrir(id, pseudo);
    majThemesChat();
    $("#chat-texte").value = "";
    $("#chat-texte").style.height = "auto";
  };
}

$("#f-chat").onsubmit = async (e) => {
  e.preventDefault();
  const ta = $("#chat-texte");
  const t = ta.value.trim();
  if (!t || !dest) return;
  const { error } = await db.rpc("envoyer_message", { p_dest: dest.id, p_texte: t });
  if (error) return msg(error.message);
  ta.value = "";
  ta.style.height = "auto";
  cleChat = "";
  rafraichirChat();
};

const msgsChat = new Map();
let reacsChat = new Map();

function marquerBulle(h, m, modifie) {
  const reacs = reacsChat.get(String(m.id)) || [];
  let extra = "";
  if (modifie) extra += '<small class="modif">modifié</small>';
  if (reacs.length) {
    const uniques = [...new Set(reacs.map((x) => x.emoji))];
    extra += `<span class="reacs">${uniques.map(esc).join("")}${reacs.length > 1 ? " " + reacs.length : ""}</span>`;
  }
  h = h.replace(/<\/div>\s*$/, extra + "</div>");
  return h.replace('<div class="bulle ', `<div data-mid="${esc(m.id)}" class="bulle ${reacs.length ? "avec-reac " : ""}`);
}

{
  const ancienBulle = window.bulle;
  window.bulle = function (m) {
    let c = m.contenu || "";
    const mth = /^\[\[theme:(\w+)\]\]/.exec(c);
    if (mth) {
      themeVu = mth[1];
      const nom = (THEMES_CHAT.find((x) => x[0] === mth[1]) || [0, mth[1]])[1];
      const qui = m.sender_id === moi.id ? "Tu as changé le thème" : (dest ? "@" + dest.pseudo : "Ton ami") + " a changé le thème";
      return `<div class="sys-th">🎨 ${esc(qui)} : ${esc(nom)}</div>`;
    }
    c = c.replace(/^\[\[th:\w+\]\]\s?/, "");
    let modifie = false;
    if (c.endsWith("\u200b")) { modifie = true; c = c.slice(0, -1); }
    const moiMsg = m.sender_id === moi.id ? "moi" : "";
    const ma = /^\[\[appel:manque\|(audio|video)\]\]$/.exec(c);
    if (ma) {
      const v = ma[1] === "video" ? "vidéo" : "audio";
      return marquerBulle(`<div class="bulle appel-manque ${moiMsg}">📞 ${moiMsg ? "Appel " + v + " sans réponse" : "Appel " + v + " manqué"}</div>`, m, false);
    }
    const mi = /^\[\[invite:([^\]]+)\]\]\s*([\s\S]*)$/.exec(c);
    if (mi) return marquerBulle(`<div class="bulle ${moiMsg}" data-voir-invites="1"><strong>🤝 Duel à deux</strong><br>${esc(mi[2])}<small>Touche pour répondre</small></div>`, m, false);
    const md = /^\[\[duel:([^\]]+)\]\]\s*([\s\S]*)$/.exec(c);
    if (md) return marquerBulle(`<div class="bulle ${moiMsg}" data-vs-duel="${esc(md[1])}"><strong>⚔️ Duel VS</strong><br>${esc(md[2])}<small>Touche pour voir et voter</small></div>`, m, false);
    if (m.reel_id && m.reels) {
      return marquerBulle(`<div class="bulle ${moiMsg}" data-vs-reel="${esc(m.reel_id)}"><video src="${esc(m.reels.video_url)}#t=0.001" muted playsinline preload="metadata" style="pointer-events:none"></video><small>${esc(m.reels.legende)}</small><small>Touche pour ouvrir la publication</small></div>`, m, false);
    }
    return marquerBulle(ancienBulle({ ...m, contenu: c }), m, modifie);
  };

  // Nouvelle version de l'actualisation de la discussion (messages + réactions + modifications)
  window.rafraichirChat = async function () {
    if (!dest) return;
    const pour = dest.id;
    const { data } = await db.from("messages").select("id,sender_id,contenu,created_at,reel_id,reels(video_url,legende),story_id,stories(media_url,type)")
      .or(`and(sender_id.eq.${moi.id},receiver_id.eq.${pour}),and(sender_id.eq.${pour},receiver_id.eq.${moi.id})`)
      .order("created_at", { ascending: true }).limit(100);
    const liste = data || [];
    const rmap = new Map();
    if (liste.length) {
      const r = await db.from("message_reactions").select("message_id,user_id,emoji").in("message_id", liste.map((x) => x.id));
      (r.data || []).forEach((x) => {
        const k = String(x.message_id);
        if (!rmap.has(k)) rmap.set(k, []);
        rmap.get(k).push(x);
      });
    }
    if (!dest || dest.id !== pour) return;
    const cle = liste.map((x) => x.id + "|" + x.contenu + "|" + (rmap.get(String(x.id)) || []).map((y) => y.user_id + y.emoji).join(",")).join("\n");
    const box = $("#fil-chat");
    if (cle === cleChat && box.innerHTML) return;
    cleChat = cle;
    msgsChat.clear();
    liste.forEach((x) => msgsChat.set(String(x.id), x));
    reacsChat = rmap;
    themeVu = null;
    const bas = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
    box.innerHTML = liste.map((x) => window.bulle(x)).join("") || `<p class="secondaire">Dis bonjour à @${esc(dest.pseudo)} !</p>`;
    if (bas) box.scrollTop = box.scrollHeight;
    if (themeVu !== null && themeVu !== themeChat() && Date.now() - dernierChoix > 8000) {
      localStorage.setItem("vs_chat_th_" + pour, themeVu);
      majThemesChat();
    }
  };
}

function apercuMsg(contenu) {
  const t = String(contenu || "").replace(/^\[\[th:\w+\]\]\s?/, "");
  if (t.startsWith("[[img:")) return "📷 Photo";
  if (t.startsWith("[[voc:")) return "🎤 Message vocal";
  if (t.startsWith("[[appel:")) return "📞 Appel manqué";
  if (t.startsWith("[[theme:")) return "🎨 Thème changé";
  const i = /^\[\[invite:[^\]]+\]\]\s*([\s\S]*)$/.exec(t);
  if (i) return "🤝 Duel à deux : " + i[1];
  const d = /^\[\[duel:[^\]]+\]\]\s*([\s\S]*)$/.exec(t);
  if (d) return "⚔️ Duel : " + d[1];
  return t.replace(/\n/g, " ");
}

document.addEventListener("click", (e) => { if (e.target.closest("[data-voir-invites]")) aller("duels"); });

// ---------- 3b. Menu ⋮ de la discussion + archivées / bloquées ----------
const prefsConv = new Map();
let bloquesIds = new Set(), derniersMsg = new Map(), pseudosMuets = new Set();
const POINTS_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

(() => {
  const st = document.createElement("style");
  st.textContent = "#conv-menu svg { fill: var(--blanc); stroke: none; } .ic-muet { opacity: 0.8; }";
  document.head.appendChild(st);
  const tete = document.querySelector(".conv-tete");
  if (!tete) return;
  const g = document.createElement("div");
  g.style.cssText = "display:flex;gap:8px";
  g.appendChild($("#conv-loupe"));
  g.insertAdjacentHTML("beforeend", `<button type="button" class="outil-chat" id="conv-menu" aria-label="Menu des discussions">${POINTS_SVG}</button>`);
  tete.appendChild(g);
})();

async function chargerPrefs() {
  if (!moi) return;
  const [p, b] = await Promise.all([
    db.from("conv_prefs").select("other_id,muet,archive_at").eq("user_id", moi.id),
    db.from("blocked_users").select("blocked_id").eq("user_id", moi.id),
  ]);
  prefsConv.clear();
  (p.data || []).forEach((x) => prefsConv.set(x.other_id, { muet: !!x.muet, archive_at: x.archive_at }));
  bloquesIds = new Set((b.data || []).map((x) => x.blocked_id));
  const ids = [...prefsConv].filter(([, v]) => v.muet).map(([k]) => k);
  pseudosMuets = new Set();
  if (ids.length) {
    const { data } = await db.from("profiles").select("pseudo").in("id", ids);
    pseudosMuets = new Set((data || []).map((x) => x.pseudo));
  }
}

function estArchive(id) {
  const p = prefsConv.get(id);
  if (!p || !p.archive_at) return false;
  const dernier = derniersMsg.get(id);
  return !dernier || new Date(dernier) <= new Date(p.archive_at);
}

async function majPref(id, champs) {
  const cur = prefsConv.get(id) || { muet: false, archive_at: null };
  const nouv = { ...cur, ...champs };
  const { error } = await db.from("conv_prefs").upsert(
    { user_id: moi.id, other_id: id, muet: nouv.muet, archive_at: nouv.archive_at },
    { onConflict: "user_id,other_id" });
  if (error) { msg("Exécute d'abord conv-prefs.sql dans Supabase."); return false; }
  await chargerPrefs();
  return true;
}

async function dernierMsgAvec(id) {
  const { data } = await db.from("messages").select("created_at")
    .or(`and(sender_id.eq.${moi.id},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${moi.id})`)
    .order("created_at", { ascending: false }).limit(1);
  return data && data[0] ? data[0].created_at : new Date().toISOString();
}

const btnMenu = (act, texte, extra = "") => `<button type="button" class="bouton contour large" data-vs-act="${act}" ${extra}>${texte}</button>`;

function ouvrirMenuChat() {
  const p = prefsConv.get(dest.id) || {};
  $("#menu-actions").innerHTML =
    btnMenu("themes", "🎨 Thème de la discussion")
    + btnMenu("sourdine", p.muet ? "🔔 Réactiver les notifications" : "🔕 Mettre cette discussion en sourdine")
    + btnMenu("archiver", estArchive(dest.id) ? "📦 Désarchiver la discussion" : "📦 Archiver la discussion")
    + btnMenu("bloquer", "🚫 Bloquer @" + esc(dest.pseudo));
  $("#menu").hidden = false;
}

function ouvrirMenuConv() {
  const na = [...prefsConv].filter(([id]) => estArchive(id)).length;
  $("#menu-actions").innerHTML =
    btnMenu("voir-archives", "📦 Discussions archivées (" + na + ")")
    + btnMenu("voir-bloques", "🚫 Personnes bloquées (" + bloquesIds.size + ")");
  $("#menu").hidden = false;
}

function listeThemes() {
  const th = themeChat();
  $("#menu-actions").innerHTML = '<p class="secondaire">Choisis un thème : il change tout pour vous deux.</p>'
    + THEMES_CHAT.map(([k, n]) => `<button type="button" class="bouton ${k === th ? "" : "contour"} large" data-chat-th="${k}">${n}</button>`).join("");
}

async function choisirTheme(k) {
  if (!dest) return;
  const pour = dest.id;
  localStorage.setItem("vs_chat_th_" + pour, k);
  dernierChoix = Date.now();
  majThemesChat();
  $("#menu").hidden = true;
  const { error } = await db.rpc("envoyer_message", { p_dest: pour, p_texte: "[[theme:" + k + "]]" });
  if (error) return msg(error.message);
  if (dest && dest.id === pour) { cleChat = ""; rafraichirChat(); }
}

async function afficherArchives() {
  await chargerPrefs();
  const ids = [...prefsConv].filter(([id]) => estArchive(id)).map(([id]) => id);
  let lignes = '<p class="secondaire">Aucune discussion archivée.</p>';
  if (ids.length) {
    const { data } = await db.from("profiles").select("id,pseudo").in("id", ids);
    lignes = (data || []).map((p) => `<div class="ligne"><span data-vs-act="ouvrir" data-id="${p.id}" data-pseudo="${esc(p.pseudo)}" style="cursor:pointer">@${esc(p.pseudo)}</span>
      <button type="button" class="bouton contour" data-vs-act="desarchiver" data-id="${p.id}">Désarchiver</button></div>`).join("");
  }
  $("#menu-actions").innerHTML = '<button type="button" class="lien" data-vs-act="menu-conv">← Retour</button><p class="secondaire">Discussions archivées</p>' + lignes;
}

async function afficherBloques() {
  const { data } = await db.from("blocked_users").select("blocked_id,profiles!blocked_users_blocked_id_fkey(pseudo)").eq("user_id", moi.id);
  const lignes = data && data.length
    ? data.map((x) => `<div class="ligne"><span>@${esc(x.profiles.pseudo)}</span>
      <button type="button" class="bouton contour" data-vs-act="debloquer" data-id="${x.blocked_id}">Débloquer</button></div>`).join("")
    : '<p class="secondaire">Aucune personne bloquée.</p>';
  $("#menu-actions").innerHTML = '<button type="button" class="lien" data-vs-act="menu-conv">← Retour</button><p class="secondaire">Personnes bloquées</p>' + lignes;
}

document.addEventListener("click", async (e) => {
  if (e.target.closest("#chat-menu") && dest) return ouvrirMenuChat();
  if (e.target.closest("#conv-menu")) return ouvrirMenuConv();
  const t = e.target.closest("[data-chat-th]");
  if (t) return choisirTheme(t.dataset.chatTh);
  const a = e.target.closest("[data-vs-act]");
  if (!a) return;
  const k = a.dataset.vsAct, id = a.dataset.id;
  if (k === "themes") return listeThemes();
  if (k === "menu-conv") return ouvrirMenuConv();
  if (k === "voir-archives") return afficherArchives();
  if (k === "voir-bloques") return afficherBloques();
  if (k === "ouvrir") { $("#menu").hidden = true; return ouvrirChat(id, a.dataset.pseudo); }
  if (k === "sourdine" && dest) {
    const muet = !(prefsConv.get(dest.id) || {}).muet;
    if (await majPref(dest.id, { muet })) msg(muet ? "Discussion en sourdine" : "Notifications réactivées");
    $("#menu").hidden = true;
    return;
  }
  if (k === "archiver" && dest) {
    const deja = estArchive(dest.id);
    const quand = deja ? null : await dernierMsgAvec(dest.id);
    if (await majPref(dest.id, { archive_at: quand })) {
      msg(deja ? "Discussion désarchivée" : "Discussion archivée");
      $("#menu").hidden = true;
      if (!deja) chargerMessages();
    }
    return;
  }
  if (k === "desarchiver") {
    if (await majPref(id, { archive_at: null })) { afficherArchives(); chargerMessages(); }
    return;
  }
  if (k === "bloquer" && dest) {
    if (!confirm("Bloquer @" + dest.pseudo + " ? Tu ne verras plus ses contenus et il ne pourra plus t'écrire.")) return;
    const { error } = await db.from("blocked_users").insert({ user_id: moi.id, blocked_id: dest.id });
    if (error) return msg(error.message);
    $("#menu").hidden = true;
    msg("@" + dest.pseudo + " est bloqué.");
    await chargerPrefs();
    chargerMessages();
    return;
  }
  if (k === "debloquer") {
    const { error } = await db.from("blocked_users").delete().eq("user_id", moi.id).eq("blocked_id", id);
    if (error) return msg(error.message);
    await chargerPrefs();
    afficherBloques();
    chargerMessages();
  }
});

// Liste des discussions : cache archivées et bloquées, marque les sourdines
envelopper("chargerMessages", async () => {
  await chargerPrefs();
  const { data } = await db.from("messages").select("sender_id,receiver_id,created_at").order("created_at", { ascending: false }).limit(200);
  derniersMsg = new Map();
  (data || []).forEach((m) => {
    const o = m.sender_id === moi.id ? m.receiver_id : m.sender_id;
    if (!derniersMsg.has(o)) derniersMsg.set(o, m.created_at);
  });
  let reste = 0;
  document.querySelectorAll("#liste-conv .conv[data-id]").forEach((el) => {
    const id = el.dataset.id;
    if (bloquesIds.has(id) || estArchive(id)) { el.remove(); return; }
    reste++;
    const p = prefsConv.get(id), nom = el.querySelector(".nom");
    if (p && p.muet && nom && !el.querySelector(".ic-muet")) nom.insertAdjacentHTML("beforeend", ' <small class="ic-muet">🔕</small>');
  });
  if (!reste) $("#liste-conv").innerHTML = '<p class="secondaire">Aucune discussion. Cherche un pseudo avec la loupe, ou ouvre ⋮ pour voir les archivées.</p>';
}, "messages");

// Sourdine : pas de son ni de message à l'écran pour une discussion en sourdine
{
  const ancienAlerter = window.alerter;
  window.alerter = function (texte) {
    const m = /^Nouveau message de @(\S+)$/.exec(texte || "");
    if (m && pseudosMuets.has(m[1])) {
      majBadges();
      if (pageActuelle === "messages" && !dest) chargerMessages();
      return;
    }
    return ancienAlerter(texte);
  };
}

// ---------- 3c. Appui long sur un message + ouvrir la publication / le duel partagé ----------
const EMOJIS_REAC = ["❤️", "😂", "😮", "😢", "😡", "👍"];
let ignorerClicJusque = 0;
const texteMsg = (m) => String(m.contenu || "").replace(/\u200b$/, "");
const estTexteSimple = (m) => !m.story_id && !m.reel_id && !/^\[\[/.test(m.contenu || "");

function ouvrirMenuMsg(mid) {
  const m = msgsChat.get(String(mid));
  if (!m) return;
  const mien = m.sender_id === moi.id;
  const mienne = (reacsChat.get(String(mid)) || []).find((x) => x.user_id === moi.id);
  const btn = (k, t) => `<button type="button" class="bouton contour large" data-vs-msg="${k}" data-mid="${esc(mid)}">${t}</button>`;
  let h = '<div class="reac-barre">' + EMOJIS_REAC.map((e) =>
    `<button type="button" class="reac-btn ${mienne && mienne.emoji === e ? "actif" : ""}" data-vs-msg="react" data-mid="${esc(mid)}" data-emoji="${e}">${e}</button>`).join("") + "</div>";
  if (estTexteSimple(m)) h += btn("copy", "📋 Copier");
  if (mien && estTexteSimple(m)) h += btn("edit", "✏️ Modifier");
  if (mien) h += btn("del", "🗑️ Supprimer");
  $("#menu-actions").innerHTML = h;
  $("#menu").hidden = false;
}

(() => {
  const fil = $("#fil-chat");
  let t = null, dep = null;
  const stop = () => { clearTimeout(t); t = null; };
  fil.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".bulle[data-mid]");
    if (!b || e.target.closest("audio, video[controls]")) return;
    dep = { x: e.clientX, y: e.clientY };
    stop();
    t = setTimeout(() => {
      t = null;
      ignorerClicJusque = Date.now() + 700;
      if (navigator.vibrate) navigator.vibrate(25);
      ouvrirMenuMsg(b.dataset.mid);
    }, 450);
  });
  fil.addEventListener("pointermove", (e) => { if (t && dep && Math.hypot(e.clientX - dep.x, e.clientY - dep.y) > 10) stop(); });
  ["pointerup", "pointercancel", "pointerleave"].forEach((n) => fil.addEventListener(n, stop));
  fil.addEventListener("contextmenu", (e) => e.preventDefault());
  fil.addEventListener("click", (e) => {
    if (Date.now() < ignorerClicJusque) { e.stopPropagation(); e.preventDefault(); }
  }, true);
})();

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-vs-msg]");
  if (!b) return;
  const m = msgsChat.get(String(b.dataset.mid));
  if (!m) return;
  const k = b.dataset.vsMsg;
  $("#menu").hidden = true;
  const rafraichir = () => { cleChat = ""; rafraichirChat(); };
  if (k === "react") {
    const mienne = (reacsChat.get(String(m.id)) || []).find((x) => x.user_id === moi.id);
    const emoji = b.dataset.emoji;
    const { error } = mienne && mienne.emoji === emoji
      ? await db.from("message_reactions").delete().eq("message_id", m.id).eq("user_id", moi.id)
      : await db.from("message_reactions").upsert({ message_id: m.id, user_id: moi.id, emoji }, { onConflict: "message_id,user_id" });
    if (error) return msg("Exécute d'abord vs-messages.sql dans Supabase.");
    return rafraichir();
  }
  if (k === "copy") {
    try { await navigator.clipboard.writeText(texteMsg(m)); msg("Message copié"); } catch (err) { msg("Impossible de copier."); }
    return;
  }
  if (k === "edit") {
    const t = prompt("Modifier le message", texteMsg(m));
    if (t === null) return;
    const n = t.trim().slice(0, 900);
    if (!n || n === texteMsg(m)) return;
    const { error } = await db.rpc("modifier_message", { p_id: String(m.id), p_texte: n + "\u200b" });
    if (error) return msg("Impossible de modifier : exécute vs-messages.sql dans Supabase.");
    return rafraichir();
  }
  if (k === "del") {
    if (!confirm("Supprimer ce message pour tout le monde ?")) return;
    const { error } = await db.rpc("supprimer_message", { p_id: String(m.id) });
    if (error) return msg("Impossible de supprimer : exécute vs-messages.sql dans Supabase.");
    msg("Message supprimé");
    rafraichir();
  }
});

// Publication / duel ouverts directement depuis un message partagé
document.body.insertAdjacentHTML("beforeend", '<div id="pub" hidden></div>');

function fermerPub() {
  const box = $("#pub");
  const v = box.querySelector("video");
  if (v) v.pause();
  box.hidden = true;
  box.innerHTML = "";
}

const ICONE_COMM = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

async function ouvrirPublication(id) {
  const { data: r, error } = await db.from("reels")
    .select("id,user_id,video_url,legende,profiles!reels_user_id_fkey(pseudo),reel_likes(user_id),reel_comments(count)").eq("id", id).maybeSingle();
  if (error || !r) return msg("Cette publication n'existe plus.");
  let suit = false;
  if (r.user_id !== moi.id) {
    const f = await db.from("follows").select("followed_id").eq("follower_id", moi.id).eq("followed_id", r.user_id).maybeSingle();
    suit = !!f.data;
  }
  const sv = await db.from("reel_prefs").select("reel_id").eq("user_id", moi.id).eq("reel_id", r.id).eq("kind", "saved").maybeSingle();
  const sauve = !!sv.data, aime = r.reel_likes.some((l) => l.user_id === moi.id);
  const ps = esc(r.profiles.pseudo);
  $("#pub").innerHTML = `<button type="button" class="cam-rond" id="pub-fermer" aria-label="Fermer">✕</button>
    <article class="reel">
      <video src="${esc(r.video_url)}" loop muted playsinline autoplay></video>
      <button class="points3" data-type="reel" data-id="${r.id}" data-user="${r.user_id}" data-pseudo="${ps}" data-url="${esc(r.video_url)}" data-legende="${esc(r.legende)}">${ICONE3}</button>
      <div class="reel-actions">
        <button class="coeur ${aime ? "actif" : ""}" data-id="${r.id}" data-aime="${aime}"><span>♥</span><small>${r.reel_likes.length}</small></button>
        <button class="comm" data-id="${r.id}"><span>${ICONE_COMM}</span><small>${r.reel_comments[0]?.count ?? 0}</small></button>
        <button class="partage" data-id="${r.id}" data-user="${r.user_id}" data-pseudo="${ps}" data-url="${esc(r.video_url)}"><span>${AVION}</span><small>Envoyer</small></button>
        <button class="sauve ${sauve ? "actif" : ""}" data-id="${r.id}" data-sauve="${sauve}"><span>${ICONE_SAUVER}</span><small>${sauve ? "Gardé" : "Sauver"}</small></button>
      </div>
      <div class="reel-info"><strong class="lien-profil" data-profil="${r.user_id}">@${ps}</strong><p>${esc(r.legende)}</p>
      ${r.user_id === moi.id ? "" : boutonSuivre(r.user_id, suit)}</div></article>`;
  $("#pub").hidden = false;
  const v = $("#pub video");
  if (v) v.play().catch(() => {});
}

async function ouvrirDuelPub(id) {
  const { data, error } = await db.rpc("duels_liste");
  const d = (data || []).find((x) => String(x.id) === String(id));
  if (error || !d) return msg("Ce duel n'existe plus.");
  const a = Number(d.votes_a), b = Number(d.votes_b), t = a + b, pa = t ? Math.round((a * 100) / t) : 50;
  const fini = new Date(d.fin) < new Date();
  const fin = new Date(d.fin).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  let bas;
  if (fini) bas = `<p><strong>${a === b ? "Égalité" : "Gagnant : " + (a > b ? "A" : "B")}</strong></p>`;
  else if (d.mon_vote) bas = `<p class="secondaire">Tu as voté ${esc(String(d.mon_vote).toUpperCase())}</p>`;
  else bas = `<div class="deux"><button class="bouton large" data-pub-vote="a" data-pub-id="${esc(d.id)}">Voter A</button>
    <button class="bouton contour large" data-pub-vote="b" data-pub-id="${esc(d.id)}">Voter B</button></div>`;
  $("#pub").innerHTML = `<button type="button" class="cam-rond" id="pub-fermer" aria-label="Fermer">✕</button>
    <div class="pub-duel"><article class="carte duel"><strong style="display:block">${esc(d.titre)}</strong>
    <p class="secondaire">${esc(d.categorie)}, par @${esc(d.pseudo)} — ${fini ? "terminé" : "fin le " + fin}</p>
    <div class="duel-ligne" style="margin-top:12px">${media(d.type, d.image_a, "A")}<div class="vs">VS</div>${media(d.type, d.image_b, "B")}</div>
    <div class="barre"><i style="width:${pa}%"></i></div>
    <p class="secondaire">A ${pa} % · B ${100 - pa} % · ${t} vote${t > 1 ? "s" : ""}</p>${bas}</article></div>`;
  $("#pub").hidden = false;
}

document.addEventListener("click", async (e) => {
  if (e.target.closest("#pub-fermer")) return fermerPub();
  if (e.target.closest("#pub [data-profil]")) fermerPub();
  const r = e.target.closest("[data-vs-reel]");
  if (r) return ouvrirPublication(r.dataset.vsReel);
  const d = e.target.closest("[data-vs-duel]");
  if (d) return ouvrirDuelPub(d.dataset.vsDuel);
  const v = e.target.closest("[data-pub-vote]");
  if (v) {
    const id = v.dataset.pubId;
    const { error } = await db.rpc("voter", { p_duel: String(id), p_choix: v.dataset.pubVote });
    if (error) msg(error.message);
    else { msg("Vote enregistré !"); majProfil(); }
    ouvrirDuelPub(id);
  }
});

// ---------- 4. Profils : « en retour » à la place des éclairs ----------
let profilVuId = null;

async function compterEnRetour(id) {
  const [a, b] = await Promise.all([
    db.from("follows").select("follower_id").eq("followed_id", id),
    db.from("follows").select("followed_id").eq("follower_id", id),
  ]);
  if (a.error || b.error) return null;
  const s = new Set((a.data || []).map((x) => x.follower_id));
  return (b.data || []).filter((x) => s.has(x.followed_id)).length;
}

envelopper("chargerProfil", async () => {
  const el = document.querySelector("#fiche .stats");
  if (!el || el.querySelector("#stat-retour")) return;
  el.insertAdjacentHTML("beforeend", '<div class="stat"><strong id="stat-retour">…</strong><span>En retour</span></div>');
  const n = await compterEnRetour(moi.id);
  const s = $("#stat-retour");
  if (s) s.textContent = n === null ? "0" : n;
}, "profil");

envelopper("voirProfil", async (id) => {
  if (id === moi.id) return;
  profilVuId = id;
  document.querySelectorAll("#fiche-autre .stat").forEach((st) => {
    const sp = st.querySelector("span");
    if (sp && sp.textContent === "Éclairs") {
      sp.textContent = "En retour";
      const nb = st.querySelector("strong");
      nb.textContent = "…";
      compterEnRetour(id).then((n) => { nb.textContent = n === null ? "–" : n; });
    }
  });
  majEnLigne();
});

// ---------- 5. Bouton « enregistrer » sur les éclairs ----------
const ICONE_SAUVER = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

envelopper("chargerFeed", async () => {
  const { data } = await db.from("reel_prefs").select("reel_id").eq("user_id", moi.id).eq("kind", "saved");
  const sauves = new Set((data || []).map((x) => x.reel_id));
  document.querySelectorAll("#liste-reels .reel").forEach((r) => {
    const actions = r.querySelector(".reel-actions"), coeur = r.querySelector(".coeur");
    if (!actions || !coeur || actions.querySelector(".sauve")) return;
    const id = coeur.dataset.id, on = sauves.has(id);
    actions.insertAdjacentHTML("beforeend", `<button class="sauve ${on ? "actif" : ""}" data-id="${id}" data-sauve="${on}"><span>${ICONE_SAUVER}</span><small>${on ? "Gardé" : "Sauver"}</small></button>`);
  });
}, "feed");

document.addEventListener("click", async (e) => {
  const b = e.target.closest(".sauve");
  if (!b) return;
  const on = b.dataset.sauve === "true";
  const { error } = on
    ? await db.from("reel_prefs").delete().eq("user_id", moi.id).eq("reel_id", b.dataset.id).eq("kind", "saved")
    : await db.from("reel_prefs").insert({ user_id: moi.id, reel_id: b.dataset.id, kind: "saved" });
  if (error) return msg(error.message);
  b.dataset.sauve = String(!on);
  b.classList.toggle("actif", !on);
  b.querySelector("small").textContent = on ? "Sauver" : "Gardé";
  msg(on ? "Retiré des enregistrements" : "Éclair enregistré, retrouve-le dans ton profil");
});

// ---------- 6. Appels : sonnerie pour celui qui appelle + appel manqué ----------
function wavSimple(taux, secondes, f) {
  const n = Math.floor(taux * secondes), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, taux, true);
  v.setUint32(28, taux * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f(i / taux))) * 32767, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
let vsRing = null, vsEnLancement = false;
function creerRing() {
  const a = new Audio(wavSimple(16000, 4, (t) => (t < 1.4
    ? (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.3 * Math.min(1, t * 40, (1.4 - t) * 40) : 0)));
  a.loop = true;
  a.volume = 0.8;
  return a;
}
setInterval(() => {
  if (vsRing && !vsRing.paused && !(vsEnLancement || (appel && !appel.debut && appel.sortant))) vsRing.pause();
}, 400);

{
  const ancienLancer = window.lancerAppel;
  window.lancerAppel = async function (video = false) {
    if (!dest || appel) return;
    vsEnLancement = true;
    try {
      vsRing = vsRing || creerRing();
      vsRing.currentTime = 0;
      vsRing.play().catch(() => {});
      await ancienLancer(video);
      if (appel) {
        const a = appel;
        a.sortant = true;
        a.videoAppel = !!video;
        // Prévient le téléphone de l'autre même si VS est fermé
        db.functions.invoke("swift-api", { body: { type: "appel", to: a.autre, video: !!video } }).catch(() => {});
        // Renvoie l'appel pendant la sonnerie : l'autre peut l'attraper en ouvrant VS depuis la notification
        a.relance = setInterval(() => {
          if (appel !== a || a.debut) { clearInterval(a.relance); return; }
          signal(a.autre, { type: "offre", video: !!a.cam, sdp: a.pc.localDescription.toJSON() }).catch(() => {});
        }, 3000);
      }
    } finally { vsEnLancement = false; }
  };
  const ancienTerminer = window.terminerAppel;
  window.terminerAppel = function (prevenir = true) {
    const a = appel;
    if (a && a.relance) clearInterval(a.relance);
    if (a && (a.sortant || vsEnLancement) && !a.debut && prevenir) {
      const v = a.videoAppel !== undefined ? a.videoAppel : !!a.cam;
      db.rpc("envoyer_message", { p_dest: a.autre, p_texte: "[[appel:manque|" + (v ? "video" : "audio") + "]]" })
        .then(() => { if (dest && dest.id === a.autre) { cleChat = ""; rafraichirChat(); } });
    }
    return ancienTerminer(prevenir);
  };
}

{
  const ancienRecu = window.recuAppel;
  window.recuAppel = function (p) {
    if (p && p.type === "offre") {
      if (entrant && entrant.de === p.de) { entrant.sdp = p.sdp; return; }
      if (appel && appel.autre === p.de) return;
    }
    return ancienRecu(p);
  };
}

// ---------- 7. Comptes multiples (8 maximum) ----------
function lireComptes() {
  try { return JSON.parse(localStorage.getItem("vs_comptes") || "[]"); } catch (e) { return []; }
}
function ecrireComptes(liste) {
  try { localStorage.setItem("vs_comptes", JSON.stringify(liste.slice(0, VS_MAX_COMPTES))); } catch (e) {}
}
function sauverCompte(session) {
  const u = session.user, tous = lireComptes();
  const maj = { id: u.id, email: u.email || "", access_token: session.access_token, refresh_token: session.refresh_token };
  if (tous.some((c) => c.id === u.id)) ecrireComptes(tous.map((c) => (c.id === u.id ? { ...c, ...maj } : c)));
  else ecrireComptes([...tous.slice(0, VS_MAX_COMPTES - 1), { ...maj }]);
}

async function changerCompte(id) {
  if (moi && moi.id === id) return;
  const c = lireComptes().find((x) => x.id === id);
  if (!c) return;
  if (!c.refresh_token) {
    const f = $("#f-login");
    if (!moi && f) { $("#f-signup").hidden = true; f.hidden = false; f.email.value = c.email; f.password.focus(); }
    return msg("Entre le mot de passe de ce compte.");
  }
  msg("Changement de compte…");
  const { error } = await db.auth.setSession({ access_token: c.access_token, refresh_token: c.refresh_token });
  if (error) {
    ecrireComptes(lireComptes().map((x) => (x.id === id ? { ...x, access_token: "", refresh_token: "" } : x)));
    msg("Session expirée : reconnecte-toi avec le mot de passe.");
    if (moi) { await db.auth.signOut({ scope: "local" }); } else afficherComptesAuth();
  }
}

async function ajouterCompte() {
  if (lireComptes().length >= VS_MAX_COMPTES) return msg("Maximum " + VS_MAX_COMPTES + " comptes.");
  await db.auth.signOut({ scope: "local" });
}

function afficherComptesAuth() {
  const form = document.getElementById("f-login");
  if (!form) return;
  let box = document.getElementById("comptes-auth");
  if (!box) { box = document.createElement("div"); box.id = "comptes-auth"; form.before(box); }
  const liste = lireComptes().filter((c) => c.email);
  box.innerHTML = liste.length
    ? `<p class="secondaire">Comptes sur ce téléphone (touche pour te connecter)</p>` + liste.map((c) => {
        const nom = c.pseudo || c.email;
        return `<div class="rang" data-switch-compte="${esc(c.id)}" style="cursor:pointer">${miniAvatar({ avatar_url: c.avatar_url, pseudo: nom })}<span class="nom">${c.pseudo ? "@" + esc(c.pseudo) : esc(c.email)}</span>
          <button type="button" class="lien" data-oublier-compte="${esc(c.id)}" style="margin:0">Retirer</button></div>`;
      }).join("")
    : "";
}

function rendreComptes() {
  const box = $("#liste-comptes");
  if (!box) return;
  const l = lireComptes();
  box.innerHTML = l.map((c) => {
    const nom = c.pseudo || c.email, actuel = moi && moi.id === c.id;
    return `<div class="rang">${miniAvatar({ avatar_url: c.avatar_url, pseudo: nom })}<span class="nom">${c.pseudo ? "@" + esc(c.pseudo) : esc(c.email)}</span>
      ${actuel ? '<span class="score">Actuel</span>' : `<button type="button" class="bouton contour" data-switch-compte="${esc(c.id)}">Changer</button>`}</div>`;
  }).join("") + `<button type="button" class="bouton large" id="ajouter-compte" style="margin-top:12px">+ Ajouter un compte (${l.length}/${VS_MAX_COMPTES})</button>`;
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-oublier-compte]")) return;
  if (e.target.closest("#ajouter-compte")) return ajouterCompte();
  const sw = e.target.closest("[data-switch-compte]");
  if (sw) changerCompte(sw.dataset.switchCompte);
});

$("#deconnexion").onclick = () => {
  if (!confirm("Te déconnecter de ce compte ?")) return;
  if (moi) retirerCompte(moi.id);
  db.auth.signOut();
};

// ---------- 8. En ligne (présence) ----------
let canalPresence = null;
const enLigne = new Set();
const montrerEnLigne = () => localStorage.getItem("vs_ligne") !== "0";

function demarrerPresence() {
  if (!moi) return;
  if (canalPresence) db.removeChannel(canalPresence);
  enLigne.clear();
  const c = db.channel("vs-presence", { config: { presence: { key: moi.id } } });
  canalPresence = c;
  c.on("presence", { event: "sync" }, () => {
    enLigne.clear();
    Object.keys(c.presenceState()).forEach((k) => enLigne.add(k));
    majEnLigne();
  }).subscribe(async (s) => { if (s === "SUBSCRIBED" && montrerEnLigne() && !document.hidden) await c.track({ t: Date.now() }); });
}

document.addEventListener("visibilitychange", () => {
  if (!canalPresence) return;
  if (document.hidden) canalPresence.untrack();
  else if (montrerEnLigne()) canalPresence.track({ t: Date.now() });
});

function majEnLigne() {
  document.querySelectorAll(".conv[data-id] .nom, .rang[data-profil] .nom").forEach((n) => {
    const ligne = n.closest(".conv[data-id], .rang[data-profil]");
    const id = ligne.dataset.id || ligne.dataset.profil;
    const a = n.querySelector(".pt-ligne"), on = enLigne.has(id);
    if (on && !a) n.insertAdjacentHTML("afterbegin", '<i class="pt-ligne"></i>');
    else if (!on && a) a.remove();
  });
  document.querySelectorAll("[data-note-de]").forEach((n) => n.classList.toggle("en-ligne-av", enLigne.has(n.dataset.noteDe)));
  const poser = (el, id) => {
    if (!el) return;
    const s = el.querySelector(".statut"), on = !!id && enLigne.has(id);
    if (on && !s) el.insertAdjacentHTML("beforeend", '<small class="statut"><i class="pt-ligne"></i>En ligne</small>');
    else if (!on && s) s.remove();
  };
  if ($("#chat") && !$("#chat").hidden && dest) poser($("#chat-titre"), dest.id);
  poser(document.querySelector("#fiche-autre h1"), pageActuelle === "autre" ? profilVuId : null);
}
setInterval(majEnLigne, 2000);

// Champ « fichier » au même style que le duel solo
const VS_IC_ENVOI = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16"/></svg>';
const VS_IC_OK = '<svg viewBox="0 0 24 24" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>';
function ameliorerFichierVS(input) {
  if (!input || input.hidden || input.dataset.pro) return;
  input.dataset.pro = "1";
  const acc = input.accept || "";
  const img = acc.includes("image"), vid = acc.includes("video");
  const titre = img && vid ? "Choisir une photo ou une vidéo" : vid ? "Choisir une vidéo" : img ? "Choisir une photo" : "Choisir un fichier";
  const boite = document.createElement("div");
  boite.className = "fichier";
  input.parentNode.insertBefore(boite, input);
  boite.innerHTML = `<span class="fichier-icone">${VS_IC_ENVOI}</span><span class="fichier-texte"><strong>${titre}</strong><small>Touche pour parcourir</small></span>`;
  boite.appendChild(input);
  let url = null;
  const maj = () => {
    const f = input.files && input.files[0];
    if (url) { URL.revokeObjectURL(url); url = null; }
    boite.classList.toggle("choisi", !!f);
    const ic = boite.querySelector(".fichier-icone"), sm = boite.querySelector("small");
    if (!f) { ic.innerHTML = VS_IC_ENVOI; sm.textContent = "Touche pour parcourir"; return; }
    if (f.type.startsWith("image/")) { url = URL.createObjectURL(f); ic.innerHTML = `<img src="${url}" alt="">`; }
    else ic.innerHTML = VS_IC_OK;
    sm.textContent = f.name + " · " + (f.size / 1048576).toFixed(1) + " Mo";
  };
  input.addEventListener("change", maj);
  if (input.form) input.form.addEventListener("reset", () => setTimeout(maj, 0));
}

// ---------- 9. Duel à deux ----------
const optionsCat = ["Mode", "Beauté", "Humour", "Sport", "Musique", "Gaming", "Créativité", "Lifestyle"].map((c) => `<option>${c}</option>`).join("");
const invitesDuo = new Map();

(() => {
  const zone = document.createElement("div");
  zone.id = "invites-duo";
  const f = document.createElement("form");
  f.id = "f-duo";
  f.className = "carte";
  f.innerHTML = `<h2 style="margin-top:0">Duel à deux 🤝</h2>
    <p class="secondaire">Toi et un ami envoyez chacun une photo ou une vidéo : le duel démarre dès qu'il accepte.</p>
    <input name="titre" placeholder="Titre du duel" minlength="3" maxlength="50" required>
    <select name="categorie">${optionsCat}</select>
    <select name="ami" required><option value="">Choisir un ami…</option></select>
    <label>Ton contenu (photo ou vidéo, 30 Mo max)</label>
    <input name="a" type="file" accept="image/*,video/*" required>
    <button class="bouton large" style="margin-top:10px">Envoyer l'invitation</button>`;
  $("#f-duel").before(zone, f);
  f.querySelectorAll('input[type="file"]').forEach(ameliorerFichierVS);

  f.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const fa = f.a.files[0];
      const type = fa.type.startsWith("video/") ? "video" : "image";
      msg("Envoi en cours…");
      const url = await envoyerImage(fa, true);
      const titre = f.titre.value.trim();
      const { data, error } = await db.from("duel_invites")
        .insert({ to_id: f.ami.value, titre, categorie: f.categorie.value, media_a: url, type }).select("id").single();
      if (error) throw error;
      await db.rpc("envoyer_message", { p_dest: f.ami.value, p_texte: "[[invite:" + data.id + "]] " + titre });
      f.reset();
      msg("Invitation envoyée !");
      afficherInvites();
    } catch (err) { msg(err.message); }
  };
})();

async function afficherInvites() {
  const box = $("#invites-duo");
  if (!box || !moi) return;
  const [{ data, error }, { data: amis }] = await Promise.all([
    db.from("duel_invites")
      .select("id,from_id,to_id,titre,categorie,media_a,type,de:profiles!duel_invites_from_id_fkey(pseudo),vers:profiles!duel_invites_to_id_fkey(pseudo)")
      .eq("statut", "attente").order("created_at", { ascending: false }),
    db.from("follows").select("followed_id,profiles!follows_followed_id_fkey(pseudo)").eq("follower_id", moi.id),
  ]);
  const sel = $("#f-duo").ami, courant = sel.value;
  sel.innerHTML = '<option value="">Choisir un ami…</option>' + (amis || []).map((x) => `<option value="${x.followed_id}">@${esc(x.profiles.pseudo)}</option>`).join("");
  sel.value = courant;
  if (error || !data || !data.length) { box.innerHTML = ""; return; }
  invitesDuo.clear();
  data.forEach((d) => invitesDuo.set(d.id, d));
  const recues = data.filter((d) => d.to_id === moi.id), envoyees = data.filter((d) => d.from_id === moi.id);
  let h = "";
  if (recues.length) {
    h += `<div class="carte"><h2 style="margin-top:0">Invitations reçues</h2>` + recues.map((d) => `<div class="invite-duo">
      <strong>${esc(d.titre)}</strong><p class="secondaire">${esc(d.categorie)}, de @${esc(d.de.pseudo)}</p>
      ${d.type === "video" ? `<video class="media" src="${esc(d.media_a)}#t=0.001" controls playsinline preload="metadata"></video>` : `<img class="media zoom" src="${esc(d.media_a)}" alt="">`}
      <label>Ton contenu (${d.type === "video" ? "une vidéo" : "une photo"})</label>
      <input type="file" accept="${d.type === "video" ? "video/*" : "image/*"}" data-duo-fichier="${d.id}">
      <div class="deux"><button type="button" class="bouton large" data-duo-ok="${d.id}">Relever le défi</button>
      <button type="button" class="bouton contour large" data-duo-non="${d.id}">Refuser</button></div></div>`).join("") + `</div>`;
  }
  if (envoyees.length) {
    h += `<div class="carte"><h2 style="margin-top:0">Invitations envoyées</h2>` + envoyees.map((d) => `<div class="ligne">
      <span>${esc(d.titre)} · attend @${esc(d.vers.pseudo)}</span><button type="button" class="bouton contour" data-duo-non="${d.id}">Annuler</button></div>`).join("") + `</div>`;
  }
  box.innerHTML = h;
  box.querySelectorAll('input[type="file"]').forEach(ameliorerFichierVS);
}

envelopper("chargerDuels", afficherInvites, "duels");

document.addEventListener("click", async (e) => {
  const non = e.target.closest("[data-duo-non]");
  if (non) {
    const { error } = await db.from("duel_invites").delete().eq("id", non.dataset.duoNon);
    msg(error ? error.message : "Invitation retirée");
    return afficherInvites();
  }
  const ok = e.target.closest("[data-duo-ok]");
  if (!ok) return;
  const inv = invitesDuo.get(ok.dataset.duoOk);
  const champ = document.querySelector(`[data-duo-fichier="${ok.dataset.duoOk}"]`);
  const fb = champ && champ.files[0];
  if (!inv || !fb) return msg("Choisis d'abord ton contenu.");
  const tb = fb.type.startsWith("video/") ? "video" : "image";
  if (tb !== inv.type) return msg("Il faut " + (inv.type === "video" ? "une vidéo" : "une photo") + ", comme ton ami.");
  try {
    ok.disabled = true;
    msg("Envoi en cours…");
    const b = await envoyerImage(fb, true);
    const titre = (inv.titre + " · @" + inv.de.pseudo + " × @" + moi.pseudo).slice(0, 80);
    const { error } = await db.rpc("creer_duel", { p_titre: titre, p_cat: inv.categorie, p_a: inv.media_a, p_b: b, p_type: inv.type });
    if (error) throw error;
    await db.from("duel_invites").update({ statut: "accepte" }).eq("id", inv.id);
    db.rpc("envoyer_message", { p_dest: inv.from_id, p_texte: "Ton duel à deux « " + inv.titre + " » est lancé ! Va voter dans Duels." });
    msg("Duel lancé !");
    await majProfil();
    chargerDuels();
  } catch (err) { msg(err.message); ok.disabled = false; }
});

// ---------- 10. Notifications même quand VS est fermé (Web Push) ----------
function b64Vers8(b) {
  const s = (b + "=".repeat((4 - (b.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function activerPush(silencieux) {
  const dire = (t) => { if (!silencieux) msg(t); };
  if (!moi) return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return dire("Non disponible ici. Sur iPhone : ajoute VS à l'écran d'accueil (iOS 16.4 minimum).");
  if (VS_VAPID.startsWith("COLLE")) return dire("Clé VAPID manquante dans app4.js.");
  try {
    if (Notification.permission === "default" && !silencieux) await Notification.requestPermission();
    if (Notification.permission !== "granted") return dire("Autorise les notifications dans les réglages du téléphone.");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64Vers8(VS_VAPID) });
    const { error } = await db.rpc("enregistrer_push", { p_endpoint: sub.endpoint, p_data: sub.toJSON() });
    if (error) throw error;
    dire("Notifications activées, même quand VS est fermé !");
    majCartesExtras();
  } catch (err) { dire("Impossible d'activer : " + err.message); }
}

// ---------- 11. Cartes ajoutées dans les paramètres ----------
(() => {
  const ou = $("#desactiver");
  const c1 = document.createElement("div");
  c1.className = "carte";
  c1.innerHTML = `<h2 style="margin-top:0">Couleur de VS</h2>
    <div class="pastilles-couleur">${Object.entries(COULEURS).map(([k, v]) =>
      `<button type="button" class="pastille" data-couleur-vs="${k}" aria-label="${v[0]}" style="background:linear-gradient(135deg,${v[1]},${v[3]})"></button>`).join("")}</div>`;
  const c2 = document.createElement("div");
  c2.className = "carte";
  c2.innerHTML = `<h2 style="margin-top:0">Mes comptes</h2><div id="liste-comptes"></div>`;
  const c3 = document.createElement("div");
  c3.className = "carte";
  c3.innerHTML = `<h2 style="margin-top:0">Présence et alertes</h2>
    <label><input type="checkbox" id="opt-ligne"> Montrer quand je suis en ligne</label>
    <button type="button" class="bouton contour" id="btn-push" style="margin-top:10px">Activer les notifications (VS fermé)</button>
    <button type="button" class="bouton contour" id="btn-test-push" style="margin-top:8px">Envoyer une notification test</button>
    <p class="secondaire" id="etat-push"></p>`;
  ou.before(c1, c2, c3);

  c1.addEventListener("click", (e) => {
    const b = e.target.closest("[data-couleur-vs]");
    if (!b) return;
    localStorage.setItem("vs_couleur", b.dataset.couleurVs);
    appliquerCouleur(b.dataset.couleurVs);
    majCartesExtras();
  });
  $("#opt-ligne").onchange = (e) => {
    localStorage.setItem("vs_ligne", e.target.checked ? "1" : "0");
    if (canalPresence) { if (e.target.checked) canalPresence.track({ t: Date.now() }); else canalPresence.untrack(); }
  };
  $("#btn-push").onclick = () => activerPush(false);
  $("#btn-test-push").onclick = async () => {
    msg("Envoi du test…");
    const { data, error } = await db.functions.invoke("swift-api", { body: { type: "test" } });
    if (error) {
      let t = error.message;
      try { t = await error.context.text(); } catch (e) {}
      return alert("Échec du test : " + t);
    }
    if (!data.abonnements) return alert("Aucun abonnement trouvé : touche d'abord « Activer les notifications (VS fermé) ».");
    if (data.envoyes) msg("Test envoyé : la notification arrive.");
    else alert("Envoi échoué : " + JSON.stringify(data.erreurs));
  };
})();

function majCartesExtras() {
  const cur = localStorage.getItem("vs_couleur") || "violet";
  document.querySelectorAll("[data-couleur-vs]").forEach((b) => b.classList.toggle("actif", b.dataset.couleurVs === cur));
  $("#opt-ligne").checked = montrerEnLigne();
  const etat = $("#etat-push");
  if (etat) etat.textContent = !("Notification" in window) ? "Non disponible sur cet appareil."
    : Notification.permission === "granted" ? "Activées sur cet appareil." : Notification.permission === "denied" ? "Bloquées dans les réglages du téléphone." : "Pas encore activées.";
  rendreComptes();
}

{
  const ancien = chargeurs.parametres;
  chargeurs.parametres = async () => { await ancien(); majCartesExtras(); };
}

// ---------- 12. Démarrage ----------
{
  const ancienDemarrer = window.demarrer;
  window.demarrer = async function (user) {
    await ancienDemarrer(user);
    demarrerPresence();
    chargerPrefs();
    activerPush(true);
  };
}

db.auth.onAuthStateChange((event, session) => {
  if (!session) {
    if (canalPresence) { db.removeChannel(canalPresence); canalPresence = null; }
    enLigne.clear();
  }
});
