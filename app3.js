/* VS — partie 3 sur 3 (app3.js) */
// ---------- Pastilles (notifications et messages) ----------
const cleVu = () => "vs_vu_notifs_" + moi.id;
function badge(el, n) { el.hidden = !n; el.textContent = n > 99 ? "99+" : n; }

async function majBadges() {
  if (!moi) return;
  if (!localStorage.getItem(cleVu())) localStorage.setItem(cleVu(), new Date().toISOString());
  const vu = localStorage.getItem(cleVu());
  const [f, n, m] = await Promise.all([
    db.from("follows").select("*", { count: "exact", head: true }).eq("followed_id", moi.id).gt("created_at", vu),
    db.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", moi.id).gt("created_at", vu),
    db.from("messages").select("*", { count: "exact", head: true }).eq("receiver_id", moi.id).eq("lu", false),
  ]);
  badge($("#badge-notifs"), (f.count || 0) + (n.count || 0));
  badge($("#badge-messages"), m.count || 0);
}
function marquerNotifsVues() { localStorage.setItem(cleVu(), new Date().toISOString()); majBadges(); }

async function marquerLus() {
  if (!dest) return;
  await db.from("messages").update({ lu: true }).eq("receiver_id", moi.id).eq("sender_id", dest.id).eq("lu", false);
  majBadges();
}
setInterval(majBadges, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) majBadges(); });

// ---------- Désactiver son compte ----------
async function reactiverSiBesoin(id) {
  const r = await db.from("profiles").select("desactive").eq("id", id).single();
  if (r.data && r.data.desactive) {
    await db.from("profiles").update({ desactive: false }).eq("id", id);
    msg("Bon retour ! Ton compte est réactivé.");
  }
}
$("#desactiver").onclick = async () => {
  if (!confirm("Désactiver ton compte ? Ton profil, tes éclairs et tes stories seront cachés. Il se réactive tout seul quand tu te reconnectes.")) return;
  const { error } = await db.from("profiles").update({ desactive: true }).eq("id", moi.id);
  if (error) return msg(error.message);
  await db.auth.signOut();
  msg("Compte désactivé. À bientôt !");
};

// ---------- v15 : balayage pour changer de page et revenir en arrière ----------
const ORDRE_PAGES = ["feed", "duels", "classement", "messages", "profil"];
let swipe = null;

function surcoucheOuverte() {
  return ["#viewer", "#camera", "#montage", "#ajout", "#menu", "#commentaires", "#lecteur", "#lightbox", "#f-reel"]
    .some((s) => { const el = $(s); return !!el && !el.hidden; });
}

function retourArriere() {
  if (pageActuelle === "parametres" && regActuel) return montrerReglage(null);
  if (pageActuelle === "messages" && !$("#chat").hidden) return chargerMessages();
  if (["autre", "parametres", "recherche", "notifs"].includes(pageActuelle)) return aller(pagePrecedente === "autre" ? "feed" : pagePrecedente);
  const i = ORDRE_PAGES.indexOf(pageActuelle);
  if (i > 0) aller(ORDRE_PAGES[i - 1]);
}

function pageSuivante() {
  if (pageActuelle === "messages" && !$("#chat").hidden) return;
  const i = ORDRE_PAGES.indexOf(pageActuelle);
  if (i >= 0 && i < ORDRE_PAGES.length - 1) aller(ORDRE_PAGES[i + 1]);
}

(() => {
  const zone = document.querySelector("main");
  zone.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || surcoucheOuverte() || e.target.closest(".stories, .notes-barre, input, textarea, select, .mt-puces, video[controls]")) { swipe = null; return; }
    const t = e.touches[0];
    swipe = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });
  zone.addEventListener("touchend", (e) => {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, duree = Date.now() - swipe.t;
    swipe = null;
    if (duree > 700 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    if (dx > 0) retourArriere(); else pageSuivante();
  }, { passive: true });
})();

// ---------- v15 : glisser vers le bas pour quitter une story ----------
(() => {
  const v = $("#viewer");
  let depart = null;
  v.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest(".story-bas")) { depart = null; return; }
    depart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  v.addEventListener("touchend", (e) => {
    if (!depart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - depart.x, dy = t.clientY - depart.y;
    depart = null;
    if (dy > 100 && Math.abs(dx) < 70) fermerViewer();
  }, { passive: true });
})();

// ---------- v16 : pourcentage d'envoi (en haut à gauche) ----------
(() => {
  const s = document.createElement("style");
  s.textContent = `
    #progres-envoi { position: fixed; z-index: 95; top: calc(12px + env(safe-area-inset-top, 0px)); left: 12px;
      padding: 8px 16px; border-radius: 999px; font-weight: 800; color: #fff; border: 1px solid var(--neon);
      box-shadow: var(--lueur); pointer-events: none; }
    #tirer { position: fixed; z-index: 40; left: 50%; top: calc(var(--haut, 69px) + 8px); transform: translateX(-50%);
      padding: 8px 18px; border-radius: 999px; font-size: 0.85rem; font-weight: 700; color: var(--blanc);
      background: var(--noir-2); border: 1px solid var(--neon); box-shadow: var(--lueur); pointer-events: none; }
    .entete .logo { cursor: pointer; }`;
  document.head.appendChild(s);
})();

function afficherProgres(p) {
  let el = $("#progres-envoi");
  if (!el) { el = document.createElement("div"); el.id = "progres-envoi"; document.body.appendChild(el); }
  if (p === null) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = "Envoi " + p + " %";
  el.style.background = `linear-gradient(90deg, var(--violet-fonce) ${p}%, rgba(8, 8, 13, 0.9) ${p}%)`;
}

// ---------- v16 : actualiser VS (toucher le logo ou tirer vers le bas) ----------
function actualiser() {
  if (!moi || pageActuelle === "autre") return;
  majBadges();
  majProfil();
  chargerAbonnes();
  if (pageActuelle === "messages" && dest) { cleChat = ""; rafraichirChat(); }
  else aller(pageActuelle);
  msg("VS actualisé");
}
document.querySelector(".entete .logo").onclick = actualiser;

