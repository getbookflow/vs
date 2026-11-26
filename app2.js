/* VS — partie 2 sur 3 (app2.js) */
// ---------- v7 : profils, recherche, paramètres, sons et notifications en direct ----------
let pageActuelle = "feed", pagePrecedente = "feed", courriel = "", canalNotifs = null, audioCtx = null;
let histoiresAutre = [], minuteurRecherche;
const eco = () => localStorage.getItem("vs_eco") === "1";
const miniAvatar = (p) => p.avatar_url
  ? `<img class="avatar mini" src="${esc(p.avatar_url)}" alt="">`
  : `<span class="avatar mini">${esc((p.pseudo || "?")[0].toUpperCase())}</span>`;

function bulle(m) {
  const moiMsg = m.sender_id === moi.id ? "moi" : "";
  const md = /^\[\[duel:([^\]]+)\]\]\s*([\s\S]*)$/.exec(m.contenu || "");
  if (md) return `<div class="bulle ${moiMsg}" data-voir-duel="${esc(md[1])}"><strong>⚔️ Duel VS</strong><br>${esc(md[2])}<small>Touche pour voir et voter</small></div>`;
  const mi = /^\[\[img:([^\]]+)\]\]$/.exec(m.contenu || "");
  if (mi) return `<div class="bulle ${moiMsg}"><img class="zoom" src="${esc(mi[1])}" alt="Photo"></div>`;
  const mv = /^\[\[voc:([^\]|]+)(?:\|(\d+))?\]\]$/.exec(m.contenu || "");
  if (mv) {
    const dv = Number(mv[2] || 0);
    return `<div class="bulle ${moiMsg}"><audio src="${esc(mv[1])}" controls preload="metadata"></audio><small>🎤 ${Math.floor(dv / 60)}:${String(dv % 60).padStart(2, "0")}</small></div>`;
  }
  if (m.story_id) {
    const media = m.stories
      ? (m.stories.type === "video"
        ? `<video src="${esc(m.stories.media_url)}#t=0.001" controls playsinline preload="metadata"></video>`
        : `<img class="zoom" src="${esc(m.stories.media_url)}" alt="">`)
      : `<small>Cette story a expiré (24 h).</small>`;
    return `<div class="bulle ${moiMsg}">${media}<small>${esc(m.contenu)}</small></div>`;
  }
  if (m.reels) {
    return `<div class="bulle ${moiMsg}"><video src="${esc(m.reels.video_url)}#t=0.001" controls playsinline preload="metadata"></video><small>${esc(m.reels.legende)}</small></div>`;
  }
  return `<div class="bulle ${moiMsg}">${esc(m.contenu)}</div>`;
}

// Son de notification néon + vibration
document.addEventListener("click", () => {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {}
}, { once: true });

let wavSon = null;
function creerWav() {
  const taux = 22050, notes = [[659.25, 0, 0.18], [880, 0.14, 0.18], [1318.5, 0.28, 0.4]];
  const n = Math.floor(taux * 0.75), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const ecrire = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  ecrire(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); ecrire(8, "WAVE"); ecrire(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, taux, true);
  v.setUint32(28, taux * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ecrire(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / taux;
    let x = 0;
    for (const [f, d, long] of notes) {
      const u = t - d;
      if (u >= 0 && u < long) x += Math.sin(2 * Math.PI * f * u) * Math.exp(-u * 9) * Math.min(1, u * 200);
    }
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x * 0.8)) * 32767, true);
  }
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function jouerSon(force = false) {
  if (force || localStorage.getItem("vs_son") !== "0") {
    try {
      wavSon = wavSon || new Audio(creerWav());
      wavSon.volume = 1;
      wavSon.currentTime = 0;
      wavSon.play().catch(() => {});
    } catch (e) {}
  }
  if ((force || localStorage.getItem("vs_vibre") !== "0") && navigator.vibrate) navigator.vibrate([60, 40, 60]);
}

function alerter(texte) {
  jouerSon();
  msg(texte);
  if (pageActuelle === "notifs") chargerNotifs(); else majBadges();
  if (pageActuelle === "messages" && !dest) chargerMessages();
}

function ecouterNotifs() {
  if (canalNotifs) return;
  canalNotifs = db.channel("vs-notifs-" + moi.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + moi.id }, (p) => alerter(p.new.texte))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "follows", filter: "followed_id=eq." + moi.id }, async (p) => {
      const { data } = await db.from("profiles").select("pseudo").eq("id", p.new.follower_id).single();
      alerter("@" + (data ? data.pseudo : "Quelqu'un") + " s'est abonné à toi");
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "receiver_id=eq." + moi.id }, async (p) => {
      if (dest && dest.id === p.new.sender_id) return rafraichirChat();
      const { data } = await db.from("profiles").select("pseudo").eq("id", p.new.sender_id).single();
      alerter("Nouveau message de @" + (data ? data.pseudo : "quelqu'un"));
    })
    .subscribe((statut) => { if (statut === "CHANNEL_ERROR" || statut === "TIMED_OUT") msg("Notifications en direct indisponibles pour l'instant."); });
}

