let db;
try {
  if (typeof supabase === "undefined") throw new Error("La bibliothèque Supabase ne s'est pas chargée. Vérifie ta connexion internet.");
  if (typeof SUPABASE_URL === "undefined" || !SUPABASE_URL.startsWith("https://")) throw new Error("Ouvre config.js et remplace COLLE_ICI_TON_URL par l'URL de ton projet Supabase.");
  db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (err) {
  document.getElementById("auth").hidden = false;
  alert(err.message);
  throw err;
}
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLS = "id,pseudo,prenom,bio,avatar_url,coins,abonnes,created_at";
let moi = null;

function msg(t) {
  const m = $("#toast");
  m.textContent = t;
  m.classList.add("on");
  setTimeout(() => m.classList.remove("on"), 3000);
}

async function envoyerImage(file, video = false) {
  if (!file || !file.size) return null;
  const estVideo = file.type.startsWith("video/");
  if (!(file.type.startsWith("image/") || (video && estVideo))) throw new Error(video ? "Photo ou vidéo requise" : "Image requise");
  if (file.size > (estVideo ? 30 : 5) * 1024 * 1024) throw new Error(estVideo ? "Vidéo : 30 Mo maximum" : "Image : 5 Mo maximum");
  const sub = file.type.split("/")[1];
  const ext = { jpeg: "jpg", quicktime: "mov" }[sub] || sub;
  const chemin = moi.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2) + "." + ext;
  const { error } = await db.storage.from("medias").upload(chemin, file);
  if (error) throw error;
  return db.storage.from("medias").getPublicUrl(chemin).data.publicUrl;
}

async function majProfil() {
  const { data } = await db.from("profiles").select(COLS).eq("id", moi.id).single();
  if (data) { moi = data; $("#solde").textContent = moi.abonnes; }
}

// ---------- Connexion / inscription ----------
function ecran(nom) { $("#auth").hidden = nom !== "auth"; $("#app").hidden = nom !== "app"; }
ecran("auth");

$("#vers-inscription").onclick = () => { $("#f-login").hidden = true; $("#f-signup").hidden = false; };
$("#vers-connexion").onclick = () => { $("#f-signup").hidden = true; $("#f-login").hidden = false; };

$("#f-signup").onsubmit = async (e) => {
  e.preventDefault();
  if (!majeur(e.target.naissance.value)) return msg("VS est réservé aux personnes de 18 ans et plus.");
  chargement(e.target, true);
  const f = new FormData(e.target);
  const { error } = await db.auth.signUp({
    email: f.get("email"),
    password: f.get("password"),
    options: { data: { pseudo: f.get("pseudo").trim(), prenom: f.get("prenom").trim(), naissance: f.get("naissance") } },
  });
  chargement(e.target, false);
  if (error) {
    msg(error.message.includes("Database error") ? "Inscription impossible : pseudo déjà pris ou âge minimum de 18 ans." : error.message);
  } else {
    msg("Compte créé ! Vérifie ton e-mail, puis connecte-toi.");
    $("#vers-connexion").click();
  }
};

$("#f-login").onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  chargement(form, true);
  const f = new FormData(form);
  const { error } = await db.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") });
  if (error) { chargement(form, false); msg("Connexion impossible : e-mail non vérifié ou mot de passe incorrect."); }
  else setTimeout(() => chargement(form, false), 10000);
};

$("#oubli").onclick = async () => {
  const email = $("#f-login").email.value.trim();
  if (!email) return msg("Écris d'abord ton e-mail dans le champ.");
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
  msg(error ? error.message : "E-mail de réinitialisation envoyé.");
};

$("#deconnexion").onclick = () => db.auth.signOut();

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
    if (!moi || moi.id !== session.user.id) setTimeout(() => demarrer(session.user), 0);
  } else {
    moi = null;
    if (canalNotifs) { db.removeChannel(canalNotifs); canalNotifs = null; }
    chargement($("#f-login"), false);
    chargement($("#f-signup"), false);
    ecran("auth");
  }
});

async function demarrer(user) {
  const { data, error } = await db.from("profiles").select(COLS).eq("id", user.id).single();
  if (error) { chargement($("#f-login"), false); return msg("Profil introuvable. Reconnecte-toi."); }
  moi = data;
  courriel = user.email || "";
  $("#solde").textContent = moi.abonnes;
  ecran("app");
  ecouterNotifs();
  nettoyerMesStories();
  aller("feed");
}

// ---------- Navigation ----------
const chargeurs = { autre: () => {}, recherche: () => {}, parametres: chargerParametres, feed: chargerFeed, duels: chargerDuels, messages: chargerMessages, notifs: chargerNotifs, classement: chargerClassement, profil: chargerProfil };

function aller(nom) {
  clearInterval(minuteur);
  if (nom !== pageActuelle) { pagePrecedente = pageActuelle; pageActuelle = nom; }
  document.body.classList.toggle("accueil", nom === "feed");
  if (nom !== "feed") document.querySelectorAll("#liste-reels video").forEach((x) => x.pause());
  const racine = document.documentElement.style;
  racine.setProperty("--haut", document.querySelector(".entete").offsetHeight + "px");
  racine.setProperty("--bas", document.querySelector(".nav").offsetHeight + "px");
  document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("actif", b.dataset.page === nom));
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === nom));
  chargeurs[nom]();
}
document.querySelectorAll(".nav button").forEach((b) => (b.onclick = () => aller(b.dataset.page)));

// ---------- Accueil : stories et éclairs ----------
let histoires = new Map();
let vTimer;
const lecteur = new IntersectionObserver((entrees) => entrees.forEach((en) => {
  if (en.isIntersecting && !eco()) en.target.play().catch(() => {}); else en.target.pause();
}), { threshold: 0.6 });

const boutonSuivre = (id, suit) =>
  `<button class="suivre ${suit ? "actif" : ""}" data-id="${id}" data-suit="${suit}">${suit ? "Suivi" : "Suivre"}</button>`;

async function chargerFeed() {
  chargerStories();
  const box = $("#liste-reels");
  const [{ data: tous, error }, { data: sv }, mutes, { data: caches }] = await Promise.all([
    db.from("reels").select("id,user_id,video_url,legende,profiles!reels_user_id_fkey(pseudo),reel_likes(user_id),reel_comments(count)")
      .order("created_at", { ascending: false }).limit(20),
    db.from("follows").select("followed_id").eq("follower_id", moi.id),
    enSourdine(),
    db.from("reel_prefs").select("reel_id").eq("user_id", moi.id).eq("kind", "hidden"),
  ]);
  if (error) { box.textContent = "Erreur de chargement : " + error.message; return; }
  const suit = new Set((sv || []).map((x) => x.followed_id));
  const cache = new Set((caches || []).map((c) => c.reel_id));
  const data = tous.filter((r) => !mutes.has(r.user_id) && !cache.has(r.id));
  box.innerHTML = data.length
    ? data.map((r) => `<article class="reel">
        <video src="${esc(r.video_url)}#t=0.001" loop muted playsinline preload="${eco() ? "none" : "metadata"}"></video>
        <button class="points3" data-type="reel" data-id="${r.id}" data-user="${r.user_id}" data-pseudo="${esc(r.profiles.pseudo)}" data-url="${esc(r.video_url)}" data-legende="${esc(r.legende)}">${ICONE3}</button>
        <div class="reel-actions">
          <button class="coeur ${r.reel_likes.some((l) => l.user_id === moi.id) ? "actif" : ""}" data-id="${r.id}" data-aime="${r.reel_likes.some((l) => l.user_id === moi.id)}"><span>♥</span><small>${r.reel_likes.length}</small></button>
          <button class="comm" data-id="${r.id}"><span><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span><small>${r.reel_comments[0]?.count ?? 0}</small></button>
          <button class="partage" data-id="${r.id}" data-user="${r.user_id}" data-pseudo="${esc(r.profiles.pseudo)}" data-url="${esc(r.video_url)}"><span><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg></span><small>Envoyer</small></button>
        </div>
        <div class="reel-info"><strong class="lien-profil" data-profil="${r.user_id}">@${esc(r.profiles.pseudo)}</strong><p>${esc(r.legende)}</p>
        ${r.user_id === moi.id ? "" : boutonSuivre(r.user_id, suit.has(r.user_id))}</div></article>`).join("")
    : `<p class="secondaire">Aucun éclair pour l'instant. Publie le premier !</p>`;
  box.querySelectorAll("video").forEach((v) => lecteur.observe(v));
}