(() => {
  const ind = document.createElement("div");
  ind.id = "tirer";
  ind.hidden = true;
  document.body.appendChild(ind);
  let dep = null, dy = 0, dx = 0;
  const enHaut = () => (pageActuelle === "feed" ? $("#liste-reels").scrollTop <= 0 : window.scrollY <= 0);
  document.addEventListener("touchstart", (e) => {
    if (!moi || e.touches.length !== 1 || surcoucheOuverte() || !enHaut()
      || e.target.closest("input, textarea, select, .stories, .notes-barre, .mt-puces, video[controls], #fil-chat, #liste-comm, #menu-actions")) { dep = null; return; }
    dep = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    dy = 0; dx = 0;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!dep) return;
    dy = e.touches[0].clientY - dep.y;
    dx = e.touches[0].clientX - dep.x;
    if (dy > 20 && dy > Math.abs(dx)) {
      ind.hidden = false;
      ind.textContent = dy > 90 ? "Relâche pour actualiser" : "↓ Tire pour actualiser";
    } else ind.hidden = true;
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (dep && dy > 90 && Math.abs(dx) < 60) {
      ind.textContent = "Actualisation…";
      actualiser();
      setTimeout(() => { ind.hidden = true; }, 700);
    } else ind.hidden = true;
    dep = null;
  }, { passive: true });
})();

// ---------- v17 : champs « fichier » professionnels (dans tout VS) ----------
(() => {
  const s = document.createElement("style");
  s.textContent = `
    .fichier { position: relative; display: flex; align-items: center; gap: 14px; margin: 6px 0; padding: 14px 16px;
      border-radius: 14px; border: 1.5px dashed var(--contour); background: var(--noir); cursor: pointer;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease; }
    .fichier:active { background: var(--noir-2); }
    .fichier.choisi { border-style: solid; border-color: var(--neon); box-shadow: var(--lueur); }
    .fichier > span { pointer-events: none; }
    .fichier input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0;
      opacity: 0; cursor: pointer; border: none; }
    .fichier-icone { flex: none; width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center;
      overflow: hidden; background: linear-gradient(135deg, var(--neon), var(--violet-fonce)); }
    .fichier-icone svg { width: 22px; height: 22px; stroke: #fff; fill: none; }
    .fichier-icone img { width: 100%; height: 100%; object-fit: cover; }
    .fichier-texte { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .fichier-texte strong { color: var(--blanc); font-size: 0.95rem; }
    .fichier-texte small { color: var(--gris); font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fichier.choisi .fichier-texte small { color: var(--neon); }`;
  document.head.appendChild(s);

  const IC_ENVOI = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16"/></svg>';
  const IC_OK = '<svg viewBox="0 0 24 24" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>';

  function ameliorerFichier(input) {
    if (input.hidden || input.dataset.pro) return;
    input.dataset.pro = "1";
    const acc = input.accept || "";
    const img = acc.includes("image"), vid = acc.includes("video");
    const titre = img && vid ? "Choisir une photo ou une vidéo" : vid ? "Choisir une vidéo" : img ? "Choisir une photo" : "Choisir un fichier";
    const boite = document.createElement("div");
    boite.className = "fichier";
    input.parentNode.insertBefore(boite, input);
    boite.innerHTML = `<span class="fichier-icone">${IC_ENVOI}</span><span class="fichier-texte"><strong>${titre}</strong><small>Touche pour parcourir</small></span>`;
    boite.appendChild(input);
    let url = null;
    const maj = () => {
      const f = input.files && input.files[0];
      if (url) { URL.revokeObjectURL(url); url = null; }
      boite.classList.toggle("choisi", !!f);
      const ic = boite.querySelector(".fichier-icone"), sm = boite.querySelector("small");
      if (!f) { ic.innerHTML = IC_ENVOI; sm.textContent = "Touche pour parcourir"; return; }
      if (f.type.startsWith("image/")) { url = URL.createObjectURL(f); ic.innerHTML = `<img src="${url}" alt="">`; }
      else ic.innerHTML = IC_OK;
      sm.textContent = f.name + " · " + (f.size / 1048576).toFixed(1) + " Mo";
    };
    input.addEventListener("change", maj);
    if (input.form) input.form.addEventListener("reset", () => setTimeout(maj, 0));
  }
  document.querySelectorAll('input[type="file"]').forEach(ameliorerFichier);
})();

// ---------- v18 : menu trois points des duels ----------
async function ouvrirMenuDuel(b) {
  cible = { type: "duel", id: b.dataset.id, user: "", pseudo: b.dataset.pseudo, url: b.dataset.url, url2: b.dataset.url2, legende: b.dataset.legende || "", suit: false };
  const mien = cible.pseudo === moi.pseudo;
  if (mien) cible.user = moi.id;
  else {
    const { data: pr } = await db.from("profiles").select("id").eq("pseudo", cible.pseudo).maybeSingle();
    cible.user = pr ? pr.id : "";
    if (cible.user) {
      const r = await db.from("follows").select("followed_id").eq("follower_id", moi.id).eq("followed_id", cible.user).maybeSingle();
      cible.suit = !!r.data;
    }
  }
  const p = "@" + esc(cible.pseudo);
  const l = [];
  if (mien) l.push(["duel-supprimer", "Supprimer ce duel"]);
  l.push(["duel-envoyer", "Envoyer à un ami"], ["duel-masquer", "Masquer ce duel"], ["duel-partager", "Partager le lien"]);
  if (!mien) {
    l.push(["duel-suivre", (cible.suit ? "Ne plus suivre " : "Suivre ") + p + (!cible.suit && mesAbonnes.has(cible.user) ? " en retour" : "")],
      ["duel-sourdine", "Mettre " + p + " en sourdine"], ["act-signaler", "Signaler"], ["duel-bloquer", "Bloquer " + p]);
  }
  $("#menu-actions").innerHTML = l.map(([id, t]) => `<button class="bouton ${id === "duel-supprimer" ? "" : "contour"} large" id="${id}">${t}</button>`).join("");
  $("#menu").hidden = false;
}

