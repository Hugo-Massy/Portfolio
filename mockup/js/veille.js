// Page veille — affichage BRUT : on lit mockup/js/veille-data.json et on déballe
// tous les champs de chaque élément, sans mise en forme. Objectif : voir toute
// l'information disponible. Le sélecteur de langue de l'en-tête reste fonctionnel.

// -------------------------------------------------------------- Traductions --
// (uniquement pour la nav / l'en-tête partagés, pas pour le contenu brut)
function applyTranslations(lang) {
  const dict = I18N[lang] || I18N.fr;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const val = dict[el.dataset.i18n];
    if (val !== undefined) el.innerHTML = val;
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      const val = dict[key];
      if (attr && val !== undefined) el.setAttribute(attr, val);
    });
  });
  document.documentElement.lang = lang;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Les résumés du flux source arrivent parfois déjà tronqués en plein mot
// (« …read live conversat… ») ou proprement via un marqueur « [...] ». On
// uniformise : le marqueur « [...] » indique une coupe déjà propre (on la
// garde telle quelle), tandis qu'une ellipse collée au texte trahit une coupe
// en plein mot (on retire alors ce dernier mot incomplet).
function cleanSummary(s) {
  if (!s) return '';
  const t = s.trim();
  const bracket = t.match(/^(.*?)\s*\[\.\.\.\]\s*$/);
  if (bracket) return `${bracket[1].trimEnd()}…`;
  const raw = t.match(/^(.*?)(?:\.\.\.|…)$/);
  if (raw) {
    let base = raw[1].trimEnd();
    const idx = base.lastIndexOf(' ');
    if (idx > 0) base = base.slice(0, idx);
    return `${base.trimEnd()}…`;
  }
  return t;
}