async function chargerStories() {
  const { data } = await db.from("stories")
    .select("id,user_id,media_url,type,created_at,profiles!stories_user_id_fkey(pseudo,avatar_url)")
    .gt("created_at", new Date(Date.now() - 864e5).toISOString()).order("created_at", { ascending: true });
  histoires = new Map();
  const mutes = await enSourdine();
  (data || []).filter((s) => !mutes.has(s.user_id)).forEach((s) => {
    if (!histoires.has(s.user_id)) histoires.set(s.user_id, { pseudo: s.profiles.pseudo, avatar: s.profiles.avatar_url, items: [] });
    histoires.get(s.user_id).items.push(s);
  });
  const rond = (id, h) => `<button class="story" data-id="${id}"><span class="anneau">
    ${h.avatar ? `<img class="avatar mini" src="${esc(h.avatar)}" alt="">` : `<span class="avatar mini">${esc(h.pseudo[0].toUpperCase())}</span>`}
    </span><small>${id === moi.id ? "Ma story" : esc(h.pseudo)}</small></button>`;
  $("#stories").innerHTML = `<button class="story" id="ajout-story"><span class="anneau plus"><span class="avatar mini">+</span></span><small>Ajouter</small></button>`
    + [...histoires].map(([id, h]) => rond(id, h)).join("");
}

function ouvrirStory(items, i = 0) {
  const v = $("#viewer");
  clearTimeout(vTimer);
  document.querySelectorAll("#liste-reels video").forEach((x) => x.pause());
  if (i >= items.length) { v.hidden = true; v.innerHTML = ""; reprendreReels(); return; }
  const s = items[i];
  storyCourante = { items, i };
  v.hidden = false;
  v.innerHTML = `<div class="barres">${items.map((_, k) => `<i class="${k <= i ? "fait" : ""}"></i>`).join("")}</div>`
    + `<button class="points3" data-type="story" data-id="${s.id}" data-user="${s.user_id}" data-pseudo="${esc(s.profiles.pseudo)}" data-url="${esc(s.media_url)}">${ICONE3}</button>`
    + (s.type === "video" ? `<video src="${esc(s.media_url)}" autoplay playsinline></video>` : `<img src="${esc(s.media_url)}" alt="">`);
  if (s.type === "video") v.querySelector("video").onended = () => ouvrirStory(items, i + 1);
  else vTimer = setTimeout(() => ouvrirStory(items, i + 1), 5000);
  v.onclick = (ev) => { if (!ev.target.closest(".points3")) ouvrirStory(items, i + 1); };
}

async function basculerSuivi(id, suit) {
  const { error } = suit
    ? await db.from("follows").delete().eq("follower_id", moi.id).eq("followed_id", id)
    : await db.from("follows").insert({ follower_id: moi.id, followed_id: id });
  return error;
}

document.addEventListener("click", async (e) => {
  const sv = e.target.closest(".suivre");
  if (sv) {
    const suit = sv.dataset.suit === "true";
    const error = await basculerSuivi(sv.dataset.id, suit);
    if (error) return msg(error.message);
    document.querySelectorAll(`.suivre[data-id="${sv.dataset.id}"]`).forEach((b) => {
      b.dataset.suit = String(!suit);
      b.textContent = suit ? "Suivre" : "Suivi";
      b.classList.toggle("actif", !suit);
    });
    return;
  }
  const rv = e.target.closest(".reel video");
  if (rv) { toucherReel(rv, e); return; }
  if (e.target.closest("#ajout-story")) { $("#story-input").click(); return; }
  const st = e.target.closest(".story[data-id]");
  if (st && histoires.has(st.dataset.id)) ouvrirStory(histoires.get(st.dataset.id).items);
});

$("#story-input").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    msg("Envoi de ta story…");
    const url = await envoyerImage(file, true);
    const type = file.type.startsWith("video/") ? "video" : "image";
    const { error } = await db.from("stories").insert({ user_id: moi.id, media_url: url, type });
    if (error) throw error;
    msg("Story publiée pour 24 h !");
    chargerStories();
  } catch (err) { msg(err.message); }
};

$("#btn-creer").onclick = () => { if (pageActuelle !== "feed") aller("feed"); $("#f-reel").hidden = !$("#f-reel").hidden; };

$("#f-reel").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const file = fichierReel;
    if (!file || !file.type.startsWith("video/")) throw new Error("Choisis une vidéo.");
    msg("Envoi de l'éclair…");
    const url = await envoyerImage(file, true);
    const { error } = await db.from("reels").insert({ user_id: moi.id, video_url: url, legende: f.legende.value.trim() });
    if (error) throw error;
    f.reset();
    fichierReel = null;
    $("#nom-reel").textContent = "Aucune vidéo choisie (30 Mo max)";
    f.hidden = true;
    msg("Éclair publié !");
    chargerFeed();
  } catch (err) { msg(err.message); }
};

// ---------- Notifications ----------
$("#cloche").onclick = () => aller("notifs");

async function chargerNotifs() {
  $("#cloche").classList.remove("nouveau");
  const box = $("#liste-notifs");
  const [f, d, n] = await Promise.all([
    db.from("follows").select("created_at,follower_id,profiles!follows_follower_id_fkey(pseudo)")
      .eq("followed_id", moi.id).order("created_at", { ascending: false }).limit(20),
    db.rpc("mes_duels_stats"),
    db.from("notifications").select("created_at,texte").eq("user_id", moi.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (f.error || d.error) { box.textContent = "Erreur : " + (f.error || d.error).message; return; }
  const items = [];
  f.data.forEach((x) => items.push({ t: x.created_at, h: `<strong class="lien-profil" data-profil="${x.follower_id}">@${esc(x.profiles.pseudo)}</strong> s'est abonné à toi` }));
  d.data.forEach((x) => {
    const a = Number(x.votes_a), b = Number(x.votes_b), n = a + b;
    const pa = n ? Math.round((a * 100) / n) : 0;
    const fini = new Date(x.fin) < new Date();
    const etat = fini ? (a === b ? "égalité" : "gagnant : " + (a > b ? "A" : "B")) : "en cours";
    items.push({ t: x.created_at, h: `Ton duel <strong>${esc(x.titre)}</strong> : A ${pa} % · B ${n ? 100 - pa : 0} % (${n} vote${n > 1 ? "s" : ""}), ${etat}` });
  });
  (n.data || []).forEach((x) => items.push({ t: x.created_at, h: esc(x.texte) }));
  items.sort((x, y) => new Date(y.t) - new Date(x.t));
  box.innerHTML = items.length
    ? items.map((i) => `<div class="notif">${i.h}<small>${new Date(i.t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</small></div>`).join("")
    : `<p class="secondaire">Rien pour l'instant. Tes nouveaux abonnés et les résultats de tes duels apparaîtront ici.</p>`;
}

// ---------- Duels ----------
const media = (type, url, lettre) => type === "video"
  ? `<video class="media" src="${esc(url)}" controls playsinline preload="metadata"></video>`
  : `<img class="media zoom" src="${esc(url)}" alt="Contenu ${lettre}">`;

async function chargerDuels() {
  const box = $("#liste-duels");
  const { data, error } = await db.rpc("duels_liste");
  if (error) { box.textContent = "Erreur de chargement : " + error.message; return; }
  box.innerHTML = data.length
    ? data.map((d) => {
        const a = Number(d.votes_a), b = Number(d.votes_b), t = a + b;
        const pa = t ? Math.round((a * 100) / t) : 50;
        const fini = new Date(d.fin) < new Date();
        const fin = new Date(d.fin).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
        let bas;
        if (fini) bas = `<p><strong>${a === b ? "Égalité" : "Gagnant : " + (a > b ? "A" : "B")}</strong></p>`;
        else if (d.mon_vote) bas = `<p class="secondaire">Tu as voté ${d.mon_vote.toUpperCase()}</p>`;
        else bas = `<div class="deux"><button class="bouton large" data-duel="${d.id}" data-choix="a">Voter A</button>
                    <button class="bouton large contour" data-duel="${d.id}" data-choix="b">Voter B</button></div>`;
        return `<article class="carte duel"><strong>${esc(d.titre)}</strong>
          <p class="secondaire">${esc(d.categorie)}, par @${esc(d.pseudo)} — ${fini ? "terminé" : "fin le " + fin}</p>
          <div class="duel-ligne" style="margin-top:12px">
            ${media(d.type, d.image_a, "A")}<div class="vs">VS</div>${media(d.type, d.image_b, "B")}
          </div>
          <div class="barre"><i style="width:${pa}%"></i></div>
          <p class="secondaire">A ${pa} % · B ${100 - pa} % · ${t} vote${t > 1 ? "s" : ""}</p>${bas}</article>`;
      }).join("")
    : `<p class="secondaire">Aucun duel pour l'instant. Lance le premier !</p>`;
}

$("#liste-duels").onclick = async (e) => {
  const b = e.target.closest("[data-duel]");
  if (!b) return;
  const { error } = await db.rpc("voter", { p_duel: b.dataset.duel, p_choix: b.dataset.choix });
  if (error) msg(error.message);
  else { msg("Vote enregistré !"); await majProfil(); }
  chargerDuels();
};

$("#f-duel").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const fa = f.a.files[0], fb = f.b.files[0];
    const type = fa.type.startsWith("video/") ? "video" : "image";
    if (type !== (fb.type.startsWith("video/") ? "video" : "image")) throw new Error("Les deux contenus doivent être du même type (2 photos ou 2 vidéos).");
    msg("Envoi en cours…");
    const a = await envoyerImage(fa, true);
    const b = await envoyerImage(fb, true);
    const { error } = await db.rpc("creer_duel", { p_titre: f.titre.value.trim(), p_cat: f.categorie.value, p_a: a, p_b: b, p_type: type });
    if (error) throw error;
    f.reset();
    msg("Duel lancé !");
    await majProfil();
    chargerDuels();
  } catch (err) { msg(err.message); }
};

// ---------- Classement ----------
async function chargerClassement() {
  const { data, error } = await db.from("profiles").select("pseudo,abonnes").order("abonnes", { ascending: false }).limit(100);
  $("#liste-classement").innerHTML = error
    ? "Erreur de chargement : " + error.message
    : data.map((p, i) => `<div class="rang ${i === 0 ? "premier" : ""}"><span class="numero">${i + 1}</span>
        <span class="nom">@${esc(p.pseudo)}</span><span class="score">${p.abonnes} abonné${p.abonnes > 1 ? "s" : ""}</span></div>`).join("");
}

// ---------- Profil et portefeuille ----------
async function chargerProfil() {
  await majProfil();
  const avatar = moi.avatar_url
    ? `<img class="avatar" src="${esc(moi.avatar_url)}" alt="">`
    : `<div class="avatar">${esc(moi.pseudo[0].toUpperCase())}</div>`;
  $("#fiche").innerHTML = `${avatar}<h1>@${esc(moi.pseudo)}</h1><p class="secondaire">${esc(moi.prenom)}</p>
    <p>${esc(moi.bio) || '<span class="secondaire">Pas encore de description</span>'}</p>
    <div class="stats"><div class="stat"><strong>${moi.abonnes}</strong><span>Abonnés</span></div></div>`;
  const f = $("#f-profil");
  f.prenom.value = moi.prenom;
  f.bio.value = moi.bio;
  chargerSourdine();
}

$("#f-profil").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const maj = { prenom: f.prenom.value.trim(), bio: f.bio.value.trim() };
    const url = await envoyerImage(f.avatar.files[0]);
    if (url) maj.avatar_url = url;
    const { error } = await db.from("profiles").update(maj).eq("id", moi.id);
    if (error) throw error;
    msg("Profil enregistré");
    chargerProfil();
  } catch (err) { msg(err.message); }
};