async function actionDuel(id) {
  const c = cible;
  if (!c) return;
  if (id === "duel-envoyer") return listeAmisDuel();
  $("#menu").hidden = true;
  if (id === "duel-supprimer") {
    if (!confirm("Supprimer ce duel ? Les votes seront perdus.")) return;
    const { error } = await db.rpc("supprimer_duel", { p_duel: String(c.id) });
    if (error) return msg(error.message);
    const chemins = [c.url, c.url2].filter((u) => u && u.includes("/medias/"))
      .map((u) => decodeURIComponent(u.split("/medias/")[1].split("?")[0]));
    if (chemins.length) db.storage.from("medias").remove(chemins);
    msg("Duel supprimé");
    await majProfil();
    return chargerDuels();
  }
  if (id === "duel-masquer") {
    const liste = duelsCaches();
    liste.add(String(c.id));
    localStorage.setItem(cleDuelsCaches(), JSON.stringify([...liste]));
    $("#menu").hidden = true;
    msg("Duel masqué");
    return chargerDuels();
  }
  if (id === "duel-partager") {
    $("#menu").hidden = true;
    const lien = location.href.split("#")[0];
    try {
      if (navigator.share) await navigator.share({ title: "Duel VS : " + c.legende, text: "Vote pour le duel « " + c.legende + " » sur VS", url: lien });
      else { await navigator.clipboard.writeText(lien); msg("Lien copié"); }
    } catch (err) { if (err.name !== "AbortError") msg("Impossible de partager ce duel."); }
    return;
  }
  if (!c.user) return msg("Compte introuvable.");
  if (id === "duel-suivre") {
    const error = await basculerSuivi(c.user, c.suit);
    $("#menu").hidden = true;
    return msg(error ? error.message : c.suit ? "Tu ne suis plus @" + c.pseudo : "Tu suis @" + c.pseudo);
  }
  if (id === "duel-sourdine" || id === "duel-bloquer") {
    const bloquer = id === "duel-bloquer";
    if (bloquer && !confirm("Bloquer @" + c.pseudo + " ? Tu ne verras plus ses contenus et il ne pourra plus t'écrire.")) return;
    const { error } = bloquer
      ? await db.from("blocked_users").insert({ user_id: moi.id, blocked_id: c.user })
      : await db.from("muted_users").insert({ user_id: moi.id, muted_id: c.user });
    if (error) return msg(error.message);
    $("#menu").hidden = true;
    msg("@" + c.pseudo + (bloquer ? " est bloqué." : " est en sourdine."));
    return chargerDuels();
  }
}

// Réafficher les duels masqués (Paramètres)
(() => {
  const carte = document.createElement("div");
  carte.className = "carte";
  carte.innerHTML = '<h2 style="margin-top:0">Duels masqués</h2><p class="secondaire">Les duels que tu as masqués ne s\'affichent plus.</p><button type="button" class="bouton contour" id="reafficher-duels">Réafficher les duels masqués</button>';
  $("#desactiver").before(carte);
  $("#reafficher-duels").onclick = () => {
    if (!moi) return;
    localStorage.removeItem(cleDuelsCaches());
    msg("Les duels masqués sont de nouveau visibles.");
  };
})();

// ---------- v19 : envoyer un duel à un ami dans VS ----------
(() => {
  const st = document.createElement("style");
  st.textContent = ".bulle[data-voir-duel] { cursor: pointer; }";
  document.head.appendChild(st);
})();

async function listeAmisDuel() {
  const { data } = await db.from("follows").select("followed_id,profiles!follows_followed_id_fkey(pseudo)").eq("follower_id", moi.id);
  $("#menu-actions").innerHTML = data && data.length
    ? `<p class="secondaire">Envoyer ce duel à…</p>` + data.map((x) => `<button class="bouton contour large" data-envoyer-duel="${x.followed_id}">@${esc(x.profiles.pseudo)}</button>`).join("")
    : `<p class="secondaire">Tu ne suis encore personne. Suis des comptes pour leur envoyer des duels.</p>`;
}

function voirDuel(id) {
  $("#liste-duels").innerHTML = "";
  aller("duels");
  let essais = 0;
  const t = setInterval(() => {
    const el = document.getElementById("carte-duel-" + id);
    if (el) {
      clearInterval(t);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.boxShadow = "0 0 24px var(--neon)";
      setTimeout(() => { el.style.boxShadow = ""; }, 2500);
    } else if (++essais > 40) {
      clearInterval(t);
      msg("Ce duel n'existe plus ou a été masqué.");
    }
  }, 150);
}

document.addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-envoyer-duel]");
  if (ed && cible) {
    const { error } = await db.rpc("envoyer_message", { p_dest: ed.dataset.envoyerDuel, p_texte: "[[duel:" + cible.id + "]] " + cible.legende });
    msg(error ? error.message : "Duel envoyé !");
    $("#menu").hidden = true;
    return;
  }
  const vd = e.target.closest("[data-voir-duel]");
  if (vd) voirDuel(vd.dataset.voirDuel);
});

// ---------- v20 : comptes enregistrés sur ce téléphone ----------
function lireComptes() {
  try { return JSON.parse(localStorage.getItem("vs_comptes") || "[]"); } catch (e) { return []; }
}
function ecrireComptes(liste) {
  try { localStorage.setItem("vs_comptes", JSON.stringify(liste.slice(0, 5))); } catch (e) {}
}
function sauverCompte(session) {
  const u = session.user;
  const tous = lireComptes();
  const ancien = tous.find((c) => c.id === u.id) || {};
  ecrireComptes([{ ...ancien, id: u.id, email: u.email || "" }, ...tous.filter((c) => c.id !== u.id)]);
}
function majCompteSauve() {
  if (!moi) return;
  ecrireComptes(lireComptes().map((c) => (c.id === moi.id ? { ...c, pseudo: moi.pseudo, avatar_url: moi.avatar_url } : c)));
}
function retirerCompte(id) {
  ecrireComptes(lireComptes().filter((c) => c.id !== id));
}
function afficherComptesAuth() {
  const form = document.getElementById("f-login");
  if (!form) return;
  let box = document.getElementById("comptes-auth");
  if (!box) { box = document.createElement("div"); box.id = "comptes-auth"; form.before(box); }
  const liste = lireComptes().filter((c) => c.email);
  box.innerHTML = liste.length
    ? `<p class="secondaire">Comptes enregistrés sur ce téléphone</p>` + liste.map((c) => {
        const nom = c.pseudo || c.email;
        const av = c.avatar_url
          ? `<img class="avatar mini" src="${esc(c.avatar_url)}" alt="">`
          : `<span class="avatar mini">${esc(nom[0].toUpperCase())}</span>`;
        return `<div class="rang" data-compte="${esc(c.email)}" style="cursor:pointer">${av}<span class="nom">${c.pseudo ? "@" + esc(c.pseudo) : esc(c.email)}</span>
          <button type="button" class="lien" data-oublier-compte="${esc(c.id)}" style="margin:0">Retirer</button></div>`;
      }).join("")
    : "";
}
document.addEventListener("click", (e) => {
  const ou = e.target.closest("[data-oublier-compte]");
  if (ou) { retirerCompte(ou.dataset.oublierCompte); afficherComptesAuth(); return; }
  const co = e.target.closest("[data-compte]");
  if (co) {
    const f = $("#f-login");
    $("#f-signup").hidden = true;
    f.hidden = false;
    f.email.value = co.dataset.compte;
    f.password.focus();
  }
});