// Score d'importance « générale » d'une news : on combine plusieurs signaux
// objectifs plutôt qu'un simple tri sévérité + date, pour faire remonter ce qui
// compte vraiment (exploitation réelle, ampleur, portée, autorité, fraîcheur).
const IMPORTANCE_SIGNALS = [
  // Exploitation réelle / urgence — le signal le plus fort
  [50, /actively exploit|exploited in the wild|activement exploit|exploitation active|\bkev\b|known exploited|zero-?day|0-?day|jour[- ]?z[eé]ro/i],
  // Impact majeur (rançongiciel, fuite massive, supply-chain)
  [35, /ransomware|ran[cç]ongiciel|data breach|fuite de donn|supply[- ]chain|cha[îi]ne d'approvisionnement|breach|piratage/i],
  // Gravité technique
  [30, /\bcritical\b|critique|\brce\b|remote code execution|ex[eé]cution de code|unauthenticated|pre-?auth|non authentifi/i],
  // Urgence de correctif
  [20, /emergency|urgent|patch now|out-?of-?band|correctif d'urgence|hotfix/i],
  // Ampleur
  [18, /millions?|thousands?|widespread|massive|worldwide|global|des milliers|des millions|à grande échelle/i],
  [12, /privilege escalation|[eé]l[eé]vation de privil|takeover|prise de contr[ôo]le|bypass|contournement|exfiltrat/i],
  // Portée : éditeurs / produits très répandus (grand rayon d'impact)
  [14, /microsoft|windows|\boffice\b|exchange|outlook|azure|google|chrome|android|apple|\bios\b|macos|cisco|fortinet|forti|ivanti|citrix|vmware|palo alto|\bsap\b|oracle|openssh|openssl|wordpress|linux kernel|kubernetes|docker/i],
];
const SEV_BASE = { high: 40, medium: 18, info: 6 };

function importance(it) {
  let score = SEV_BASE[it.severity] || 0;
  const hay = `${it.title || ''} ${it.summary || ''}`;
  for (const [w, rx] of IMPORTANCE_SIGNALS) if (rx.test(hay)) score += w;
  if (it.sourceType === 'official') score += 8;         // avis/alertes officiels un peu boostés
  const ageDays = (Date.now() - (Date.parse(it.date) || Date.now())) / 86400000;
  if (isFinite(ageDays)) score += Math.max(0, 12 - ageDays); // bonus fraîcheur dégressif sur ~12 j
  return score;
}

// Vignette de repli quand l'item n'a pas d'image (typiquement CERT-FR) :
// logo de la source connue si on en a un, sinon initiale sur fond accent.
const SOURCE_LOGOS = {
  'CERT-FR': 'assets/logo/logo-cert-fr.png',
};
function sourcePlaceholderHtml(it, extraClass) {
  const logo = SOURCE_LOGOS[it.source];
  if (logo) {
    return `<span class="vl-img vl-img-placeholder vl-img-placeholder--logo ${extraClass}" aria-hidden="true"><img src="${escapeHtml(logo)}" alt=""></span>`;
  }
  const initial = (it.source || '?').trim().charAt(0).toUpperCase();
  return `<span class="vl-img vl-img-placeholder ${extraClass}" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

// Rendu soigné d'une ligne du flux retenu (top 10) : même langage visuel que
// les cartes du top 3, mais en ligne compacte plutôt qu'en carte.
function listItemHtml(it, rank) {
  let dateLabel = it.date;
  const parsed = Date.parse(it.date);
  if (isFinite(parsed)) dateLabel = new Date(parsed).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const tags = Array.isArray(it.tags) && it.tags.length
    ? `<ul class="vl-list-tags">${it.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
    : '';
  const link = it.link
    ? `<span class="vl-list-link">Lire l'article<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></span>`
    : '';
  const tag = it.link ? 'a' : 'article';
  const href = it.link ? ` href="${escapeHtml(it.link)}" target="_blank" rel="noopener noreferrer"` : '';
  const img = it.image
    ? `<figure class="vl-img vl-list-img"><img src="${escapeHtml(it.image)}" alt="" decoding="async"><span class="vl-img-spinner" aria-hidden="true"></span></figure>`
    : sourcePlaceholderHtml(it, 'vl-list-img');
  return `<${tag} class="vl-list-item"${href}>`
    + img
    + `<span class="vl-list-rank">${escapeHtml(rank)}</span>`
    + `<div class="vl-list-body">`
    + `<div class="vl-list-head"><h3>${escapeHtml(it.title || '')}</h3><span class="vl-list-date">${escapeHtml(dateLabel || '')}</span></div>`
    + `<p class="vl-list-meta">${escapeHtml(it.source || '')}</p>`
    + `<p class="vl-list-summary">${escapeHtml(cleanSummary(it.summary))}</p>`
    + (tags || link ? `<div class="vl-list-foot">${tags}${link}</div>` : '')
    + `</div></${tag}>`;
}

// Rendu soigné (contrairement à itemHtml, volontairement brut) des 3 cartes du
// top 3 : mêmes tokens visuels que le reste du site (voir styles.css), champs
// triés pour raconter la news plutôt que déballer toutes les clés du JSON.
function topItemHtml(it, rank) {
  const img = it.image
    ? `<figure class="vl-img"><img src="${escapeHtml(it.image)}" alt="" decoding="async"><span class="vl-img-spinner" aria-hidden="true"></span></figure>`
    : '';
  let dateLabel = it.date;
  const parsed = Date.parse(it.date);
  if (isFinite(parsed)) dateLabel = new Date(parsed).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const tags = Array.isArray(it.tags) && it.tags.length
    ? `<ul class="vl-top-tags">${it.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
    : '';
  const link = it.link
    ? `<span class="vl-top-link">Lire l'article<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></span>`
    : '';
  const tag = it.link ? 'a' : 'article';
  const href = it.link ? ` href="${escapeHtml(it.link)}" target="_blank" rel="noopener noreferrer"` : '';
  return `<${tag} class="vl-top-card"${href}>${img}`
    + `<div class="vl-top-card-body">`
    + `<div class="vl-top-card-head"><span class="vl-top-rank">${escapeHtml(rank)}</span><span class="vl-top-date">${escapeHtml(dateLabel || '')}</span></div>`
    + `<h3>${escapeHtml(it.title || '')}</h3>`
    + `<p class="vl-top-meta">${escapeHtml(it.source || '')}</p>`
    + `<p class="vl-top-summary">${escapeHtml(cleanSummary(it.summary))}</p>`
    + tags
    + link
    + `</div></${tag}>`;
}

// Câblage des vignettes d'un conteneur : on masque le spinner dès que l'image
// est peinte. img.complete couvre le cas où l'image (en cache) charge avant
// l'écoute des événements.
function wireImages(container) {
  container.querySelectorAll('.vl-img img').forEach((img) => {
    const fig = img.closest('.vl-img');
    const done = () => fig.classList.add('is-loaded');
    if (img.complete && img.naturalWidth > 0) done();
    else {
      img.addEventListener('load', done);
      img.addEventListener('error', () => fig.classList.add('is-error'));
    }
  });
}

function dumpAll(data) {
  const meta = document.getElementById('vl-meta');
  // Date de génération lisible (fr) plutôt que l'horodatage ISO brut.
  let genDate = data.generatedAt;
  const parsed = Date.parse(data.generatedAt);
  if (isFinite(parsed)) {
    const d = new Date(parsed);
    const datePart = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timePart = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    genDate = `${datePart} à ${timePart}`;
  }
  const genEl = document.getElementById('vl-updated');
  if (genEl) genEl.textContent = `Mise à jour le ${genDate}`;
  // Sources dédupliquées par nom (une puce par source, kinds regroupés).
  const byName = new Map();
  for (const s of data.sources || []) {
    if (!byName.has(s.name)) byName.set(s.name, new Set());
    byName.get(s.name).add(s.kind);
  }
  const items = data.items || [];

  // On ne retient que les 10 items les plus importants (selon le score de
  // pondération importance()) parmi ceux publiés dans les 7 derniers jours :
  // le compteur d'en-tête porte sur cette sélection de 10, répartie ensuite
  // entre le top 3 (cartes) et la liste (les 7 suivants, sans doublon).
  const RETAINED = 10;
  const WINDOW_DAYS = 7;
  const recent = items.filter((it) => {
    const t = Date.parse(it.date);
    return isFinite(t) && (Date.now() - t) / 86400000 <= WINDOW_DAYS;
  });
  const kept = recent.sort((a, b) => importance(b) - importance(a)).slice(0, RETAINED);

  meta.innerHTML =
    `<p class="vl-meta-stats">`
    + `<span class="vl-meta-line">Les <b>${escapeHtml(kept.length)}</b> <strong>actualités</strong> les plus importantes</span>`
    + `<span class="vl-meta-line">auprès de <b>${byName.size}</b> sources ces <b>${WINDOW_DAYS}</b> derniers jours.</span>`
    + `</p>`;

  // Les 3 news les plus importantes — parmi les seules du top 10 pourvues d'une
  // image (le build ne renseigne `image` que sur les items mis en avant).
  const top = document.getElementById('vl-top');
  const top3 = kept.filter((it) => it.image).slice(0, 3);
  top.innerHTML = `<div class="vl-top-grid">`
    + top3.map((it, i) => topItemHtml(it, `#${i + 1}`)).join('')
    + `</div>`;

  wireImages(top);
  initShowcaseScrub(meta, top);

  // Le reste du top 10, déjà présenté ci-dessus via le top 3, n'est pas répété.
  const rest = kept.filter((it) => !top3.includes(it));
  const grid = document.getElementById('vl-grid');
  grid.innerHTML = `<h2 class="vl-all-h">Le reste du top ${kept.length} des ${WINDOW_DAYS} derniers jours</h2>`
    + `<div class="vl-list">${rest.map((it, i) => listItemHtml(it, `#${i + top3.length + 1}`)).join('')}</div>`;
  wireImages(grid);
}

// ---------------------------------------- Séquence épinglée pilotée au scroll --
// Le top 3 et la phrase de stats restent centrés à l'écran (pin sticky) pendant
// qu'on scrolle à travers une piste plus haute que le viewport. Le scroll
// progresse normalement (la barre défile, aucun blocage) mais la suite reste
// cachée sous la piste ; l'avancement des animations (mise en avant des cartes
// du top 3 puis apparition des lignes de texte) est piloté par la progression
// du scroll dans la piste.
function initShowcaseScrub(meta, top) {
  const track = document.getElementById('vl-showcase');
  const lines = Array.from(meta.querySelectorAll('.vl-meta-line'));
  if (!track || !lines.length) return;

  const grid = top && top.querySelector('.vl-top-grid');
  const cards = grid ? Array.from(grid.querySelectorAll('.vl-top-card')) : [];

  // Étapes successives : d'abord une par carte du top 3 (mise en avant façon
  // survol), puis une par ligne de texte.
  const steps = [
    ...cards.map((card) => ({
      on: () => card.classList.add('is-spotlight'),
      off: () => card.classList.remove('is-spotlight'),
    })),
    ...lines.map((line) => ({
      on: () => line.classList.add('is-visible'),
      off: () => line.classList.remove('is-visible'),
    })),
  ];
  if (!steps.length) return;

  // Distance de scroll (en px) allouée à chaque étape, plus une marge finale où
  // tout reste affiché avant que la suite n'apparaisse. La hauteur de la piste
  // = viewport (pour le pin) + cette distance totale.
  const PER_STEP = 320;
  const END_HOLD = 260;
  const scrubLen = steps.length * PER_STEP + END_HOLD;

  function sizeTrack() {
    if (finalized) return;
    track.style.height = (window.innerHeight + scrubLen) + 'px';
  }

  let shown = -1;     // nombre d'étapes actuellement actives (pour éviter les reflows inutiles)
  let completed = false; // séquence entièrement jouée au moins une fois
  let finalized = false; // piste effondrée : plus de pin, plus de scrub

  // Une fois la séquence jouée et la piste entièrement dépassée, on effondre la
  // piste (fin du pin et de la distance de scrub) pour qu'un second passage ne
  // re-fige plus la page. Pour éviter tout saut, on mesure le déplacement réel
  // de l'élément qui suit la piste (le flux complet) avant/après l'effondrement
  // et on corrige exactement le scroll — le tout avec `scroll-behavior:auto`
  // pour que la correction soit instantanée (et non une remontée animée).
  const nextEl = document.getElementById('vl-grid');
  function finalize() {
    if (finalized) return;
    finalized = true;
    lines.forEach((line) => line.classList.add('is-visible'));
    cards.forEach((card) => card.classList.remove('is-spotlight'));
    if (grid) grid.classList.remove('is-showcasing');

    const html = document.documentElement;
    const prevBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';

    const anchor = nextEl || track;
    const before = anchor.getBoundingClientRect().top;
    track.classList.add('is-done');
    track.style.height = '';
    const after = anchor.getBoundingClientRect().top;
    const shift = after - before; // décalage résiduel non absorbé par le navigateur
    if (Math.abs(shift) > 0.5) window.scrollBy(0, shift);

    html.style.scrollBehavior = prevBehavior;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', sizeTrack);
  }

  function render() {
    // Distance déjà parcourue dans la phase épinglée : 0 quand le haut de la
    // piste atteint le haut du viewport, jusqu'à `scrubLen` à la fin du pin.
    const rect = track.getBoundingClientRect();
    const scrolled = Math.min(Math.max(-rect.top, 0), scrubLen);
    // Nombre d'étapes qui doivent être actives à cette progression.
    const active = Math.min(steps.length, Math.floor(scrolled / PER_STEP));
    if (active >= steps.length) completed = true;
    // Séquence jouée ET piste entièrement dépassée vers le haut → on effondre.
    if (completed && rect.bottom <= 0) { finalize(); return; }
    if (active === shown) return;
    for (let i = 0; i < steps.length; i++) {
      if (i < active) steps[i].on(); else steps[i].off();
    }
    // Les cartes non mises en avant s'estompent uniquement pendant la phase du
    // top 3 (tant que toutes les cartes ne sont pas encore éclairées).
    if (grid) grid.classList.toggle('is-showcasing', active > 0 && active < cards.length);
    shown = active;
  }

  let raf = null;
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; render(); });
  }

  sizeTrack();
  window.addEventListener('resize', sizeTrack, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  render();
}

async function initVeille() {
  const status = document.getElementById('vl-status');
  try {
    const res = await fetch('js/veille-data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    status.style.display = 'none';
    dumpAll(data);
  } catch (err) {
    status.textContent = 'Erreur de chargement : ' + err.message;
    console.error('Veille:', err);
  }
}

// ---------------------------------------------------------- Sélecteur langue --
(function initLangSwitch() {
  const btn = document.querySelector('.lang-switch');
  if (!btn) return;

  const LANGS = ['fr', 'en', 'es'];
  const flags = {
    fr: btn.querySelector('.flag-fr'),
    en: btn.querySelector('.flag-en'),
    es: btn.querySelector('.flag-es'),
  };

  function apply(lang) {
    btn.dataset.lang = lang;
    LANGS.forEach((l) => { flags[l].classList.toggle('is-active', l === lang); });
    applyTranslations(lang);
  }

  apply('fr');

  function updateAtTop() { btn.classList.toggle('is-at-top', window.scrollY <= 10); }
  updateAtTop();
  window.addEventListener('scroll', updateAtTop, { passive: true });

  btn.addEventListener('click', () => {
    const next = LANGS[(LANGS.indexOf(btn.dataset.lang) + 1) % LANGS.length];
    apply(next);
  });
})();

// Retour en haut
(function initBackToTop() {
  const btn = document.querySelector('.back-to-top');
  if (!btn) return;
  function update() { btn.classList.toggle('is-visible', window.scrollY > window.innerHeight * 0.5); }
  update();
  window.addEventListener('scroll', update, { passive: true });
})();

// ------------------------------------------------------- Fond quadrillé (bg) --
// Repris à l'identique de la page détails (initDetailsBgGrid) : grille de points
// révélée autour du curseur, fixée au viewport.
(function initVeilleBgGrid() {
  const canvas = document.getElementById('dp-bg-grid');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');

  const SPACING = 38, BASE_RADIUS = 1.2, REACT_RADIUS = 140, MAX_OFFSET = 10;
  const MAX_SCALE = 2.4, REVEAL_RADIUS = 160, REVEAL_FEATHER = 140, BASE_COLOR = '37,70,200';

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0, height = 0, points = [];
  const mouse = { x: -9999, y: -9999, active: false };

  const smoothstep = (e0, e1, v) => { const t = Math.min(Math.max((v - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };

  function buildPoints() {
    points = [];
    for (let y = SPACING / 2; y < height; y += SPACING)
      for (let x = SPACING / 2; x < width; x += SPACING) points.push({ x, y });
  }
  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); buildPoints();
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (mouse.active) {
      for (const p of points) {
        const dx0 = p.x - mouse.x, dy0 = p.y - mouse.y, dist = Math.hypot(dx0, dy0);
        const reveal = 1 - smoothstep(REVEAL_RADIUS - REVEAL_FEATHER, REVEAL_RADIUS, dist);
        if (reveal <= 0.01) continue;
        let dx = 0, dy = 0, scale = 1;
        if (dist < REACT_RADIUS) {
          const force = 1 - dist / REACT_RADIUS, angle = Math.atan2(dy0, dx0);
          dx = Math.cos(angle) * force * MAX_OFFSET; dy = Math.sin(angle) * force * MAX_OFFSET;
          scale = 1 + force * (MAX_SCALE - 1);
        }
        ctx.beginPath();
        ctx.arc(p.x + dx, p.y + dy, BASE_RADIUS * scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${BASE_COLOR},${0.6 * reveal})`;
        ctx.fill();
      }
    }
    requestAnimationFrame(draw);
  }
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }, { passive: true });
  document.addEventListener('mouseleave', () => { mouse.active = false; });
  window.addEventListener('resize', resize);
  resize(); draw();
})();

initVeille();