// ---------- Agrandir les photos ----------
document.addEventListener("click", (e) => {
  const img = e.target.closest("img.zoom");
  if (img) { $("#lightbox img").src = img.src; $("#lightbox").hidden = false; }
  else if (e.target.closest("#lightbox")) $("#lightbox").hidden = true;
});

// ---------- Messages ----------
let dest = null, minuteur = null;

async function chargerMessages() {
  clearInterval(minuteur);
  dest = null;
  $("#chat").hidden = true;
  $("#conversations").hidden = false;
  const box = $("#liste-conv");
  const { data, error } = await db.from("messages").select("sender_id,receiver_id,contenu,created_at")
    .order("created_at", { ascending: false }).limit(200);
  if (error) { box.textContent = "Erreur : " + error.message; return; }
  const vus = new Map();
  data.forEach((m) => {
    const autre = m.sender_id === moi.id ? m.receiver_id : m.sender_id;
    if (!vus.has(autre)) vus.set(autre, m);
  });
  if (!vus.size) { box.innerHTML = `<p class="secondaire">Aucune conversation. Cherche un pseudo ci-dessus.</p>`; return; }
  const { data: profs } = await db.from("profiles").select("id,pseudo").in("id", [...vus.keys()]);
  box.innerHTML = (profs || []).map((p) => `<div class="rang conv" data-id="${p.id}" data-pseudo="${esc(p.pseudo)}">
    <span class="nom">@${esc(p.pseudo)}</span><span class="score">${esc(vus.get(p.id).contenu.slice(0, 28))}</span></div>`).join("");
}

function ouvrirChat(id, pseudo) {
  dest = { id, pseudo };
  $("#conversations").hidden = true;
  $("#chat").hidden = false;
  $("#chat-titre").textContent = "@" + pseudo;
  $("#fil-chat").innerHTML = "";
  rafraichirChat();
  clearInterval(minuteur);
  minuteur = setInterval(rafraichirChat, 4000);
}

async function rafraichirChat() {
  if (!dest) return;
  const { data } = await db.from("messages").select("sender_id,contenu,created_at,reel_id,reels(video_url,legende)")
    .or(`and(sender_id.eq.${moi.id},receiver_id.eq.${dest.id}),and(sender_id.eq.${dest.id},receiver_id.eq.${moi.id})`)
    .order("created_at", { ascending: true }).limit(100);
  const box = $("#fil-chat");
  const bas = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
  box.innerHTML = (data || []).map(bulle).join("")
    || `<p class="secondaire">Dis bonjour à @${esc(dest.pseudo)} !</p>`;
  if (bas) box.scrollTop = box.scrollHeight;
}

$("#messages").onclick = (e) => {
  if (e.target.closest(".suivre")) return;
  const c = e.target.closest(".conv");
  if (c) ouvrirChat(c.dataset.id, c.dataset.pseudo);
  if (e.target.closest("#retour")) chargerMessages();
};

$("#f-recherche").onsubmit = async (e) => {
  e.preventDefault();
  const q = e.target.q.value.replace(/[^A-Za-z0-9_]/g, "");
  if (!q) return;
  const { data, error } = await db.from("profiles").select("id,pseudo").ilike("pseudo", "%" + q + "%").neq("id", moi.id).limit(10);
  const { data: sv } = await db.from("follows").select("followed_id").eq("follower_id", moi.id);
  const suit = new Set((sv || []).map((x) => x.followed_id));
  $("#resultats").innerHTML = error ? "Erreur : " + esc(error.message)
    : data.length ? data.map((p) => `<div class="rang conv" data-id="${p.id}" data-pseudo="${esc(p.pseudo)}">
        <span class="nom">@${esc(p.pseudo)}</span><span class="score">Écrire</span>${boutonSuivre(p.id, suit.has(p.id))}</div>`).join("")
    : `<p class="secondaire">Aucun utilisateur trouvé.</p>`;
};

$("#f-chat").onsubmit = async (e) => {
  e.preventDefault();
  const t = e.target.texte.value.trim();
  if (!t || !dest) return;
  const { error } = await db.rpc("envoyer_message", { p_dest: dest.id, p_texte: t });
  if (error) return msg(error.message);
  e.target.reset();
  rafraichirChat();
};

$("#annuler-reel").onclick = () => { $("#f-reel").hidden = true; };

// ---------- Créer un éclair : caméra arrière, selfie ou galerie ----------
let fichierReel = null;
document.querySelectorAll("[data-source]").forEach((b) => {
  b.onclick = () => {
    const src = b.dataset.source;
    if (src === "galerie") $("#galerie").click();
    else ouvrirCamera(src === "cam-selfie" ? "user" : "environment", src);
  };
});
["cam-arriere", "cam-selfie", "galerie"].forEach((id) => {
  $("#" + id).onchange = (e) => {
    const f = e.target.files[0];
    if (f) ouvrirMontage(f);
    e.target.value = "";
  };
});

// ---------- J'aime et commentaires des éclairs ----------
let reelCourant = null;

document.addEventListener("click", async (e) => {
  const c = e.target.closest(".coeur");
  if (c) {
    const aime = c.dataset.aime === "true";
    const { error } = aime
      ? await db.from("reel_likes").delete().eq("reel_id", c.dataset.id).eq("user_id", moi.id)
      : await db.from("reel_likes").insert({ reel_id: c.dataset.id, user_id: moi.id });
    if (error) return msg(error.message);
    c.dataset.aime = String(!aime);
    c.classList.toggle("actif", !aime);
    const n = c.querySelector("small");
    n.textContent = Number(n.textContent) + (aime ? -1 : 1);
    return;
  }
  const m = e.target.closest(".comm");
  if (m) ouvrirCommentaires(m.dataset.id, m);
  if (e.target.closest("#fermer-comm")) $("#commentaires").hidden = true;
});

async function ouvrirCommentaires(id, bouton) {
  reelCourant = { id, bouton };
  $("#commentaires").hidden = false;
  $("#liste-comm").textContent = "Chargement…";
  const { data, error } = await db.from("reel_comments")
    .select("contenu,created_at,profiles!reel_comments_user_id_fkey(pseudo)")
    .eq("reel_id", id).order("created_at", { ascending: true }).limit(100);
  $("#liste-comm").innerHTML = error ? "Erreur : " + esc(error.message)
    : data.length ? data.map((c) => `<div class="notif"><strong>@${esc(c.profiles.pseudo)}</strong> ${esc(c.contenu)}</div>`).join("")
    : `<p class="secondaire">Aucun commentaire. Écris le premier !</p>`;
  $("#liste-comm").scrollTop = $("#liste-comm").scrollHeight;
}

$("#f-comm").onsubmit = async (e) => {
  e.preventDefault();
  const t = e.target.texte.value.trim();
  if (!t || !reelCourant) return;
  const { error } = await db.from("reel_comments").insert({ reel_id: reelCourant.id, user_id: moi.id, contenu: t });
  if (error) return msg(error.message);
  e.target.reset();
  const n = reelCourant.bouton.querySelector("small");
  n.textContent = Number(n.textContent) + 1;
  ouvrirCommentaires(reelCourant.id, reelCourant.bouton);
};