// ---------- v21 : mots masqués, aperçu des messages ----------
function motsMasques() {
  try { return JSON.parse(localStorage.getItem("vs_mots_masques") || "[]"); } catch (e) { return []; }
}
function contientMotMasque(texte) {
  const t = String(texte || "").toLowerCase();
  return motsMasques().some((m) => m && t.includes(String(m).toLowerCase()));
}
function apercuMsg(contenu) {
  const t = String(contenu || "");
  if (t.startsWith("[[img:")) return "📷 Photo";
  if (t.startsWith("[[voc:")) return "🎤 Message vocal";
  const d = /^\[\[duel:[^\]]+\]\]\s*([\s\S]*)$/.exec(t);
  if (d) return "⚔️ Duel : " + d[1];
  return t;
}

// ---------- v22 : réglages et mots masqués ----------
let regActuel = null;
function montrerReglage(nom) { regActuel = nom || null; }

function majHub() {
  const box = $("#liste-mots");
  if (!box) return;
  const l = motsMasques();
  box.innerHTML = l.length
    ? l.map((m) => `<div class="ligne"><span>${esc(m)}</span><button type="button" class="bouton contour" data-retirer-mot="${esc(m)}">Retirer</button></div>`).join("")
    : `<p class="secondaire">Aucun mot masqué.</p>`;
}

(() => {
  const carte = document.createElement("div");
  carte.className = "carte";
  carte.innerHTML = `<h2 style="margin-top:0">Mots masqués</h2>
    <p class="secondaire">Les éclairs, duels et commentaires qui contiennent ces mots ne s'affichent plus.</p>
    <form id="f-mot" class="deux"><input name="mot" maxlength="30" placeholder="Ajouter un mot" autocomplete="off" required><button class="bouton">Ajouter</button></form>
    <div id="liste-mots"></div>`;
  $("#desactiver").before(carte);
  $("#f-mot").onsubmit = (e) => {
    e.preventDefault();
    const m = e.target.mot.value.trim().toLowerCase();
    if (!m) return;
    const l = motsMasques();
    if (!l.includes(m)) l.push(m);
    localStorage.setItem("vs_mots_masques", JSON.stringify(l));
    e.target.reset();
    majHub();
    msg("« " + m + " » est masqué.");
  };
})();

document.addEventListener("click", (e) => {
  const rm = e.target.closest("[data-retirer-mot]");
  if (!rm) return;
  localStorage.setItem("vs_mots_masques", JSON.stringify(motsMasques().filter((m) => m !== rm.dataset.retirerMot)));
  majHub();
});

// ---------- v23 : interface des messages (notes, photo, vocal, appel) ----------
const IC_PHOTO = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
const IC_MICRO = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>';
const IC_TEL = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>';

(() => {
  const s = document.createElement("style");
  s.textContent = `
    .chat-haut { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .chat-haut h2 { margin: 12px 0; }
    .outil-chat { flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
      color: var(--blanc); font: inherit; font-size: 1.1rem; background: var(--noir-2); border: 1px solid var(--contour); }
    .outil-chat svg { width: 20px; height: 20px; stroke: var(--blanc); fill: none; }
    .outil-chat.actif { background: var(--violet-fonce); border-color: var(--neon); box-shadow: var(--lueur); }
    #f-chat { align-items: center; }
    .bulle audio { display: block; max-width: 230px; height: 40px; }
    .notes-barre { display: flex; gap: 12px; overflow-x: auto; padding: 14px 2px 8px; }
    .note { flex: none; position: relative; width: 78px; padding: 30px 0 0; display: flex; flex-direction: column; align-items: center; gap: 4px;
      background: none; border: none; color: var(--blanc); font: inherit; cursor: pointer; }
    .note-bulle { position: absolute; top: 0; left: 50%; transform: translateX(-50%); max-width: 92px; padding: 5px 10px; border-radius: 14px;
      font-size: 0.72rem; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      background: var(--noir-2); border: 1px solid var(--contour); box-shadow: var(--lueur); }
    .note small { max-width: 74px; font-size: 0.72rem; color: var(--gris); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`;
  document.head.appendChild(s);

  // Notes en haut de Messages
  const barre = document.createElement("div");
  barre.className = "notes-barre";
  barre.id = "notes";
  $("#conversations h1").after(barre);

  // Bouton d'appel à côté du pseudo
  const haut = document.createElement("div");
  haut.className = "chat-haut";
  $("#chat-titre").before(haut);
  haut.appendChild($("#chat-titre"));
  haut.insertAdjacentHTML("beforeend", `<button type="button" class="outil-chat" id="chat-appel" aria-label="Appeler">${IC_TEL}</button>`);

  // Boutons photo et vocal dans la barre d'écriture
  const champ = $("#f-chat input[name=texte]");
  champ.insertAdjacentHTML("beforebegin",
    `<button type="button" class="outil-chat" id="chat-photo" aria-label="Envoyer une photo">${IC_PHOTO}</button>`
    + `<button type="button" class="outil-chat" id="chat-vocal" aria-label="Message vocal">${IC_MICRO}</button>`);
  $("#f-chat").insertAdjacentHTML("afterend", '<input type="file" id="chat-photo-fichier" accept="image/*" hidden>');

})();

// ---------- v23 : notes comme Instagram (24 h, visibles par tes abonnés) ----------
let maNote = "";