// Profil d'un autre compte
async function voirProfil(id) {
  if (id === moi.id) return aller("profil");
  aller("autre");
  const box = $("#fiche-autre");
  box.innerHTML = `<p class="secondaire">Chargement…</p>`;
  const [p, r, s, sv] = await Promise.all([
    db.from("profiles").select("id,pseudo,prenom,bio,avatar_url,abonnes,desactive").eq("id", id).single(),
    db.from("reels").select("id,video_url,legende,reel_likes(count)").eq("user_id", id).order("created_at", { ascending: false }),
    db.from("stories").select("id,user_id,media_url,type,legende,created_at,profiles!stories_user_id_fkey(pseudo,avatar_url)")
      .eq("user_id", id).gt("created_at", new Date(Date.now() - 864e5).toISOString()).order("created_at", { ascending: true }),
    db.from("follows").select("followed_id").eq("follower_id", moi.id).eq("followed_id", id).maybeSingle(),
  ]);
  if (p.error) { box.textContent = "Profil introuvable."; return; }
  const u = p.data, reels = r.data || [];
  if (u.desactive) { box.innerHTML = '<p class="secondaire">Ce compte est désactivé.</p>'; return; }
  const likes = reels.reduce((n, x) => n + (x.reel_likes[0]?.count ?? 0), 0);
  histoiresAutre = sv.data ? (s.data || []) : [];
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
      db.from("profiles").select("id,pseudo,prenom,abonnes,avatar_url").eq("desactive", false).ilike("pseudo", "%" + q + "%")
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
  if (f.mdp.value !== f.mdp2.value) return msg("Les deux nouveaux mots de passe sont différents.");
  if (f.ancien.value === f.mdp.value) return msg("Le nouveau mot de passe doit être différent de l'ancien.");
  chargement(f, true);
  const verif = await db.auth.signInWithPassword({ email: courriel, password: f.ancien.value });
  if (verif.error) { chargement(f, false); return msg("L'ancien mot de passe est incorrect."); }
  const { error } = await db.auth.updateUser({ password: f.mdp.value });
  chargement(f, false);
  msg(error ? error.message : "Mot de passe modifié !");
  if (!error) f.reset();
};