// ---------- Double toucher = j'aime (simple toucher = son) ----------
let dernierToucher = 0, minuteurSon = null;

function toucherReel(video, e) {
  const maintenant = Date.now();
  if (maintenant - dernierToucher < 300) {
    clearTimeout(minuteurSon);
    dernierToucher = 0;
    aimerParDoubleToucher(video.closest(".reel"), e);
  } else {
    dernierToucher = maintenant;
    minuteurSon = setTimeout(() => { if (eco() && video.paused) video.play().catch(() => {}); else video.muted = !video.muted; }, 300);
  }
}

function aimerParDoubleToucher(reel, e) {
  const coeur = reel.querySelector(".coeur");
  if (coeur && coeur.dataset.aime !== "true") coeur.click();
  const zone = reel.getBoundingClientRect();
  const pop = document.createElement("div");
  pop.className = "coeur-pop";
  pop.textContent = "♥";
  pop.style.left = e.clientX - zone.left + "px";
  pop.style.top = e.clientY - zone.top + "px";
  reel.appendChild(pop);
  setTimeout(() => pop.remove(), 700);
}

// ---------- Rond de chargement sur les boutons ----------
function chargement(form, on) {
  const b = form.querySelector('button:not([type="button"])');
  if (!b) return;
  b.disabled = on;
  b.classList.toggle("charge", on);
}

// ---------- Menu trois points (comme Instagram) ----------
const ICONE3 = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
const MOTIFS = ["Spam", "Contenu inapproprié", "Harcèlement ou haine", "Violence", "Autre"];
let storyCourante = null, cible = null;

async function enSourdine() {
  const [a, b] = await Promise.all([
    db.from("muted_users").select("muted_id").eq("user_id", moi.id),
    db.from("blocked_users").select("blocked_id").eq("user_id", moi.id),
  ]);
  return new Set([...(a.data || []).map((x) => x.muted_id), ...(b.data || []).map((x) => x.blocked_id)]);
}

function reprendreReels() {
  if (!$("#viewer").hidden) return;
  lecteur.disconnect();
  document.querySelectorAll("#liste-reels video").forEach((v) => lecteur.observe(v));
}

function fermerViewer() {
  clearTimeout(vTimer);
  $("#viewer").hidden = true;
  $("#viewer").innerHTML = "";
  storyCourante = null;
  reprendreReels();
}

function fermerMenu() {
  $("#menu").hidden = true;
  if (!$("#viewer").hidden && storyCourante) ouvrirStory(storyCourante.items, storyCourante.i);
}

async function ouvrirMenu(b) {
  cible = { type: b.dataset.type, id: b.dataset.id, user: b.dataset.user, pseudo: b.dataset.pseudo, url: b.dataset.url, legende: b.dataset.legende || "" };
  clearTimeout(vTimer);
  const lecteurStory = document.querySelector("#viewer video");
  if (lecteurStory) lecteurStory.pause();
  const mien = cible.user === moi.id, reel = cible.type === "reel";
  cible.suit = false;
  cible.enregistre = false;
  if (!mien) {
    const r = await db.from("follows").select("followed_id").eq("follower_id", moi.id).eq("followed_id", cible.user).maybeSingle();
    cible.suit = !!r.data;
  }
  if (reel && !mien) {
    const r = await db.from("reel_prefs").select("reel_id").eq("user_id", moi.id).eq("reel_id", cible.id).eq("kind", "saved").maybeSingle();
    cible.enregistre = !!r.data;
  }
  const p = "@" + esc(cible.pseudo);
  const l = [];
  if (reel && mien) l.push(["act-legende", "Modifier la légende"]);
  if (reel && !mien) l.push(["act-enregistrer", cible.enregistre ? "Retirer des enregistrements" : "Enregistrer"]);
  if (reel) l.push(["act-envoyer", "Envoyer à un ami"], ["act-partager", "Partager le lien"]);
  if (mien) l.push(["act-supprimer", cible.type === "story" ? "Supprimer cette story" : "Supprimer cet éclair"]);
  else {
    l.push(["act-suivre", (cible.suit ? "Ne plus suivre " : "Suivre ") + p]);
    if (reel) l.push(["act-pasinteresse", "Pas intéressé"]);
    l.push(["act-sourdine", "Mettre " + p + " en sourdine"], ["act-signaler", "Signaler"], ["act-bloquer", "Bloquer " + p]);
  }
  $("#menu-actions").innerHTML = l.map(([id, t]) => `<button class="bouton ${id === "act-supprimer" ? "" : "contour"} large" id="${id}">${t}</button>`).join("");
  $("#menu").hidden = false;
}

async function action(id) {
  const c = cible;
  if (id === "act-signaler") {
    $("#menu-actions").innerHTML = `<p class="secondaire">Pourquoi signales-tu ce contenu ?</p>`
      + MOTIFS.map((m) => `<button class="bouton contour large" data-motif="${m}">${m}</button>`).join("");
    return;
  }
  if (id === "act-envoyer") {
    const { data } = await db.from("follows").select("followed_id,profiles!follows_followed_id_fkey(pseudo)").eq("follower_id", moi.id);
    $("#menu-actions").innerHTML = data && data.length
      ? `<p class="secondaire">Envoyer à…</p>` + data.map((x) => `<button class="bouton contour large" data-envoyer="${x.followed_id}">@${esc(x.profiles.pseudo)}</button>`).join("")
      : `<p class="secondaire">Tu ne suis encore personne. Suis des comptes pour leur envoyer des éclairs.</p>`;
    return;
  }
  if (id === "act-supprimer") {
    const { error } = await db.from(c.type === "story" ? "stories" : "reels").delete().eq("id", c.id).eq("user_id", moi.id);
    if (error) return msg(error.message);
    if (c.url && c.url.includes("/medias/")) db.storage.from("medias").remove([decodeURIComponent(c.url.split("/medias/")[1].split("?")[0])]);
    $("#menu").hidden = true;
    msg(c.type === "story" ? "Story supprimée" : "Éclair supprimé");
    if (c.type === "story") fermerViewer();
    return chargerFeed();
  }
  if (id === "act-sourdine" || id === "act-bloquer") {
    const bloquer = id === "act-bloquer";
    if (bloquer && !confirm("Bloquer @" + c.pseudo + " ? Tu ne verras plus ses contenus et il ne pourra plus t'écrire.")) return;
    const { error } = bloquer
      ? await db.from("blocked_users").insert({ user_id: moi.id, blocked_id: c.user })
      : await db.from("muted_users").insert({ user_id: moi.id, muted_id: c.user });
    if (error) return msg(error.message);
    $("#menu").hidden = true;
    fermerViewer();
    msg("@" + c.pseudo + (bloquer ? " est bloqué." : " est en sourdine."));
    return chargerFeed();
  }
  if (id === "act-legende") {
    const t = prompt("Nouvelle légende (150 caractères max)", c.legende);
    if (t === null) return;
    const { error } = await db.from("reels").update({ legende: t.trim().slice(0, 150) }).eq("id", c.id).eq("user_id", moi.id);
    $("#menu").hidden = true;
    msg(error ? error.message : "Légende modifiée");
    return chargerFeed();
  }
  if (id === "act-enregistrer") {
    const { error } = c.enregistre
      ? await db.from("reel_prefs").delete().eq("user_id", moi.id).eq("reel_id", c.id).eq("kind", "saved")
      : await db.from("reel_prefs").insert({ user_id: moi.id, reel_id: c.id, kind: "saved" });
    fermerMenu();
    return msg(error ? error.message : c.enregistre ? "Retiré des enregistrements" : "Éclair enregistré, retrouve-le dans ton profil");
  }
  if (id === "act-partager") {
    $("#menu").hidden = true;
    try {
      if (navigator.share) await navigator.share({ title: "Éclair de @" + c.pseudo + " sur VS", url: c.url });
      else { await navigator.clipboard.writeText(c.url); msg("Lien copié"); }
    } catch (err) { if (err.name !== "AbortError") msg("Impossible de partager ce lien."); }
    return;
  }
  if (id === "act-suivre") {
    const error = await basculerSuivi(c.user, c.suit);
    fermerMenu();
    if (error) return msg(error.message);
    msg(c.suit ? "Tu ne suis plus @" + c.pseudo : "Tu suis @" + c.pseudo);
    document.querySelectorAll(`.suivre[data-id="${c.user}"]`).forEach((b) => {
      b.dataset.suit = String(!c.suit);
      b.textContent = c.suit ? "Suivre" : "Suivi";
      b.classList.toggle("actif", !c.suit);
    });
    return;
  }
  if (id === "act-pasinteresse") {
    const { error } = await db.from("reel_prefs").insert({ user_id: moi.id, reel_id: c.id, kind: "hidden" });
    fermerMenu();
    if (error) return msg(error.message);
    document.querySelector(`.points3[data-type="reel"][data-id="${c.id}"]`)?.closest(".reel")?.remove();
    msg("Éclair masqué");
  }
}