async function chargerNotes() {
  const barre = $("#notes");
  if (!barre || !moi) return;
  const depuis = new Date(Date.now() - 864e5).toISOString();
  const [{ data, error }, { data: sv }, mutes] = await Promise.all([
    db.from("notes").select("user_id,texte,created_at,profiles(pseudo,avatar_url)").gt("created_at", depuis),
    db.from("follows").select("followed_id").eq("follower_id", moi.id),
    enSourdine(),
  ]);
  if (error) { barre.hidden = true; return; }
  barre.hidden = false;
  const suivis = new Set((sv || []).map((x) => x.followed_id));
  const mienne = data.find((n) => n.user_id === moi.id);
  maNote = mienne ? mienne.texte : "";
  const autres = data.filter((n) => n.user_id !== moi.id && suivis.has(n.user_id) && !mutes.has(n.user_id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  barre.innerHTML = `<button type="button" class="note" data-ma-note><span class="note-bulle">${maNote ? esc(maNote) : "+ Note"}</span>${miniAvatar(moi)}<small>Ta note</small></button>`
    + autres.map((n) => {
      const p = n.profiles || { pseudo: "?" };
      return `<button type="button" class="note" data-note-de="${n.user_id}" data-note-pseudo="${esc(p.pseudo)}"><span class="note-bulle">${esc(n.texte)}</span>${miniAvatar(p)}<small>${esc(p.pseudo)}</small></button>`;
    }).join("");
}

async function actionNote(id) {
  $("#menu").hidden = true;
  if (id === "note-supprimer") {
    const { error } = await db.from("notes").delete().eq("user_id", moi.id);
    msg(error ? error.message : "Note supprimée");
    return chargerNotes();
  }
  if (id === "note-ecrire") {
    const t = prompt("Ta note (60 caractères max), visible 24 h par tes abonnés", maNote);
    if (t === null) return;
    const texte = t.trim().slice(0, 60);
    if (!texte) return;
    const { error } = await db.from("notes").upsert({ user_id: moi.id, texte, created_at: new Date().toISOString() });
    msg(error ? error.message : "Note publiée pour 24 h");
    chargerNotes();
  }
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-ma-note]")) {
    if (!maNote) return actionNote("note-ecrire");
    $("#menu-actions").innerHTML = `<p class="secondaire">Ta note : « ${esc(maNote)} »</p>`
      + '<button class="bouton contour large" id="note-ecrire">Modifier ma note</button>'
      + '<button class="bouton large" id="note-supprimer">Supprimer ma note</button>';
    $("#menu").hidden = false;
    return;
  }
  const nd = e.target.closest("[data-note-de]");
  if (nd) ouvrirChat(nd.dataset.noteDe, nd.dataset.notePseudo);
});

// ---------- v23 : envoyer une photo dans la discussion ----------
$("#chat-photo").onclick = () => { if (vocal) annulerVocal(); else $("#chat-photo-fichier").click(); };
$("#chat-photo-fichier").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || !dest) return;
  const pour = dest.id;
  try {
    msg("Envoi de la photo…");
    const url = await envoyerImage(f);
    const { error } = await db.rpc("envoyer_message", { p_dest: pour, p_texte: "[[img:" + url + "]]" });
    if (error) throw error;
    if (dest && dest.id === pour) { cleChat = ""; rafraichirChat(); }
  } catch (err) { msg(err.message); }
};

// ---------- v23 : messages vocaux (touche 🎤 pour commencer, retouche pour envoyer) ----------
let vocal = null;

function majBoutonsVocal(on) {
  $("#chat-vocal").classList.toggle("actif", on);
  $("#chat-photo").innerHTML = on ? "✕" : IC_PHOTO;
  $("#f-chat input[name=texte]").placeholder = "Ton message";
}

async function envoyerAudio(blob, type) {
  const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
  const chemin = moi.id + "/voc-" + Date.now() + "-" + Math.random().toString(36).slice(2) + "." + ext;
  const { error } = await db.storage.from("medias").upload(chemin, blob, { contentType: type });
  if (error) throw error;
  return db.storage.from("medias").getPublicUrl(chemin).data.publicUrl;
}

async function basculerVocal() {
  if (vocal) return finirVocal(true);
  if (!dest) return;
  if (!window.MediaRecorder || !navigator.mediaDevices) return msg("Messages vocaux indisponibles sur ce navigateur.");
  let flux;
  try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (err) { return msg("Autorise le micro pour envoyer un vocal."); }
  const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(flux, mime ? { mimeType: mime } : {});
  const v = { flux, rec, parts: [], debut: Date.now(), fin: 0, dest: dest.id, envoyer: false, minuteur: null };
  vocal = v;
  rec.ondataavailable = (e) => { if (e.data.size) v.parts.push(e.data); };
  rec.onstop = async () => {
    v.flux.getTracks().forEach((t) => t.stop());
    if (!v.envoyer) return;
    const duree = Math.round((v.fin - v.debut) / 1000);
    if (duree < 1) return msg("Vocal trop court.");
    const type = (rec.mimeType || "audio/webm").split(";")[0];
    try {
      msg("Envoi du vocal…");
      const url = await envoyerAudio(new Blob(v.parts, { type }), type);
      const { error } = await db.rpc("envoyer_message", { p_dest: v.dest, p_texte: "[[voc:" + url + "|" + duree + "]]" });
      if (error) throw error;
      if (dest && dest.id === v.dest) { cleChat = ""; rafraichirChat(); }
    } catch (err) { msg(err.message); }
  };
  rec.start(500);
  majBoutonsVocal(true);
  const champ = $("#f-chat input[name=texte]");
  v.minuteur = setInterval(() => {
    const sec = Math.floor((Date.now() - v.debut) / 1000);
    champ.placeholder = "🎤 " + Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0") + " · touche 🎤 pour envoyer";
    if (sec >= 60) finirVocal(true);
  }, 250);
}

function finirVocal(envoyer) {
  if (!vocal) return;
  const v = vocal;
  vocal = null;
  v.envoyer = envoyer;
  v.fin = Date.now();
  clearInterval(v.minuteur);
  majBoutonsVocal(false);
  if (v.rec.state !== "inactive") v.rec.stop();
  else v.flux.getTracks().forEach((t) => t.stop());
}

function annulerVocal() { finirVocal(false); }

$("#chat-vocal").onclick = basculerVocal;

// ---------- v24 : appels façon Snapchat (audio, vidéo, haut-parleur) ----------
const IC_HP = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
const IC_VIDEO = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m23 7-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';
const IC_TOURNER = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>';
const IC_CROIX = '<svg viewBox="0 0 24 24" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const IC_LOUPE = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
const boutonAppel = (id, ic, texte, classe = "") =>
  `<button type="button" class="appel-btn ${classe}" id="${id}"><span class="appel-rond">${ic}</span><small>${texte}</small></button>`;