async function chargerParametres() {
  montrerReglage(null);
  majHub();
  majCompteSauve();
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

async function publierStory(file, legende = "") {
  try {
    msg("Envoi de ta story…");
    const url = await envoyerImage(file, true);
    const type = file.type.startsWith("video/") ? "video" : "image";
    const { error } = await db.from("stories").insert({ user_id: moi.id, media_url: url, type, legende: legende.trim().slice(0, 150) });
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
  const photo = !!file && file.type.startsWith("image/") && modeAjout === "story";
  if (!file || !(photo || file.type.startsWith("video/"))) return msg(modeAjout === "story" ? "Choisis une photo ou une vidéo." : "Choisis une vidéo.");
  if (!MONTAGE_OK && !photo) {
    msg("Montage indisponible sur cet appareil : publication directe.");
    return modeAjout === "story" ? publierStory(file) : publierEclair(file, "");
  }
  mt = { file, origine, type: photo ? "image" : "video", url: URL.createObjectURL(file), debut: 0, fin: 1, duree: 1, vitesse: 1,
    filtre: "none", texte: "", couleur: "blanc", sticker: "", muet: false, son: null, posTexte: { x: 0.5, y: 0.8 }, posSticker: { x: 0.5, y: 0.45 } };
  document.querySelectorAll("#mt-feuille .puce").forEach((p) => {
    const d = p.dataset;
    p.classList.toggle("actif", d.filtre === "none" || d.vitesse === "1" || d.couleur === "blanc");
  });
  $("#mt-saisie").value = "";
  $("#mt-legende").value = "";
  $("#mt-muet").checked = false;
  $("#mt-feuille").hidden = true;
  $("#mt-progres").hidden = true;
  document.querySelectorAll('[data-outil="decouper"], [data-outil="vitesse"], [data-outil="son"], #mt-son-pilule').forEach((el) => { el.hidden = photo; });
  $("#mt-story").hidden = modeAjout !== "story";
  $("#mt-suivant").hidden = modeAjout === "story";
  const v = $("#mt-video"), im = $("#mt-image");
  v.hidden = photo;
  im.hidden = !photo;
  v.style.filter = "none";
  im.style.filter = "none";
  $("#montage").hidden = false;
  ajusterScene();
  v.ontimeupdate = null;
  if (photo) {
    v.pause();
    v.removeAttribute("src");
    im.src = mt.url;
    majTexte(); majSticker(); majSon();
    if (origine === "texte") ouvrirOutil("texte");
    return;
  }
  im.removeAttribute("src");
  v.src = mt.url;
  v.muted = true;
  v.playbackRate = 1;
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
  $("#mt-image").removeAttribute("src");
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
$("#mt-outils").addEventListener("click", (e) => { const b = e.target.closest("[data-outil]"); if (b && mt) { if (b.dataset.outil === "enregistrer") enregistrerMontage(); else ouvrirOutil(b.dataset.outil); } });
$("#mt-son-pilule").onclick = () => { if (mt) ouvrirOutil("son"); };
$("#mt-ok").onclick = () => { $("#mt-feuille").hidden = true; };
$("#mt-feuille").addEventListener("click", (e) => {
  const p = e.target.closest(".puce");
  if (!p || !mt) return;
  p.parentElement.querySelectorAll(".puce").forEach((x) => x.classList.toggle("actif", x === p));
  const d = p.dataset;
  if (d.filtre !== undefined) { mt.filtre = d.filtre; $("#mt-video").style.filter = d.filtre; $("#mt-image").style.filter = d.filtre; }
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
  const camera = !!mt && mt.origine === "camera";
  fermerMontage(true);
  if (camera) ouvrirCamera(faceCamera, faceCamera === "user" ? "cam-selfie" : "cam-arriere");
  else ouvrirAjout(modeAjout);
};

$("#mt-suivant").onclick = async () => {
  const f = await terminerMontage();
  if (!f) return;
  const legende = $("#mt-legende").value;
  fermerMontage();
  publierEclair(f, legende);
};
$("#mt-story").onclick = async () => {
  const f = await terminerMontage();
  if (!f) return;
  const legende = $("#mt-legende").value;
  fermerMontage();
  publierStory(f, legende);
};

async function terminerMontage() {
  if (!modifie()) return mt.file;
  if (mt.type === "image") return exporterPhoto();
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

// ---------- Stories : j'aime, réponse par message, partage ----------
const AVION = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';

function barreStory(s) {
  if (s.user_id === moi.id) {
    return `<div class="story-bas"><span class="story-stats" id="story-stats">♥ 0</span><button type="button" class="story-btn partager-story" aria-label="Envoyer à un ami">${AVION}</button></div>`;
  }
  return `<div class="story-bas">
    <form id="f-rep-story" autocomplete="off"><input id="rep-story" placeholder="Envoyer un message à @${esc(s.profiles.pseudo)}…" maxlength="500"></form>
    <button type="button" class="story-btn coeur-story" id="coeur-story" aria-label="J'aime">♥</button>
    <button type="button" class="story-btn partager-story" aria-label="Envoyer à un ami">${AVION}</button></div>`;
}

async function chargerLikesStory(s) {
  const { data } = await db.from("story_likes").select("user_id").eq("story_id", s.id);
  if (!storyCourante || storyCourante.items[storyCourante.i].id !== s.id) return;
  if (s.user_id === moi.id) { const el = $("#story-stats"); if (el) el.textContent = "♥ " + (data || []).length; }
  else { const b = $("#coeur-story"); if (b) b.classList.toggle("actif", !!(data && data.length)); }
}

async function ouvrirPartageStory(s) {
  clearTimeout(vTimer);
  const vv = document.querySelector("#viewer video");
  if (vv) vv.pause();
  cible = { type: "story", id: s.id, user: s.user_id, pseudo: s.profiles.pseudo, url: s.media_url, legende: "" };
  const { data } = await db.from("follows").select("followed_id,profiles!follows_followed_id_fkey(pseudo)").eq("follower_id", moi.id);
  $("#menu-actions").innerHTML = data && data.length
    ? `<p class="secondaire">Envoyer cette story à…</p>` + data.map((x) => `<button class="bouton contour large" data-envoyer-story="${x.followed_id}">@${esc(x.profiles.pseudo)}</button>`).join("")
    : `<p class="secondaire">Tu ne suis encore personne. Suis des comptes pour leur envoyer des stories.</p>`;
  $("#menu").hidden = false;
}

document.addEventListener("click", async (e) => {
  const cs = e.target.closest(".coeur-story");
  if (cs && storyCourante) {
    const s = storyCourante.items[storyCourante.i];
    const aime = cs.classList.contains("actif");
    const { error } = aime
      ? await db.from("story_likes").delete().eq("story_id", s.id).eq("user_id", moi.id)
      : await db.from("story_likes").insert({ story_id: s.id, user_id: moi.id });
    if (error) return msg(error.message);
    cs.classList.toggle("actif", !aime);
    return;
  }
  const ps = e.target.closest(".partager-story");
  if (ps && storyCourante) return ouvrirPartageStory(storyCourante.items[storyCourante.i]);
  const envS = e.target.closest("[data-envoyer-story]");
  if (envS) {
    const { error } = await db.rpc("envoyer_message", { p_dest: envS.dataset.envoyerStory, p_texte: "Story de @" + cible.pseudo, p_story: cible.id });
    msg(error ? error.message : "Envoyé !");
    return fermerMenu();
  }
});

document.addEventListener("submit", async (e) => {
  if (e.target.id !== "f-rep-story") return;
  e.preventDefault();
  const champ = $("#rep-story"), t = champ.value.trim();
  if (!t || !storyCourante) return;
  const s = storyCourante.items[storyCourante.i];
  const { error } = await db.rpc("envoyer_message", { p_dest: s.user_id, p_texte: "↩ Réponse à ta story : " + t, p_story: s.id });
  if (error) return msg(error.message);
  champ.value = "";
  champ.blur();
  msg("Message envoyé à @" + s.profiles.pseudo);
  ouvrirStory(storyCourante.items, storyCourante.i);
});

document.addEventListener("focusin", (e) => {
  if (e.target.id !== "rep-story") return;
  clearTimeout(vTimer);
  const vv = document.querySelector("#viewer video");
  if (vv) vv.pause();
});

// ---------- Écran « Ajouter » (story ou éclair) ----------
let modeAjout = "story", cleChat = "";

function ouvrirAjout(mode) {
  modeAjout = mode;
  pleinEcran(true);
  $("#aj-titre").textContent = mode === "story" ? "Ajouter à la story" : "Nouvel éclair";
  $("#aj-photo").hidden = mode !== "story";
  $("#aj-texte").hidden = mode !== "story";
  $("#aj-fichier").accept = mode === "story" ? "image/*,video/*" : "video/*";
  $("#ajout").hidden = false;
}
$("#aj-fermer").onclick = () => { $("#ajout").hidden = true; pleinEcran(false); reprendreReels(); };
$("#aj-camera").onclick = () => { $("#ajout").hidden = true; ouvrirCamera("environment", "cam-arriere"); };
$("#aj-galerie").onclick = () => $("#aj-fichier").click();
$("#aj-photo").onclick = () => $("#aj-photo-fichier").click();
["aj-fichier", "aj-photo-fichier"].forEach((id) => {
  $("#" + id).onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    $("#ajout").hidden = true;
    ouvrirMontage(f, "galerie");
  };
});
$("#aj-texte").onclick = async () => {
  $("#ajout").hidden = true;
  const c = document.createElement("canvas");
  c.width = 720; c.height = 1280;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 720, 1280);
  g.addColorStop(0, "#5B21B6");
  g.addColorStop(1, "#08080D");
  x.fillStyle = g;
  x.fillRect(0, 0, 720, 1280);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  ouvrirMontage(new File([blob], "fond.png", { type: "image/png" }), "texte");
};

const legendeStory = (s) => (s.legende ? `<p class="story-legende">${esc(s.legende)}</p>` : "");

async function publierEclair(file, legende) {
  try {
    afficherProgres(0);
    const url = await envoyerImage(file, true, afficherProgres);
    const { error } = await db.from("reels").insert({ user_id: moi.id, video_url: url, legende: legende.trim().slice(0, 150) });
    if (error) throw error;
    msg("Éclair publié !");
    if (pageActuelle === "feed") chargerFeed(); else aller("feed");
  } catch (err) { msg(err.message); }
  finally { afficherProgres(null); }
}

async function exporterPhoto() {
  const m = mt, W = 720, H = 1280;
  const img = new Image();
  img.src = m.url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const r = Math.max(W / img.naturalWidth, H / img.naturalHeight), dw = img.naturalWidth * r, dh = img.naturalHeight * r;
  ctx.filter = FILTRES_OK ? m.filtre : "none";
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.filter = "none";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (m.sticker) { ctx.font = "116px sans-serif"; ctx.fillText(m.sticker, m.posSticker.x * W, m.posSticker.y * H); }
  const texte = m.texte.trim();
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
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.9));
  return new File([blob], "story-" + Date.now() + ".jpg", { type: "image/jpeg" });
}

async function enregistrerMontage() {
  const f = await terminerMontage();
  if (!f) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(f);
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  msg("Enregistré sur ton téléphone");
}