async function chargerSourdine() {
  const [m, b, e] = await Promise.all([
    db.from("muted_users").select("muted_id,profiles!muted_users_muted_id_fkey(pseudo)").eq("user_id", moi.id),
    db.from("blocked_users").select("blocked_id,profiles!blocked_users_blocked_id_fkey(pseudo)").eq("user_id", moi.id),
    db.from("reel_prefs").select("reel_id,reels(video_url,legende,profiles!reels_user_id_fkey(pseudo))")
      .eq("user_id", moi.id).eq("kind", "saved").order("created_at", { ascending: false }),
  ]);
  const ligne = (nom, attr, id, texte) => `<div class="ligne"><span>@${esc(nom)}</span><button class="bouton contour" ${attr}="${id}">${texte}</button></div>`;
  $("#liste-sourdine").innerHTML = m.data && m.data.length
    ? m.data.map((x) => ligne(x.profiles.pseudo, "data-reactiver", x.muted_id, "Réactiver")).join("")
    : `<p class="secondaire">Aucun compte en sourdine.</p>`;
  $("#liste-bloques").innerHTML = b.data && b.data.length
    ? b.data.map((x) => ligne(x.profiles.pseudo, "data-debloquer", x.blocked_id, "Débloquer")).join("")
    : `<p class="secondaire">Aucun compte bloqué.</p>`;
  $("#liste-enregistres").innerHTML = e.data && e.data.length
    ? e.data.filter((x) => x.reels).map((x) => `<div class="enregistre"><video src="${esc(x.reels.video_url)}#t=0.001" controls playsinline preload="metadata"></video>
        <div class="ligne"><span><strong>@${esc(x.reels.profiles.pseudo)}</strong> ${esc(x.reels.legende)}</span>
        <button class="bouton contour" data-retirer="${x.reel_id}">Retirer</button></div></div>`).join("")
    : `<p class="secondaire">Aucun éclair enregistré.</p>`;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) document.querySelectorAll("video").forEach((v) => v.pause());
  else reprendreReels();
});

document.addEventListener("click", async (e) => {
  const p3 = e.target.closest(".points3");
  if (p3) return ouvrirMenu(p3);
  const sh = e.target.closest(".partage");
  if (sh) return ouvrirPartage(sh);
  if (e.target.closest("#annuler-menu")) return fermerMenu();
  const a = e.target.closest("#menu-actions button[id]");
  if (a) return action(a.id);
  const env = e.target.closest("[data-envoyer]");
  if (env) {
    const { error } = await db.rpc("envoyer_message", { p_dest: env.dataset.envoyer, p_texte: "Éclair de @" + cible.pseudo, p_reel: cible.id });
    msg(error ? error.message : "Envoyé !");
    return fermerMenu();
  }
  const mo = e.target.closest("[data-motif]");
  if (mo) {
    const c = cible;
    const { error } = await db.from("reports").insert({ reporter_id: moi.id, target_type: c.type, target_id: c.id, target_user: c.user, motif: mo.dataset.motif });
    msg(error ? (error.code === "23505" ? "Tu as déjà signalé ce contenu." : error.message) : "Merci, ton signalement a été envoyé.");
    return fermerMenu();
  }
  const re = e.target.closest("[data-reactiver]");
  const de = e.target.closest("[data-debloquer]");
  const rt = e.target.closest("[data-retirer]");
  if (re || de || rt) {
    const { error } = re ? await db.from("muted_users").delete().eq("user_id", moi.id).eq("muted_id", re.dataset.reactiver)
      : de ? await db.from("blocked_users").delete().eq("user_id", moi.id).eq("blocked_id", de.dataset.debloquer)
      : await db.from("reel_prefs").delete().eq("user_id", moi.id).eq("reel_id", rt.dataset.retirer).eq("kind", "saved");
    if (error) msg(error.message);
    chargerSourdine();
  }
});

// ---------- v7 : profils, recherche, paramètres, sons et notifications en direct ----------
let pageActuelle = "feed", pagePrecedente = "feed", courriel = "", canalNotifs = null, audioCtx = null;
let histoiresAutre = [], minuteurRecherche;
const eco = () => localStorage.getItem("vs_eco") === "1";
const miniAvatar = (p) => p.avatar_url
  ? `<img class="avatar mini" src="${esc(p.avatar_url)}" alt="">`
  : `<span class="avatar mini">${esc((p.pseudo || "?")[0].toUpperCase())}</span>`;

function bulle(m) {
  const moiMsg = m.sender_id === moi.id ? "moi" : "";
  if (m.reels) {
    return `<div class="bulle ${moiMsg}"><video src="${esc(m.reels.video_url)}#t=0.001" controls playsinline preload="metadata"></video><small>${esc(m.reels.legende)}</small></div>`;
  }
  return `<div class="bulle ${moiMsg}">${esc(m.contenu)}</div>`;
}

// Son de notification néon + vibration
document.addEventListener("click", () => {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {}
}, { once: true });

function jouerSon(force = false) {
  if (force || localStorage.getItem("vs_son") !== "0") {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.resume();
      const t = audioCtx.currentTime;
      [[659.25, 0], [880, 0.12], [1318.5, 0.24]].forEach(([f, d]) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.18, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.45);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + d);
        o.stop(t + d + 0.5);
      });
    } catch (e) {}
  }
  if ((force || localStorage.getItem("vs_vibre") !== "0") && navigator.vibrate) navigator.vibrate([60, 40, 60]);
}

function alerter(texte) {
  jouerSon();
  msg(texte);
  $("#cloche").classList.add("nouveau");
}

function ecouterNotifs() {
  if (canalNotifs) return;
  canalNotifs = db.channel("vs-notifs-" + moi.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + moi.id }, (p) => alerter(p.new.texte))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows", filter: "followed_id=eq." + moi.id }, async (p) => {
      const { data } = await db.from("profiles").select("pseudo").eq("id", p.new.follower_id).single();
      alerter("@" + (data ? data.pseudo : "Quelqu'un") + " s'est abonné à toi");
    })
    .subscribe();
}

// Profil d'un autre compte
async function voirProfil(id) {
  if (id === moi.id) return aller("profil");
  aller("autre");
  const box = $("#fiche-autre");
  box.innerHTML = `<p class="secondaire">Chargement…</p>`;
  const [p, r, s, sv] = await Promise.all([
    db.from("profiles").select("id,pseudo,prenom,bio,avatar_url,abonnes").eq("id", id).single(),
    db.from("reels").select("id,video_url,legende,reel_likes(count)").eq("user_id", id).order("created_at", { ascending: false }),
    db.from("stories").select("id,user_id,media_url,type,created_at,profiles!stories_user_id_fkey(pseudo,avatar_url)")
      .eq("user_id", id).gt("created_at", new Date(Date.now() - 864e5).toISOString()).order("created_at", { ascending: true }),
    db.from("follows").select("followed_id").eq("follower_id", moi.id).eq("followed_id", id).maybeSingle(),
  ]);
  if (p.error) { box.textContent = "Profil introuvable."; return; }
  const u = p.data, reels = r.data || [];
  const likes = reels.reduce((n, x) => n + (x.reel_likes[0]?.count ?? 0), 0);
  histoiresAutre = s.data || [];
  const grand = u.avatar_url ? `<img class="avatar" src="${esc(u.avatar_url)}" alt="">` : `<div class="avatar">${esc(u.pseudo[0].toUpperCase())}</div>`;
  box.innerHTML = `<div class="carte profil">
      <button type="button" class="avatar-btn ${histoiresAutre.length ? "anneau" : ""}" id="avatar-autre">${grand}</button>
      <h1>@${esc(u.pseudo)}</h1><p class="secondaire">${esc(u.prenom)}</p><p>${esc(u.bio)}</p>
      <div class="stats">
        <div class="stat"><strong>${u.abonnes}</strong><span>Abonnés</span></div>
        <div class="stat"><strong>${likes}</strong><span>J'aime</span></div>
        <div class="stat"><strong>${reels.length}</strong><span>Éclairs</span></div>
      </div>
      <div class="deux" style="margin-top:16px">${boutonSuivre(u.id, !!sv.data)}<button type="button" class="bouton contour" id="ecrire-autre">Message</button></div>
    </div>
    <h2>Éclairs</h2>
    ${reels.length
      ? `<div class="grille-reels">${reels.map((x) => `<button type="button" class="tuile" data-url="${esc(x.video_url)}" data-legende="${esc(x.legende)}"><video src="${esc(x.video_url)}#t=0.001" muted playsinline preload="${eco() ? "none" : "metadata"}"></video><span>♥ ${x.reel_likes[0]?.count ?? 0}</span></button>`).join("")}</div>`
      : `<p class="secondaire">Aucun éclair publié.</p>`}`;
  $("#ecrire-autre").onclick = () => { aller("messages"); ouvrirChat(u.id, u.pseudo); };
  $("#avatar-autre").onclick = () => { if (histoiresAutre.length) ouvrirStory(histoiresAutre); };
}