(() => {
  const s = document.createElement("style");
  s.textContent = `
    #appel, #appel-entrant { position: fixed; inset: 0; z-index: 100; overflow: hidden; color: #fff; background: #08080D; }
    #appel-distant { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #000; }
    #appel:not(.video-distante) #appel-distant { opacity: 0; }
    #appel.video-distante .appel-fond { display: none; }
    .appel-fond { position: absolute; inset: 0; display: grid; place-items: center;
      background: radial-gradient(520px 520px at 50% 38%, rgba(168, 85, 247, 0.5), transparent 70%), linear-gradient(180deg, #1a0b33, #08080D); }
    .appel-av { width: 140px; height: 140px; margin: 0; font-size: 3rem; overflow: hidden; animation: respire 2s ease-in-out infinite; }
    .appel-av img { width: 100%; height: 100%; object-fit: cover; }
    @keyframes respire { 50% { box-shadow: 0 0 0 3px var(--neon), 0 0 70px rgba(168, 85, 247, 0.95); } }
    .appel-tete { position: absolute; z-index: 2; left: 0; right: 0; top: calc(34px + env(safe-area-inset-top, 0px));
      padding: 0 16px; text-align: center; text-shadow: 0 0 10px #000; }
    .appel-tete h1 { font-size: 1.6rem; }
    .appel-tete p { color: #ddd; }
    #appel-moi { position: absolute; z-index: 3; right: 14px; top: calc(110px + env(safe-area-inset-top, 0px));
      width: 30vw; max-width: 150px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 18px; background: #000;
      border: 2px solid var(--neon); box-shadow: var(--lueur); transform: scaleX(-1); }
    #appel-moi.arriere { transform: none; }
    .appel-barre { position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 12px;
      padding: 40px 8px calc(30px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(transparent, rgba(8, 8, 13, 0.85)); }
    .appel-btn { background: none; border: none; padding: 0; color: #fff; font: inherit; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; gap: 7px; min-width: 58px; }
    .appel-btn small { font-size: 0.7rem; text-shadow: 0 0 6px #000; }
    .appel-rond { width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center;
      background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.2); backdrop-filter: blur(14px);
      transition: transform 0.15s ease, background 0.2s ease; }
    .appel-btn:active .appel-rond { transform: scale(0.9); }
    .appel-rond svg { width: 26px; height: 26px; stroke: #fff; fill: none; }
    .appel-btn.actif .appel-rond { background: var(--neon); border-color: var(--neon); box-shadow: 0 0 18px rgba(168, 85, 247, 0.8); }
    .appel-btn.fin .appel-rond { background: var(--violet-fonce); border: 2px solid var(--neon); box-shadow: 0 0 24px rgba(168, 85, 247, 0.8); }
    .appel-btn.fin svg { transform: rotate(135deg); }
    .appel-btn.accepter .appel-rond { width: 66px; height: 66px; background: linear-gradient(135deg, var(--neon), var(--violet-fonce));
      border: none; animation: respire 1.6s ease-in-out infinite; }
    #appel-entrant .appel-barre { gap: 30px; }
    .conv-tete { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .conv-tete h1 { margin: 0; }
    #f-recherche.compacte { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; padding: 12px; }
    #f-recherche.compacte input { margin: 0; }
    #f-recherche.compacte .bouton { padding: 11px 16px; }
    #f-recherche.compacte #resultats { grid-column: 1 / -1; }
    .notif .suivre { display: block; margin-top: 8px; }`;
  document.head.appendChild(s);

  document.body.insertAdjacentHTML("beforeend", `
    <div id="appel" hidden>
      <video id="appel-distant" playsinline autoplay></video>
      <div class="appel-fond"><div class="avatar appel-av" id="appel-av"></div></div>
      <div class="appel-tete"><h1 id="appel-nom"></h1><p id="appel-etat"></p></div>
      <video id="appel-moi" playsinline autoplay muted hidden></video>
      <div class="appel-barre">
        ${boutonAppel("appel-hp", IC_HP, "Haut-parleur", "actif")}
        ${boutonAppel("appel-cam", IC_VIDEO, "Vidéo")}
        ${boutonAppel("appel-retourner", IC_TOURNER, "Retourner")}
        ${boutonAppel("appel-micro", IC_MICRO, "Micro")}
        ${boutonAppel("appel-raccrocher", IC_TEL, "Raccrocher", "fin")}
      </div>
    </div>
    <div id="appel-entrant" hidden>
      <div class="appel-fond"><div class="avatar appel-av" id="entrant-av"></div></div>
      <div class="appel-tete"><h1 id="entrant-nom"></h1><p id="entrant-type"></p></div>
      <div class="appel-barre">
        ${boutonAppel("appel-refuser", IC_CROIX, "Refuser")}
        ${boutonAppel("appel-accepter", IC_TEL, "Audio", "accepter")}
        ${boutonAppel("appel-accepter-video", IC_VIDEO, "Vidéo", "accepter")}
      </div>
    </div>`);
  $("#appel-retourner").hidden = true;

  // Boutons appel audio et vidéo en haut de la discussion
  const boite = document.createElement("div");
  boite.style.cssText = "display:flex;gap:8px;flex:none";
  $("#chat-appel").before(boite);
  boite.insertAdjacentHTML("beforeend", `<button type="button" class="outil-chat" id="chat-video" aria-label="Appel vidéo">${IC_VIDEO}</button>`);
  boite.appendChild($("#chat-appel"));

  // Messages : petite loupe en haut, la recherche s'ouvre en dessous
  const h1 = $("#conversations h1");
  const tete = document.createElement("div");
  tete.className = "conv-tete";
  h1.before(tete);
  tete.appendChild(h1);
  tete.insertAdjacentHTML("beforeend", `<button type="button" class="outil-chat" id="conv-loupe" aria-label="Rechercher un ami">${IC_LOUPE}</button>`);
  const f = $("#f-recherche");
  f.classList.add("compacte");
  f.hidden = true;
  f.after($("#notes"));
  $("#conv-loupe").onclick = () => {
    f.hidden = !f.hidden;
    $("#conv-loupe").classList.toggle("actif", !f.hidden);
    if (!f.hidden) f.q.focus();
    else { f.reset(); $("#resultats").innerHTML = ""; }
  };
})();

let canalAppels = null, appel = null, entrant = null, sonnerie = null;
const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
const canauxSortants = new Map();

function canalVers(id) {
  if (!canauxSortants.has(id)) {
    canauxSortants.set(id, new Promise((ok, ko) => {
      const c = db.channel("vs-appel-" + id);
      const t = setTimeout(() => { canauxSortants.delete(id); db.removeChannel(c); ko(new Error("Connexion impossible.")); }, 8000);
      c.subscribe((s) => { if (s === "SUBSCRIBED") { clearTimeout(t); ok(c); } });
    }));
  }
  return canauxSortants.get(id);
}

async function signal(id, data) {
  const c = await canalVers(id);
  await c.send({ type: "broadcast", event: "appel", payload: { ...data, de: moi.id, pseudo: moi.pseudo, avatar_url: moi.avatar_url || "" } });
}

function ecouterAppels() {
  if (canalAppels || !moi) return;
  canauxSortants.forEach((p) => p.then((c) => db.removeChannel(c)).catch(() => {}));
  canauxSortants.clear();
  canalAppels = db.channel("vs-appel-" + moi.id)
    .on("broadcast", { event: "appel" }, ({ payload }) => recuAppel(payload))
    .subscribe();
}

function remplirAvatar(el, p) {
  el.innerHTML = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="">` : esc((p.pseudo || "?")[0].toUpperCase());
}

async function recuAppel(p) {
  if (!p || !moi) return;
  if (p.type === "offre") {
    if (appel || entrant) return signal(p.de, { type: "occupe" }).catch(() => {});
    entrant = { ...p, file: [] };
    remplirAvatar($("#entrant-av"), p);
    $("#entrant-nom").textContent = "@" + p.pseudo;
    $("#entrant-type").textContent = p.video ? "Appel vidéo sur VS…" : "Appel audio sur VS…";
    $("#appel-entrant").hidden = false;
    jouerSon(true);
    sonnerie = setInterval(() => jouerSon(true), 2500);
    return;
  }
  if (p.type === "ice" && entrant && entrant.de === p.de) { entrant.file.push(p.c); return; }
  if (p.type === "fin" && entrant && entrant.de === p.de) { fermerEntrant(); msg("Appel manqué de @" + p.pseudo); return; }
  if (!appel || appel.autre !== p.de) return;
  const a = appel;
  if (p.type === "reponse") {
    try { await a.pc.setRemoteDescription(p.sdp); viderIce(); etatAppel("Connexion…"); } catch (e) { terminerAppel(true); }
  } else if (p.type === "ice") {
    if (a.pc.remoteDescription) a.pc.addIceCandidate(p.c).catch(() => {}); else a.file.push(p.c);
  } else if (p.type === "video") {
    $("#appel").classList.toggle("video-distante", !!p.on);
    if (p.on) $("#appel-distant").play().catch(() => {});
  } else if (p.type === "refus") { msg("@" + p.pseudo + " a refusé l'appel."); terminerAppel(false); }
  else if (p.type === "occupe") { msg("@" + p.pseudo + " est déjà en appel."); terminerAppel(false); }
  else if (p.type === "fin") { msg("Appel terminé"); terminerAppel(false); }
}

function etatAppel(t) { const el = $("#appel-etat"); if (el) el.textContent = t; }

function viderIce() {
  if (!appel) return;
  appel.file.forEach((c) => appel.pc.addIceCandidate(c).catch(() => {}));
  appel.file = [];
}

async function preparerAppel(autre, pseudo, avatar_url) {
  const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const distant = new MediaStream();
  const a = { pc, flux, autre, pseudo, file: [], debut: 0, minuteur: null, attente: null, distant, video: null, cam: null, face: "user", hp: true };
  appel = a;
  pc.onicecandidate = (e) => { if (e.candidate && appel === a) signal(autre, { type: "ice", c: e.candidate.toJSON() }).catch(() => {}); };
  pc.ontrack = (e) => {
    distant.addTrack(e.track);
    const v = $("#appel-distant");
    if (v.srcObject !== distant) v.srcObject = distant;
    v.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (appel !== a) return;
    if (pc.connectionState === "connected" && !a.debut) {
      a.debut = Date.now();
      clearTimeout(a.attente);
      a.minuteur = setInterval(() => {
        const sec = Math.floor((Date.now() - a.debut) / 1000);
        etatAppel(Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"));
      }, 500);
    }
    if (pc.connectionState === "failed") { msg("Connexion impossible avec @" + pseudo + "."); terminerAppel(true); }
  };
  remplirAvatar($("#appel-av"), { pseudo, avatar_url });
  $("#appel-nom").textContent = "@" + pseudo;
  $("#appel").classList.remove("video-distante");
  $("#appel-hp").classList.add("actif");
  $("#appel-micro").classList.remove("actif");
  $("#appel-micro small").textContent = "Micro";
  majVideoMoi();
  $("#appel").hidden = false;
  return a;
}

function majVideoMoi() {
  const a = appel, v = $("#appel-moi");
  const on = !!(a && a.cam);
  if (on) {
    v.srcObject = new MediaStream([a.cam]);
    v.classList.toggle("arriere", a.face === "environment");
    v.play().catch(() => {});
  } else v.srcObject = null;
  v.hidden = !on;
  $("#appel-cam").classList.toggle("actif", on);
  $("#appel-retourner").hidden = !on;
}

async function ouvrirCam(a) {
  const f = await navigator.mediaDevices.getUserMedia({ video: { facingMode: a.face, width: { ideal: 640 }, height: { ideal: 960 } } });
  if (appel !== a) { f.getTracks().forEach((t) => t.stop()); return; }
  a.cam = f.getVideoTracks()[0];
  if (a.video) await a.video.sender.replaceTrack(a.cam);
  majVideoMoi();
}

async function basculerCamera() {
  const a = appel;
  if (!a || !a.video) return;
  if (a.cam) {
    a.cam.stop();
    a.cam = null;
    await a.video.sender.replaceTrack(null).catch(() => {});
    majVideoMoi();
    signal(a.autre, { type: "video", on: false }).catch(() => {});
    return;
  }
  try {
    await ouvrirCam(a);
    signal(a.autre, { type: "video", on: true }).catch(() => {});
  } catch (e) { msg("Impossible d'ouvrir la caméra."); }
}

async function retournerCamera() {
  const a = appel;
  if (!a || !a.cam) return;
  a.face = a.face === "user" ? "environment" : "user";
  a.cam.stop();
  a.cam = null;
  try { await ouvrirCam(a); } catch (e) { msg("Impossible de changer de caméra."); majVideoMoi(); }
}

async function basculerHautParleur() {
  const a = appel;
  if (!a) return;
  a.hp = !a.hp;
  const v = $("#appel-distant");
  let fait = false;
  try {
    if (v.setSinkId && navigator.mediaDevices.enumerateDevices) {
      const sorties = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput");
      const choix = a.hp ? sorties.find((d) => /speaker|haut/i.test(d.label)) : sorties.find((d) => /earpiece|couteur/i.test(d.label));
      if (choix) { await v.setSinkId(choix.deviceId); v.volume = 1; fait = true; }
    }
  } catch (e) {}
  if (!fait) v.volume = a.hp ? 1 : 0.35;
  $("#appel-hp").classList.toggle("actif", a.hp);
}

async function lancerAppel(video = false) {
  if (!dest || appel) return;
  if (!window.RTCPeerConnection || !navigator.mediaDevices) return msg("Les appels ne marchent pas sur ce navigateur.");
  const qui = dest;
  try {
    const { data: pr } = await db.from("profiles").select("avatar_url").eq("id", qui.id).maybeSingle();
    const a = await preparerAppel(qui.id, qui.pseudo, pr ? pr.avatar_url : "");
    a.pc.addTransceiver(a.flux.getAudioTracks()[0], { direction: "sendrecv" });
    a.video = a.pc.addTransceiver("video", { direction: "sendrecv" });
    if (video) await ouvrirCam(a).catch(() => msg("Caméra indisponible : appel audio."));
    etatAppel(video ? "Appel vidéo…" : "Appel…");
    await a.pc.setLocalDescription(await a.pc.createOffer());
    await signal(qui.id, { type: "offre", video: !!a.cam, sdp: a.pc.localDescription.toJSON() });
    a.attente = setTimeout(() => { if (appel === a && !a.debut) { msg("Pas de réponse."); terminerAppel(true); } }, 45000);
  } catch (err) {
    terminerAppel(false);
    msg("Appel impossible : autorise le micro et vérifie ta connexion.");
  }
}

async function accepterAppel(video = false) {
  const p = entrant;
  if (!p) return;
  fermerEntrant();
  try {
    const a = await preparerAppel(p.de, p.pseudo, p.avatar_url);
    etatAppel("Connexion…");
    if (p.video) $("#appel").classList.add("video-distante");
    await a.pc.setRemoteDescription(p.sdp);
    const tr = a.pc.getTransceivers();
    const ta = tr.find((t) => t.receiver.track.kind === "audio");
    if (ta) { ta.direction = "sendrecv"; await ta.sender.replaceTrack(a.flux.getAudioTracks()[0]); }
    a.video = tr.find((t) => t.receiver.track.kind === "video") || null;
    if (a.video) a.video.direction = "sendrecv";
    a.file.push(...p.file);
    viderIce();
    if (video) await ouvrirCam(a).catch(() => msg("Caméra indisponible : appel audio."));
    await a.pc.setLocalDescription(await a.pc.createAnswer());
    await signal(p.de, { type: "reponse", sdp: a.pc.localDescription.toJSON() });
    if (a.cam) signal(p.de, { type: "video", on: true }).catch(() => {});
  } catch (err) {
    signal(p.de, { type: "fin" }).catch(() => {});
    terminerAppel(false);
    msg("Appel impossible : autorise le micro.");
  }
}

function fermerEntrant() {
  clearInterval(sonnerie);
  sonnerie = null;
  entrant = null;
  const el = $("#appel-entrant");
  if (el) el.hidden = true;
}

function terminerAppel(prevenir = true) {
  const el = $("#appel");
  if (el) { el.hidden = true; el.classList.remove("video-distante"); }
  if (!appel) return;
  const a = appel;
  appel = null;
  if (prevenir) signal(a.autre, { type: "fin" }).catch(() => {});
  clearTimeout(a.attente);
  clearInterval(a.minuteur);
  a.flux.getTracks().forEach((t) => t.stop());
  if (a.cam) a.cam.stop();
  try { a.pc.close(); } catch (e) {}
  $("#appel-distant").srcObject = null;
  majVideoMoi();
}

$("#chat-appel").onclick = () => lancerAppel(false);
$("#chat-video").onclick = () => lancerAppel(true);
$("#appel-raccrocher").onclick = () => terminerAppel(true);
$("#appel-cam").onclick = basculerCamera;
$("#appel-retourner").onclick = retournerCamera;
$("#appel-hp").onclick = basculerHautParleur;
$("#appel-accepter").onclick = () => accepterAppel(false);
$("#appel-accepter-video").onclick = () => accepterAppel(true);
$("#appel-refuser").onclick = () => {
  const p = entrant;
  fermerEntrant();
  if (p) signal(p.de, { type: "refus" }).catch(() => {});
};
$("#appel-micro").onclick = () => {
  if (!appel) return;
  const piste = appel.flux.getAudioTracks()[0];
  piste.enabled = !piste.enabled;
  $("#appel-micro").classList.toggle("actif", !piste.enabled);
  $("#appel-micro small").textContent = piste.enabled ? "Micro" : "Muet";
};

// ---------- Démarrage de VS (une fois les 3 fichiers chargés) ----------
const chargeurs = { autre: () => {}, recherche: () => {}, parametres: chargerParametres, feed: chargerFeed, duels: chargerDuels, messages: chargerMessages, notifs: chargerNotifs, classement: chargerClassement, profil: chargerProfil };

db.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    setTimeout(async () => {
      const p = prompt("Nouveau mot de passe (8 caractères minimum)");
      if (p && p.length >= 8) {
        const { error } = await db.auth.updateUser({ password: p });
        msg(error ? error.message : "Mot de passe modifié.");
      }
    }, 0);
  }
  if (session) {
    sauverCompte(session);
    if (!moi || moi.id !== session.user.id) setTimeout(() => demarrer(session.user), 0);
  } else {
    moi = null;
    if (canalNotifs) { db.removeChannel(canalNotifs); canalNotifs = null; }
    if (canalAppels) { db.removeChannel(canalAppels); canalAppels = null; }
    chargement($("#f-login"), false);
    chargement($("#f-signup"), false);
    ecran("auth");
  }
});

ecran("auth");