document.addEventListener("click", (e) => {
  const pf = e.target.closest("[data-profil]");
  if (pf && !e.target.closest(".suivre")) return voirProfil(pf.dataset.profil);
  if (e.target.closest("[data-retour]")) return aller(pagePrecedente === "autre" ? "feed" : pagePrecedente);
  const t = e.target.closest(".tuile");
  if (t) {
    const v = $("#lecteur video");
    v.src = t.dataset.url;
    $("#lecteur p").textContent = t.dataset.legende;
    $("#lecteur").hidden = false;
    v.play().catch(() => {});
  }
  if (e.target.closest("#fermer-lecteur")) {
    const v = $("#lecteur video");
    v.pause();
    v.removeAttribute("src");
    $("#lecteur").hidden = true;
  }
});

// Recherche de comptes
$("#loupe").onclick = () => { aller("recherche"); setTimeout(() => $("#champ-recherche").focus(), 50); };

$("#champ-recherche").oninput = (e) => {
  clearTimeout(minuteurRecherche);
  const q = e.target.value.replace(/[^A-Za-z0-9_]/g, "");
  const box = $("#resultats-recherche");
  if (!q) { box.innerHTML = `<p class="secondaire">Écris un pseudo pour chercher un compte.</p>`; return; }
  minuteurRecherche = setTimeout(async () => {
    const [{ data, error }, { data: sv }] = await Promise.all([
      db.from("profiles").select("id,pseudo,prenom,abonnes,avatar_url").ilike("pseudo", "%" + q + "%")
        .neq("id", moi.id).order("abonnes", { ascending: false }).limit(20),
      db.from("follows").select("followed_id").eq("follower_id", moi.id),
    ]);
    const suit = new Set((sv || []).map((x) => x.followed_id));
    box.innerHTML = error ? "Erreur : " + esc(error.message)
      : data.length ? data.map((p) => `<div class="rang" data-profil="${p.id}" style="cursor:pointer">${miniAvatar(p)}
          <span class="nom">@${esc(p.pseudo)}<small class="secondaire"> · ${p.abonnes} abonné${p.abonnes > 1 ? "s" : ""}</small></span>${boutonSuivre(p.id, suit.has(p.id))}</div>`).join("")
      : `<p class="secondaire">Aucun compte trouvé.</p>`;
  }, 300);
};

// Paramètres
$("#btn-param").onclick = () => aller("parametres");
$("#opt-son").onchange = (e) => localStorage.setItem("vs_son", e.target.checked ? "1" : "0");
$("#opt-vibre").onchange = (e) => localStorage.setItem("vs_vibre", e.target.checked ? "1" : "0");
$("#opt-eco").onchange = (e) => {
  localStorage.setItem("vs_eco", e.target.checked ? "1" : "0");
  msg(e.target.checked ? "Économiseur de données activé" : "Économiseur de données désactivé");
};
$("#test-son").onclick = () => jouerSon(true);

$("#f-mdp").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.mdp.value !== f.mdp2.value) return msg("Les deux mots de passe sont différents.");
  chargement(f, true);
  const { error } = await db.auth.updateUser({ password: f.mdp.value });
  chargement(f, false);
  msg(error ? error.message : "Mot de passe modifié !");
  if (!error) f.reset();
};

async function chargerParametres() {
  chargerSourdine();
  $("#opt-son").checked = localStorage.getItem("vs_son") !== "0";
  $("#opt-vibre").checked = localStorage.getItem("vs_vibre") !== "0";
  $("#opt-eco").checked = eco();
  $("#infos-compte").innerHTML = `<div class="ligne"><span>Pseudo</span><span>@${esc(moi.pseudo)}</span></div>
    <div class="ligne"><span>E-mail</span><span>${esc(courriel)}</span></div>
    <div class="ligne"><span>Membre depuis</span><span>${new Date(moi.created_at).toLocaleDateString("fr-FR")}</span></div>`;
  const [r, d] = await Promise.all([
    db.from("reels").select("id,reel_likes(count),reel_comments(count)").eq("user_id", moi.id),
    db.rpc("mes_duels_stats"),
  ]);
  const reels = r.data || [], duels = d.data || [];
  const somme = (cle) => reels.reduce((n, x) => n + (x[cle][0]?.count ?? 0), 0);
  const votes = duels.reduce((n, x) => n + Number(x.votes_a) + Number(x.votes_b), 0);
  const stat = (n, t) => `<div class="stat"><strong>${n}</strong><span>${t}</span></div>`;
  $("#stats-compte").innerHTML = `<div class="stats">${stat(moi.abonnes, "Abonnés")}${stat(reels.length, "Éclairs")}${stat(somme("reel_likes"), "J'aime reçus")}</div>
    <div class="stats" style="margin-top:10px">${stat(somme("reel_comments"), "Commentaires")}${stat(duels.length, "Duels lancés")}${stat(votes, "Votes reçus")}</div>`;
}

// ---------- Majorité : 18 ans minimum ----------
function majeur(date) {
  if (!date) return false;
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() - 18);
  return new Date(date) <= limite;
}
(() => {
  const l = new Date();
  l.setFullYear(l.getFullYear() - 18);
  $("#naissance").max = l.toISOString().slice(0, 10);
})();

// ---------- Caméra VS intégrée ----------
let flux = null, enregistreur = null, morceaux = [], faceCamera = "environment", minuteurCam = null, debutCam = 0, blocCam = null;

async function ouvrirCamera(face, secours) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    msg("Caméra intégrée indisponible ici : j'ouvre celle du téléphone.");
    return $("#" + secours).click();
  }
  document.querySelectorAll("#liste-reels video").forEach((v) => v.pause());
  pleinEcran(true);
  faceCamera = face;
  reinitialiserCamera();
  $("#camera").hidden = false;
  await demarrerFlux();
}

function reinitialiserCamera() {
  clearInterval(minuteurCam);
  const revoir = $("#cam-revoir");
  revoir.pause();
  if (revoir.src) { URL.revokeObjectURL(revoir.src); revoir.removeAttribute("src"); }
  revoir.hidden = true;
  $("#cam-direct").hidden = false;
  $("#cam-pilote").hidden = false;
  $("#cam-choix").hidden = true;
  $("#cam-outils").hidden = false;
  $("#cam-durees").hidden = false;
  $("#cam-rec").classList.remove("en-cours");
  $("#cam-chrono").textContent = "0:00";
}

async function demarrerFlux() {
  arreterFlux();
  try {
    flux = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: faceCamera, aspectRatio: { ideal: 9 / 16 }, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30, max: 30 } },
      audio: true,
    });
    torche = false;
    $("#cam-flash").classList.remove("actif");
    const v = $("#cam-direct");
    v.classList.toggle("miroir", faceCamera === "user");
    v.onloadedmetadata = () => { v.style.objectFit = v.videoHeight >= v.videoWidth ? "cover" : "contain"; };
    const piste = flux.getVideoTracks()[0];
    const cap = piste.getCapabilities ? piste.getCapabilities() : {};
    const zoom = $("#cam-zoom");
    if (cap.zoom) {
      try { await piste.applyConstraints({ advanced: [{ zoom: cap.zoom.min }] }); } catch (e) {}
      zoom.min = cap.zoom.min; zoom.max = cap.zoom.max; zoom.step = cap.zoom.step || 0.1; zoom.value = cap.zoom.min;
      zoom.oninput = () => piste.applyConstraints({ advanced: [{ zoom: Number(zoom.value) }] }).catch(() => {});
      zoom.hidden = false;
    } else zoom.hidden = true;
    v.srcObject = flux;
    v.muted = true;
    await v.play();
  } catch (err) {
    fermerCamera();
    msg("Impossible d'ouvrir la caméra. Autorise-la dans les réglages du navigateur.");
  }
}

function arreterFlux() {
  if (flux) { flux.getTracks().forEach((t) => t.stop()); flux = null; }
}

function fermerCamera(garder = false) {
  clearInterval(minuteurCam);
  if (enregistreur && enregistreur.state !== "inactive") { enregistreur.onstop = null; enregistreur.stop(); }
  enregistreur = null;
  arreterFlux();
  reinitialiserCamera();
  $("#camera").hidden = true;
  if (!garder) { pleinEcran(false); reprendreReels(); }
}

function lancerEnregistrement() {
  if (!flux) return;
  const types = ["video/mp4;codecs=avc1", "video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
  morceaux = [];
  const options = { videoBitsPerSecond: 1800000 };
  if (mime) options.mimeType = mime;
  enregistreur = new MediaRecorder(flux, options);
  enregistreur.ondataavailable = (e) => { if (e.data.size) morceaux.push(e.data); };
  enregistreur.onstop = finEnregistrement;
  enregistreur.start(1000);
  debutCam = Date.now();
  $("#cam-rec").classList.add("en-cours");
  $("#cam-outils").hidden = true;
  $("#cam-durees").hidden = true;
  minuteurCam = setInterval(() => {
    const sec = Math.floor((Date.now() - debutCam) / 1000);
    $("#cam-chrono").textContent = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
    if (sec >= dureeMax) arreterEnregistrement();
  }, 250);
}

function arreterEnregistrement() {
  clearInterval(minuteurCam);
  if (enregistreur && enregistreur.state === "recording") enregistreur.stop();
}

function finEnregistrement() {
  $("#cam-rec").classList.remove("en-cours");
  const type = (enregistreur.mimeType || "video/webm").split(";")[0];
  const fichier = new File([new Blob(morceaux, { type })], "eclair-" + Date.now() + "." + type.split("/")[1], { type });
  fermerCamera(true);
  ouvrirMontage(fichier, "camera");
}

$("#cam-rec").onclick = async () => {
  if (enregistreur && enregistreur.state === "recording") return arreterEnregistrement();
  if (delaiCam) await compteARebours(delaiCam);
  lancerEnregistrement();
};
$("#cam-flip").onclick = () => { faceCamera = faceCamera === "user" ? "environment" : "user"; demarrerFlux(); };
$("#cam-fermer").onclick = () => fermerCamera();
$("#cam-refaire").onclick = () => { reinitialiserCamera(); demarrerFlux(); };
$("#cam-utiliser").onclick = () => {
  const type = (blocCam.type || "video/webm").split(";")[0];
  const fichier = new File([blocCam], "eclair-" + Date.now() + "." + type.split("/")[1], { type });
  fermerCamera();
  ouvrirMontage(fichier);
};

// ---------- Outils de la caméra : flash, minuterie, durée ----------
let torche = false, delaiCam = 0, dureeMax = 60;

function compteARebours(n) {
  return new Promise((ok) => {
    const el = $("#cam-compte");
    let i = n;
    el.textContent = i;
    el.hidden = false;
    const t = setInterval(() => {
      i--;
      if (i <= 0 || !flux) { clearInterval(t); el.hidden = true; ok(); } else el.textContent = i;
    }, 1000);
  });
}

$("#cam-flash").onclick = async () => {
  const piste = flux && flux.getVideoTracks()[0];
  const cap = piste && piste.getCapabilities ? piste.getCapabilities() : {};
  if (!cap.torch) return msg("Flash indisponible sur cette caméra.");
  torche = !torche;
  try { await piste.applyConstraints({ advanced: [{ torch: torche }] }); } catch (e) { torche = false; msg("Flash indisponible."); }
  $("#cam-flash").classList.toggle("actif", torche);
};
$("#cam-minuterie").onclick = () => {
  delaiCam = delaiCam === 0 ? 3 : delaiCam === 3 ? 10 : 0;
  $("#cam-min-txt").textContent = delaiCam ? delaiCam + " s" : "Minuterie";
  $("#cam-minuterie").classList.toggle("actif", delaiCam > 0);
};
$("#cam-durees").addEventListener("click", (e) => {
  const p = e.target.closest("[data-duree]");
  if (!p) return;
  dureeMax = Number(p.dataset.duree);
  $("#cam-durees").querySelectorAll(".puce").forEach((x) => x.classList.toggle("actif", x === p));
});

// ---------- Partager un éclair avec un ami (messagerie VS) ----------
async function ouvrirPartage(b) {
  cible = { type: "reel", id: b.dataset.id, user: b.dataset.user, pseudo: b.dataset.pseudo, url: b.dataset.url, legende: "" };
  await action("act-envoyer");
  $("#menu-actions").insertAdjacentHTML("beforeend", '<button class="bouton contour large" id="act-partager">Partager le lien hors de VS</button>');
  $("#menu").hidden = false;
}

async function publierStory(file) {
  try {
    msg("Envoi de ta story…");
    const url = await envoyerImage(file, true);
    const type = file.type.startsWith("video/") ? "video" : "image";
    const { error } = await db.from("stories").insert({ user_id: moi.id, media_url: url, type });
    if (error) throw error;
    msg("Story publiée pour 24 h !");
    chargerStories();
  } catch (err) { msg(err.message); }
}

// ---------- Montage vidéo (style TikTok) ----------
const FILTRES = [["Normal", "none"], ["Néon", "sepia(.4) hue-rotate(230deg) saturate(2) contrast(1.1)"], ["Noir et blanc", "grayscale(1) contrast(1.15)"],
  ["Chaud", "sepia(.35) saturate(1.4) brightness(1.05)"], ["Froid", "sepia(.15) hue-rotate(160deg) saturate(.8)"],
  ["Vintage", "sepia(.55) contrast(.95) brightness(1.05) saturate(.85)"], ["Contraste", "contrast(1.35) saturate(1.25)"]];
const VITESSES = [0.5, 1, 1.5, 2];
const STICKERS = ["😂", "🔥", "💜", "⚡", "😍", "👑", "🎉", "💯", "😎", "👀"];
const FILTRES_OK = typeof document.createElement("canvas").getContext("2d").filter === "string";
const MONTAGE_OK = !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
let mt = null;

$("#mt-filtres").innerHTML = FILTRES.map(([n, v], i) => `<button type="button" class="puce ${i === 0 ? "actif" : ""}" data-filtre="${v}">${n}</button>`).join("");
$("#mt-vitesse").innerHTML = VITESSES.map((v) => `<button type="button" class="puce ${v === 1 ? "actif" : ""}" data-vitesse="${v}">${v}×</button>`).join("");
$("#mt-stickers").innerHTML = STICKERS.map((e) => `<button type="button" class="puce emoji" data-sticker="${e}">${e}</button>`).join("") + '<button type="button" class="puce" data-sticker="">Retirer</button>';
if (!FILTRES_OK) document.querySelector('[data-outil="filtres"]').hidden = true;

function lireDuree(v) {
  return new Promise((ok) => {
    const pret = () => {
      if (isFinite(v.duration)) return ok(v.duration);
      v.ontimeupdate = () => { v.ontimeupdate = null; const d = v.duration; v.currentTime = 0; ok(isFinite(d) ? d : 60); };
      v.currentTime = 1e101;
    };
    if (v.readyState >= 1) pret(); else v.onloadedmetadata = pret;
  });
}

function ajusterScene() {
  const z = $("#mt-zone"), sc = $("#mt-scene");
  const w = z.clientWidth, h = z.clientHeight;
  let sh = h, sw = (h * 9) / 16;
  if (sw > w) { sw = w; sh = (w * 16) / 9; }
  sc.style.width = sw + "px";
  sc.style.height = sh + "px";
}
window.addEventListener("resize", () => { if (mt) ajusterScene(); });

function modifie() {
  return !!mt && (mt.debut > 0.05 || mt.fin < mt.duree - 0.05 || mt.vitesse !== 1 || mt.filtre !== "none"
    || mt.texte.trim() !== "" || mt.sticker !== "" || mt.muet || !!mt.son);
}
function majDuree() {
  $("#mt-lab-debut").textContent = mt.debut.toFixed(1) + " s";
  $("#mt-lab-fin").textContent = mt.fin.toFixed(1) + " s";
  $("#mt-duree").textContent = "Durée finale : " + ((mt.fin - mt.debut) / mt.vitesse).toFixed(1) + " s";
}
function placer(el, pos) { el.style.left = pos.x * 100 + "%"; el.style.top = pos.y * 100 + "%"; }
function majTexte() {
  const t = $("#mt-texte");
  t.textContent = mt.texte;
  t.style.color = mt.couleur === "violet" ? "#A855F7" : "#fff";
  placer(t, mt.posTexte);
}
function majSticker() { const t = $("#mt-sticker"); t.textContent = mt.sticker; placer(t, mt.posSticker); }
function majSon() { $("#mt-son-nom").textContent = mt.son ? mt.son.name.slice(0, 22) : "Ajouter un son"; }

function deplacable(el, cle) {
  let actif = false;
  el.addEventListener("pointerdown", (e) => { actif = true; el.setPointerCapture(e.pointerId); e.preventDefault(); });
  el.addEventListener("pointermove", (e) => {
    if (!actif || !mt) return;
    const r = $("#mt-scene").getBoundingClientRect();
    mt[cle] = { x: Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width)), y: Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / r.height)) };
    placer(el, mt[cle]);
  });
  ["pointerup", "pointercancel"].forEach((n) => el.addEventListener(n, () => { actif = false; }));
}
deplacable($("#mt-texte"), "posTexte");
deplacable($("#mt-sticker"), "posSticker");

async function ouvrirMontage(file, origine = "galerie") {
  pleinEcran(true);
  if (!file || !file.type.startsWith("video/")) return msg("Choisis une vidéo.");
  if (!MONTAGE_OK) {
    fichierReel = file;
    $("#nom-reel").textContent = "Vidéo prête : " + file.name;
    return msg("Montage indisponible sur cet appareil, la vidéo est prête.");
  }
  mt = { file, origine, url: URL.createObjectURL(file), debut: 0, fin: 1, duree: 1, vitesse: 1, filtre: "none", texte: "", couleur: "blanc",
    sticker: "", muet: false, son: null, posTexte: { x: 0.5, y: 0.8 }, posSticker: { x: 0.5, y: 0.45 } };
  document.querySelectorAll("#mt-feuille .puce").forEach((p) => {
    const d = p.dataset;
    p.classList.toggle("actif", d.filtre === "none" || d.vitesse === "1" || d.couleur === "blanc");
  });
  $("#mt-saisie").value = "";
  $("#mt-muet").checked = false;
  $("#mt-feuille").hidden = true;
  $("#mt-progres").hidden = true;
  const v = $("#mt-video");
  v.ontimeupdate = null;
  v.src = mt.url;
  v.style.filter = "none";
  v.muted = true;
  v.playbackRate = 1;
  $("#montage").hidden = false;
  ajusterScene();
  mt.duree = await lireDuree(v);
  mt.fin = mt.duree;
  ["mt-debut", "mt-fin"].forEach((id) => { const r = $("#" + id); r.min = 0; r.max = mt.duree; r.step = 0.1; });
  $("#mt-debut").value = 0;
  $("#mt-fin").value = mt.duree;
  majDuree(); majTexte(); majSticker(); majSon();
  v.ontimeupdate = () => { if (v.currentTime >= mt.fin || v.currentTime < mt.debut - 0.3) v.currentTime = mt.debut; };
  v.currentTime = 0;
  v.play().catch(() => {});
}

function fermerMontage(garder = false) {
  const v = $("#mt-video");
  v.pause();
  v.ontimeupdate = null;
  v.removeAttribute("src");
  if (mt) URL.revokeObjectURL(mt.url);
  mt = null;
  $("#mt-feuille").hidden = true;
  $("#mt-progres").hidden = true;
  $("#montage").hidden = true;
  if (!garder) { pleinEcran(false); reprendreReels(); }
}

function ouvrirOutil(nom) {
  document.querySelectorAll(".mt-panneau").forEach((p) => { p.hidden = p.dataset.panneau !== nom; });
  $("#mt-feuille").hidden = false;
  if (nom === "texte") $("#mt-saisie").focus();
}
$("#mt-outils").addEventListener("click", (e) => { const b = e.target.closest("[data-outil]"); if (b && mt) ouvrirOutil(b.dataset.outil); });
$("#mt-son-pilule").onclick = () => { if (mt) ouvrirOutil("son"); };
$("#mt-ok").onclick = () => { $("#mt-feuille").hidden = true; };
$("#mt-feuille").addEventListener("click", (e) => {
  const p = e.target.closest(".puce");
  if (!p || !mt) return;
  p.parentElement.querySelectorAll(".puce").forEach((x) => x.classList.toggle("actif", x === p));
  const d = p.dataset;
  if (d.filtre !== undefined) { mt.filtre = d.filtre; $("#mt-video").style.filter = d.filtre; }
  if (d.vitesse) { mt.vitesse = Number(d.vitesse); $("#mt-video").playbackRate = mt.vitesse; majDuree(); }
  if (d.couleur) { mt.couleur = d.couleur; majTexte(); }
  if (d.sticker !== undefined) { mt.sticker = d.sticker; majSticker(); }
});
$("#mt-saisie").oninput = (e) => { if (mt) { mt.texte = e.target.value; majTexte(); } };
$("#mt-debut").oninput = (e) => { mt.debut = Math.min(Number(e.target.value), mt.fin - 0.5); e.target.value = mt.debut; $("#mt-video").currentTime = mt.debut; majDuree(); };
$("#mt-fin").oninput = (e) => { mt.fin = Math.max(Number(e.target.value), mt.debut + 0.5); e.target.value = mt.fin; majDuree(); };
$("#mt-video").onclick = (e) => { e.target.muted = !e.target.muted; };
$("#mt-choisir-son").onclick = () => $("#mt-fichier-son").click();
$("#mt-fichier-son").onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || !mt) return;
  if (!f.type.startsWith("audio/")) return msg("Choisis un fichier audio.");
  mt.son = f;
  majSon();
  msg("Son ajouté : il sera mixé quand tu appuieras sur Suivant.");
};
$("#mt-retirer-son").onclick = () => { if (mt) { mt.son = null; majSon(); } };
$("#mt-muet").onchange = (e) => { if (mt) mt.muet = e.target.checked; };
$("#mt-annuler").onclick = () => {
  const retour = !!mt && mt.origine === "camera";
  fermerMontage(retour);
  if (retour) ouvrirCamera(faceCamera, faceCamera === "user" ? "cam-selfie" : "cam-arriere");
};

$("#mt-suivant").onclick = async () => {
  const f = await terminerMontage();
  if (!f) return;
  fichierReel = f;
  $("#nom-reel").textContent = "Vidéo prête (" + (f.size / 1048576).toFixed(1) + " Mo)";
  fermerMontage();
  if (pageActuelle !== "feed") aller("feed");
  $("#f-reel").hidden = false;
  msg("Ajoute une légende puis publie ton éclair.");
};
$("#mt-story").onclick = async () => {
  const f = await terminerMontage();
  if (!f) return;
  fermerMontage();
  publierStory(f);
};

async function terminerMontage() {
  if (!modifie()) return mt.file;
  const m = mt, W = 720, H = 1280;
  $("#mt-video").pause();
  $("#mt-progres").hidden = false;
  $("#mt-barre-i").style.width = "0%";
  let ac = null, audio = null;
  try {
    const ev = document.createElement("video");
    ev.src = m.url;
    ev.playsInline = true;
    ev.preload = "auto";
    await new Promise((ok, ko) => { ev.onloadeddata = ok; ev.onerror = ko; });
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const flux2 = c.captureStream(30);
    if (m.muet) ev.muted = true;
    if (!m.muet || m.son) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const dest = ac.createMediaStreamDestination();
        if (!m.muet) ac.createMediaElementSource(ev).connect(dest);
        if (m.son) {
          audio = new Audio(URL.createObjectURL(m.son));
          audio.preload = "auto";
          ac.createMediaElementSource(audio).connect(dest);
        }
        dest.stream.getAudioTracks().forEach((t) => flux2.addTrack(t));
      } catch (e) { ac = null; ev.muted = true; }
    }
    const types = ["video/mp4;codecs=avc1", "video/webm;codecs=h264,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
    const options = { videoBitsPerSecond: 2000000 };
    if (mime) options.mimeType = mime;
    const rec = new MediaRecorder(flux2, options);
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const fini = new Promise((ok) => { rec.onstop = ok; });
    if (Math.abs(ev.currentTime - m.debut) > 0.01) {
      ev.currentTime = m.debut;
      await new Promise((ok) => { ev.onseeked = ok; });
    }
    ev.playbackRate = m.vitesse;
    const filtre = FILTRES_OK ? m.filtre : "none";
    const texte = m.texte.trim();
    rec.start(1000);
    await ev.play();
    if (audio) audio.play().catch(() => {});
    const dessiner = () => {
      const vw = ev.videoWidth, vh = ev.videoHeight, r = Math.max(W / vw, H / vh), dw = vw * r, dh = vh * r;
      ctx.filter = filtre;
      ctx.drawImage(ev, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.filter = "none";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (m.sticker) {
        ctx.font = "116px sans-serif";
        ctx.fillText(m.sticker, m.posSticker.x * W, m.posSticker.y * H);
      }
      if (texte) {
        let taille = 64;
        const police = () => `800 ${taille}px Inter, "Segoe UI", sans-serif`;
        ctx.font = police();
        while (ctx.measureText(texte).width > 640 && taille > 28) { taille -= 4; ctx.font = police(); }
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.fillStyle = m.couleur === "violet" ? "#A855F7" : "#FFFFFF";
        ctx.strokeText(texte, m.posTexte.x * W, m.posTexte.y * H);
        ctx.fillText(texte, m.posTexte.x * W, m.posTexte.y * H);
      }
      const pct = Math.round(Math.min(1, (ev.currentTime - m.debut) / (m.fin - m.debut)) * 100);
      $("#mt-barre-i").style.width = pct + "%";
      $("#mt-progres-txt").textContent = "Montage en cours… " + pct + " %";
      if (ev.currentTime >= m.fin - 0.05 || ev.ended) { ev.pause(); rec.stop(); return; }
      requestAnimationFrame(dessiner);
    };
    dessiner();
    await fini;
    if (audio) audio.pause();
    const type = (rec.mimeType || "video/webm").split(";")[0];
    return new File([new Blob(parts, { type })], "eclair-montage-" + Date.now() + "." + type.split("/")[1], { type });
  } catch (err) {
    msg("Le montage a échoué sur cet appareil. Essaie avec moins d'effets.");
    return null;
  } finally {
    $("#mt-progres").hidden = true;
    if (ac) ac.close().catch(() => {});
  }
}

// ---------- Plein écran ----------
function pleinEcran(on) {
  try {
    if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    } else if (!on && document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  } catch (e) {}
}

// ---------- Stories : 24 h seulement ----------
async function nettoyerMesStories() {
  const limite = new Date(Date.now() - 864e5).toISOString();
  const { data } = await db.from("stories").select("id,media_url").eq("user_id", moi.id).lt("created_at", limite);
  if (!data || !data.length) return;
  const chemins = data.map((x) => x.media_url).filter((u) => u.includes("/medias/"))
    .map((u) => decodeURIComponent(u.split("/medias/")[1].split("?")[0]));
  if (chemins.length) await db.storage.from("medias").remove(chemins);
  await db.from("stories").delete().in("id", data.map((x) => x.id));
}
