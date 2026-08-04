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

// Libellés des projets (id → { fr, en, es }), fournis par le build : les items
// ne transportent que les identifiants.
let PROJECT_LABELS = {};

// Locale Intl associée à chaque langue du sélecteur, pour le formatage des dates.
const LOCALE = { fr: 'fr-FR', en: 'en-US', es: 'es-ES' };

// Données brutes mises en cache après le premier chargement, pour pouvoir
// ré-afficher dans la nouvelle langue au changement de langue sans refetch.
let veilleData = null;
let impactData = null;
let currentLang = 'fr';

// Lit un champ qui peut être soit une simple chaîne (contenu factuel non
// traduit, ex. titre d'article externe), soit un objet { fr, en, es } (texte
// rédigé par mes soins, ex. récit "Impact").
function loc(field, lang) {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field.fr || field.en || field.es || '';
}

// Ligne combinée « projet concerné » + tags de sujet, sur une seule rangée qui
// s'enroule si besoin. Le chip projet reste plus appuyé (fond plein) que les
// tags de sujet (fond léger) : c'est la différence entre une revue de presse
// et une veille exploitée, on ne montre pas seulement qu'on lit, mais quel
// système déployé est concerné.
function tagsRowHtml(it, lang) {
  const projIds = Array.isArray(it.projects) ? it.projects : [];
  const projChips = projIds.length
    ? projIds.map((id) => {
        const labels = PROJECT_LABELS[id];
        const label = labels ? (labels[lang] || labels.fr || id) : id;
        return `<span class="vl-proj-chip">${escapeHtml(label)}</span>`;
      }).join('')
    : '';
  const tagChips = Array.isArray(it.tags) && it.tags.length
    ? it.tags.map((t) => `<span class="vl-tag-chip">${escapeHtml(t)}</span>`).join('')
    : '';
  if (!projChips && !tagChips) return '';
  return `<div class="vl-tags-row">${projChips}${tagChips}</div>`;
}

// Rendu soigné d'une ligne du flux retenu (top 10) : même langage visuel que
// les cartes du top 3, mais en ligne compacte plutôt qu'en carte.
function listItemHtml(it, rank, lang, dict, locale) {
  let dateLabel = it.date;
  const parsed = Date.parse(it.date);
  if (isFinite(parsed)) dateLabel = new Date(parsed).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const tagsRow = tagsRowHtml(it, lang);
  const link = it.link
    ? `<span class="vl-list-link">${dict['vl-read-article']}<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></span>`
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
    + (tagsRow || link ? `<div class="vl-list-foot">${tagsRow}${link}</div>` : '')
    + `</div></${tag}>`;
}

// Rendu soigné (contrairement à itemHtml, volontairement brut) des 3 cartes du
// top 3 : mêmes tokens visuels que le reste du site (voir styles.css), champs
// triés pour raconter la news plutôt que déballer toutes les clés du JSON.
function topItemHtml(it, rank, lang, dict, locale) {
  const img = it.image
    ? `<figure class="vl-img"><img src="${escapeHtml(it.image)}" alt="" decoding="async"><span class="vl-img-spinner" aria-hidden="true"></span></figure>`
    : '';
  let dateLabel = it.date;
  const parsed = Date.parse(it.date);
  if (isFinite(parsed)) dateLabel = new Date(parsed).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const tagsRow = tagsRowHtml(it, lang);
  const link = it.link
    ? `<span class="vl-top-link">${dict['vl-read-article']}<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></span>`
    : '';
  const tag = it.link ? 'a' : 'article';
  const href = it.link ? ` href="${escapeHtml(it.link)}" target="_blank" rel="noopener noreferrer"` : '';
  return `<${tag} class="vl-top-card"${href}>${img}`
    + `<div class="vl-top-card-body">`
    + `<div class="vl-top-card-head"><span class="vl-top-rank">${escapeHtml(rank)}</span><span class="vl-top-date">${escapeHtml(dateLabel || '')}</span></div>`
    + `<h3>${escapeHtml(it.title || '')}</h3>`
    + `<p class="vl-top-meta">${escapeHtml(it.source || '')}</p>`
    + `<p class="vl-top-summary">${escapeHtml(cleanSummary(it.summary))}</p>`
    + tagsRow
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

function dumpAll(data, lang) {
  const dict = I18N[lang] || I18N.fr;
  const locale = LOCALE[lang] || 'fr-FR';
  PROJECT_LABELS = data.projects || {};
  const meta = document.getElementById('vl-meta');
  // Date de génération lisible dans la langue active plutôt que l'horodatage ISO brut.
  let genDate = data.generatedAt;
  const parsed = Date.parse(data.generatedAt);
  if (isFinite(parsed)) {
    const d = new Date(parsed);
    genDate = d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const genEl = document.getElementById('vl-updated');
  if (genEl) genEl.textContent = `${dict['vl-updated-prefix']} ${genDate}`;
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
    + `<span class="vl-meta-line">${dict['vl-meta-line1'].replace('{count}', kept.length)}</span>`
    + `<span class="vl-meta-line">${dict['vl-meta-line2'].replace('{sources}', byName.size).replace('{days}', WINDOW_DAYS)}</span>`
    + `</p>`;

  // Les 3 news les plus importantes — parmi les seules du top 10 pourvues d'une
  // image (le build ne renseigne `image` que sur les items mis en avant).
  const top = document.getElementById('vl-top');
  const top3 = kept.filter((it) => it.image).slice(0, 3);
  top.innerHTML = `<div class="vl-top-grid">`
    + top3.map((it, i) => topItemHtml(it, `#${i + 1}`, lang, dict, locale)).join('')
    + `</div>`;

  wireImages(top);
  initShowcaseScrub(meta, top);

  // Le reste du top 10, déjà présenté ci-dessus via le top 3, n'est pas répété.
  const rest = kept.filter((it) => !top3.includes(it));
  const grid = document.getElementById('vl-grid');
  grid.innerHTML = `<h2 class="vl-all-h">${dict['vl-rest-of-top'].replace('{count}', kept.length).replace('{days}', WINDOW_DAYS)}</h2>`
    + `<div class="vl-list">${rest.map((it, i) => listItemHtml(it, `#${i + top3.length + 1}`, lang, dict, locale)).join('')}</div>`;
  wireImages(grid);
}

// ---------------------------------------- Séquence épinglée pilotée au scroll --
// Le top 3 et la phrase de stats restent centrés à l'écran (pin sticky) pendant
// qu'on scrolle à travers une piste plus haute que le viewport. Le scroll
// progresse normalement (la barre défile, aucun blocage) mais la suite reste
// cachée sous la piste ; l'avancement des animations (mise en avant des cartes
// du top 3 puis apparition des lignes de texte) est piloté par la progression
// du scroll dans la piste.
// Écouteurs de la séquence en cours, pour pouvoir les retirer avant d'en
// recréer d'autres si initShowcaseScrub est rappelée après un changement de
// langue (dumpAll régénère le contenu de meta/top, donc les anciens `lines`/
// `cards` capturés par la précédente instance pointent vers des nœuds retirés
// du DOM — sans ce nettoyage, les écouteurs scroll/resize s'accumuleraient).
let scrubTeardown = null;

function initShowcaseScrub(meta, top) {
  if (scrubTeardown) { scrubTeardown(); scrubTeardown = null; }
  const track = document.getElementById('vl-showcase');
  const pin = track && track.querySelector('.vl-showcase-pin');
  const lines = Array.from(meta.querySelectorAll('.vl-meta-line'));
  if (!track || !pin || !lines.length) return;

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

  // Distance de scroll réel (px) allouée à chaque étape, plus une marge finale
  // où tout reste affiché avant que la suite n'apparaisse. C'est la « course »
  // pendant laquelle le pin reste figé au centre : la piste réserve cette
  // hauteur EN PLUS de celle du pin, ce qui fournit le défilement nécessaire
  // sans jamais bloquer le scroll ni faire sauter le contenu en dessous.
  const PER_STEP = 320;
  const END_HOLD = 260;
  const scrubLen = steps.length * PER_STEP + END_HOLD;

  let shown = -1;        // nombre d'étapes actuellement actives (évite les reflows inutiles)
  let stickyTop = 0;     // valeur de `top` (px) qui centre le pin figé dans le viewport
  let enabled = false;   // pinning actif (désactivé si écran étroit / pin plus haut que le viewport)
  let finalized = false; // séquence jouée une première fois jusqu'au bout : le pin ne se re-fige plus jamais

  function applySteps(active) {
    if (active === shown) return;
    for (let i = 0; i < steps.length; i++) {
      if (i < active) steps[i].on(); else steps[i].off();
    }
    // Les cartes non mises en avant s'estompent uniquement pendant la phase du
    // top 3 (tant que toutes les cartes ne sont pas encore éclairées).
    if (grid) grid.classList.toggle('is-showcasing', active > 0 && active < cards.length);
    shown = active;
  }

  // État final « propre » : cartes toutes revenues à plat (mettre les 3 en
  // spotlight simultané n'aurait pas de sens), lignes de stats affichées.
  function showFinal() {
    cards.forEach((c) => c.classList.remove('is-spotlight'));
    lines.forEach((l) => l.classList.add('is-visible'));
    if (grid) grid.classList.remove('is-showcasing');
    shown = steps.length;
  }
  function hideAll() {
    cards.forEach((c) => c.classList.remove('is-spotlight'));
    lines.forEach((l) => l.classList.remove('is-visible'));
    if (grid) grid.classList.remove('is-showcasing');
    shown = -1;
  }

  // Séquence jouée jusqu'au bout une première fois : le pin quitte le pinning
  // pour de bon (plus jamais de position:sticky ni de re-figement, même en
  // remontant) — voir .vl-showcase-track.is-done. On corrige le scroll pour
  // que la suite du contenu ne saute pas au moment où la piste, devenue
  // inutile, perd sa hauteur réservée.
  function finalize() {
    if (finalized) return;
    finalized = true;
    showFinal();
    track.classList.add('is-done');

    const html = document.documentElement;
    const prevBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    const anchor = document.getElementById('vl-grid') || track;
    const before = anchor.getBoundingClientRect().top;
    pin.style.top = '';
    track.style.height = '';
    const after = anchor.getBoundingClientRect().top;
    const shift = after - before;
    if (Math.abs(shift) > 0.5) window.scrollBy(0, shift);
    html.style.scrollBehavior = prevBehavior;
  }

  // (Re)mesure : hauteur naturelle du pin → position de gel centrée + hauteur
  // de la piste (pin + course). Recalculée au resize et quand la taille du pin
  // change (chargement des images du top 3). Plus aucun effet une fois
  // finalisé : le pin reste définitivement en flux normal.
  function layout() {
    if (finalized) return;
    const H = pin.offsetHeight;
    const vh = window.innerHeight;
    // On ne fige que si l'écran est large (la media query repasse le pin en
    // flux normal sous 760px) ET si le pin tient dans le viewport une fois
    // centré (sinon il serait rogné en haut/bas).
    enabled = window.innerWidth > 760 && H + 24 <= vh;
    if (!enabled) {
      pin.style.top = '';
      track.style.height = '';
      applySteps(0);
      return;
    }
    stickyTop = Math.max(Math.round((vh - H) / 2), 12);
    pin.style.top = stickyTop + 'px';
    track.style.height = (H + scrubLen) + 'px';
    render();
  }

  // Le pin (position:sticky) se colle à `stickyTop` — donc centré — pile quand
  // son centre atteint le milieu de l'écran, puis y reste pendant toute la
  // course `scrubLen` réservée par la piste. `stuck` mesure l'avancée dans
  // cette course (0 → scrubLen) et pilote les étapes, dans les deux sens tant
  // que la séquence n'a pas encore été jouée jusqu'au bout.
  //
  // Une fois finalisée, plus de pin ni de course : on affiche simplement
  // l'état final dès que la piste a été atteinte, et on le retire si l'on
  // remonte au-dessus — réversible, mais sans jamais recoller le bloc au
  // centre de l'écran.
  function render() {
    if (finalized) {
      const passed = track.getBoundingClientRect().top <= window.innerHeight * 0.85;
      if (passed && shown !== steps.length) showFinal();
      else if (!passed && shown !== -1) hideAll();
      return;
    }
    if (!enabled) return;
    const trackTopV = track.getBoundingClientRect().top;
    const stuck = Math.min(Math.max(stickyTop - trackTopV, 0), scrubLen);
    applySteps(Math.min(steps.length, Math.floor(stuck / PER_STEP)));
    if (stuck >= scrubLen) finalize();
  }

  let raf = null;
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = null; render(); });
  }

  layout();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', layout, { passive: true });
  // La hauteur du pin change quand les images du top 3 se chargent : on
  // recale alors la position de gel et la course.
  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => layout());
    resizeObserver.observe(pin);
  }

  scrubTeardown = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', layout);
    if (resizeObserver) resizeObserver.disconnect();
  };
}

// ------------------------------------------------------- Bloc « Impact » --
// Contrairement au flux ci-dessus (généré par build-veille.js), ce contenu est
// écrit à la main dans veille-impact.json : une poignée d'actus qu'on a
// choisies parce qu'elles ont eu une conséquence réelle sur un projet, avec
// l'analyse (constaté / fait / pourquoi) qu'aucun script ne peut produire.
// Carte de l'actu source, au même langage visuel que les cartes du flux
// ci-dessus (.vl-top-card) — mêmes classes, sans puce de rang (ces entrées
// sont chronologiques, pas classées par importance).
function impactArticleCardHtml(e, lang, dict) {
  const locale = LOCALE[lang] || 'fr-FR';
  const img = e.image
    ? `<figure class="vl-img"><img src="${escapeHtml(e.image)}" alt="" decoding="async"><span class="vl-img-spinner" aria-hidden="true"></span></figure>`
    : sourcePlaceholderHtml({ source: (e.source && e.source.label) || '' }, '');
  let dateLabel = e.date;
  const parsed = Date.parse(e.date);
  if (isFinite(parsed)) dateLabel = new Date(parsed).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  const hasLink = e.source && e.source.link;
  const link = hasLink
    ? `<span class="vl-top-link">${dict['vl-read-article']}<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></span>`
    : '';
  const tag = hasLink ? 'a' : 'article';
  const href = hasLink ? ` href="${escapeHtml(e.source.link)}" target="_blank" rel="noopener noreferrer"` : '';
  const style = e.cardWidth ? ` style="width:${e.cardWidth}px;max-width:${e.cardWidth}px;"` : '';
  return `<${tag} class="vl-top-card vl-impact-card"${href}${style}>${img}`
    + `<div class="vl-top-card-body">`
    + `<div class="vl-top-card-head"><span class="vl-top-meta">${escapeHtml((e.source && e.source.label) || '')}</span><span class="vl-top-date">${escapeHtml(dateLabel || '')}</span></div>`
    + `<h3>${escapeHtml(e.title || '')}</h3>`
    + `<p class="vl-top-summary">${escapeHtml(cleanSummary(e.summary))}</p>`
    + link
    + `</div></${tag}>`;
}

// col/row placent l'entrée dans la grille CSS partagée entre les deux colonnes
// (voir renderImpact) : deux entrées au même rang, dans des colonnes
// différentes, partagent ainsi la même ligne et donc la même hauteur de
// rangée — leur texte démarre à la même hauteur, quelle que soit la longueur
// du texte de la colonne voisine sur les rangs précédents.
function impactEntryHtml(e, col, row, isLast, lang, dict) {
  const rankInCol = row - 2; // rang 0-based de l'entrée dans sa propre colonne
  const sideClass = rankInCol % 2 === 1 ? ' vl-impact-entry--right' : '';
  const offsetClass = rankInCol % 4 === 2 ? ' vl-impact-entry--offset' : '';
  const sepClass = rankInCol > 0 ? ' vl-impact-entry--sep' : '';
  const lastClass = isLast ? ' vl-impact-entry--last' : '';
  const layoutClass = e.cardLayout ? ` vl-impact-pos-${e.cardLayout}` : '';
  const card = impactArticleCardHtml(e, lang, dict);
  const story = loc(e.story, lang);
  // Chaque coupure « <br><br> » du récit devient un <p> distinct (avec sa
  // propre marge) plutôt qu'un simple retour à la ligne à l'intérieur d'un
  // unique <p> : sans ça, les entrées sans cardLayout s'affichaient comme un
  // seul bloc de texte compact, beaucoup plus dense que celles scindées
  // autour de la carte.
  const paras = story.split('<br><br>').map((p) => p.trim()).filter(Boolean);
  let body;
  if (e.cardLayout === 'bottom-right' || e.cardLayout === 'bottom-left') {
    // La carte est insérée au milieu du récit (entre l'avant-dernier et le
    // dernier paragraphe) pour que le dernier paragraphe s'enroule autour
    // d'elle, plutôt que de la reléguer sous un bloc de texte plein cadre.
    const splitAt = e.cardSplit === 'last' ? Math.max(paras.length - 1, 1) : 1;
    const lead = paras.slice(0, splitAt);
    const tail = paras.slice(splitAt);
    body = lead.map((p) => `<p class="vl-impact-story">${p}</p>`).join('')
      + card
      + tail.map((p) => `<p class="vl-impact-story">${p}</p>`).join('');
  } else {
    body = card + paras.map((p) => `<p class="vl-impact-story">${p}</p>`).join('');
  }
  return `<div class="vl-impact-entry${sideClass}${offsetClass}${sepClass}${lastClass}${layoutClass}" style="--col:${col};--row:${row};">`
    + `<div class="vl-impact-entry-body">`
    + body
    + `</div></div>`;
}

function impactColumnHtml(id, project, entries, col, lang, dict) {
  const label = (project && loc(project.label, lang)) || id;
  const href = project && project.href;
  const link = href ? `<a class="vl-impact-col-link" href="${escapeHtml(href)}">${dict['vl-view-project']}<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></a>` : '';
  let html = `<div class="vl-impact-col-head" style="--col:${col};--row:1;"><h3>${escapeHtml(label)}</h3>${link}</div>`;
  html += entries.length
    ? entries.map((e, i) => impactEntryHtml(e, col, i + 2, i === entries.length - 1, lang, dict)).join('')
    : `<p class="vl-impact-empty" style="--col:${col};--row:2;">${dict['vl-impact-empty']}</p>`;
  return html;
}

function renderImpact(data, lang) {
  const mount = document.getElementById('vl-impact-cols');
  if (!mount) return;
  const dict = I18N[lang] || I18N.fr;
  const projects = data.projects || {};
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const byProject = {};
  for (const e of entries) (byProject[e.project] || (byProject[e.project] = [])).push(e);
  for (const id of Object.keys(byProject)) byProject[id].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  mount.innerHTML = Object.keys(projects)
    .map((id, i) => impactColumnHtml(id, projects[id], byProject[id] || [], i + 1, lang, dict))
    .join('');
}

// Ré-affiche le contenu dynamique déjà chargé dans la langue active — appelée
// au premier rendu et à chaque changement de langue (voir initLangSwitch).
function renderDynamic() {
  if (veilleData) dumpAll(veilleData, currentLang);
  if (impactData) renderImpact(impactData, currentLang);
}

async function initVeille() {
  const status = document.getElementById('vl-status');
  try {
    const res = await fetch('js/veille-data.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    veilleData = await res.json();
    status.style.display = 'none';
    dumpAll(veilleData, currentLang);
  } catch (err) {
    const dict = I18N[currentLang] || I18N.fr;
    status.textContent = `${dict['vl-load-error-prefix']} ${err.message}`;
    console.error('Veille:', err);
  }
  // Section indépendante du flux : une panne ici ne doit jamais faire
  // disparaître les actualités déjà affichées au-dessus.
  try {
    const res = await fetch('js/veille-impact.json', { cache: 'no-cache' });
    if (res.ok) {
      impactData = await res.json();
      renderImpact(impactData, currentLang);
    }
  } catch (err) {
    console.error('Veille (impact):', err);
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
    currentLang = lang;
    renderDynamic();
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

// ------------------------------------------------------ Rail de navigation --
// Repris de initDotRailSpy (js/details.js) : l'indicateur suit la section visible.
// L'onglet « Top actus » couvre toute la piste de scrub (#vl-showcase) via
// data-sections, pas seulement le bloc épinglé qu'il vise en href.
(function initDotRailSpy() {
  const tabs = document.querySelectorAll('.dot-rail a[href^="#"]');
  const indicator = document.querySelector('.dot-rail-indicator');
  if (!tabs.length) return;

  const sectionToTab = new Map();
  tabs.forEach((tab) => {
    const ids = [tab.getAttribute('href').slice(1), ...(tab.dataset.sections ? tab.dataset.sections.split(/\s+/) : [])];
    ids.forEach((id) => {
      const section = document.getElementById(id);
      if (section) sectionToTab.set(section, tab);
    });
  });
  if (!sectionToTab.size) return;

  const INDICATOR_TRAVEL_MS = 450;
  let activateTimer = null;

  function moveIndicatorTo(tab) {
    if (!indicator) return;
    indicator.style.top = `${tab.offsetTop + tab.offsetHeight / 2}px`;
  }

  function activate(tab) {
    clearTimeout(activateTimer);
    tabs.forEach((t) => t.classList.remove('is-active'));
    moveIndicatorTo(tab);
    activateTimer = setTimeout(() => tab.classList.add('is-active'), INDICATOR_TRAVEL_MS);
  }

  const observer = new IntersectionObserver((entries) => {
    // Ignoré tout en bas de page : #contact peut être plus courte que la fenêtre
    // restante et ne jamais traverser la bande -40%/-55%, cf. checkBottom.
    if (isAtBottom()) return;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const tab = sectionToTab.get(entry.target);
      if (tab) activate(tab);
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sectionToTab.forEach((tab, section) => observer.observe(section));
  moveIndicatorTo(tabs[0]);

  function isAtBottom() {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  }
  function checkBottom() {
    if (!isAtBottom()) return;
    const lastTab = tabs[tabs.length - 1];
    if (lastTab && !lastTab.classList.contains('is-active')) activate(lastTab);
  }
  window.addEventListener('scroll', checkBottom, { passive: true });
  window.addEventListener('resize', checkBottom);
  checkBottom();
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

// ------------------------------------------------------------------- Contact --
// Année courante dans le copyright du pied de page (section contact, dupliquée de l'accueil).
(function initFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
})();

// Avatar de #contact qui grandit progressivement au scroll — repris tel quel de
// initContactAvatarGrow (js/details.js) : sans #about pour porter le contre-lift, la
// progression suit simplement la distance restante jusqu'au vrai bas du document, si
// bien que l'avatar finit sa croissance (et révèle le bras posé sur le pli) pile quand
// on touche le bas de la page.
(function initContactAvatarGrow() {
  const contact = document.getElementById('contact');
  if (!contact) return;
  const avatarEls = contact.querySelectorAll('.contact-avatar');
  const armEl = contact.querySelector('.contact-avatar-arm');
  // le texte et le bouton du pied de page n'ont de sens que tant que le bras de
  // l'avatar est visible et semble les désigner : ils se cachent avec le bras.
  const footEl = document.querySelector('.dp-foot');
  if (!avatarEls.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    avatarEls.forEach((el) => el.style.setProperty('--avatar-scale', '1'));
    if (armEl) armEl.style.setProperty('--avatar-arm-opacity', '1');
    if (footEl) footEl.classList.remove('dp-foot-arm-hidden');
    return;
  }

  const AVATAR_MIN_SCALE = 0.15;
  const ARM_REVEAL_START = 0.75;
  const EASE = 0.35;

  let currentProgress = 0;
  let rafId = null;

  function targetProgress() {
    const doc = document.documentElement;
    const maxScroll = Math.max(doc.scrollHeight - window.innerHeight, 1);
    const range = Math.max(300, window.innerHeight * 0.9);
    const start = maxScroll - range;
    return Math.min(Math.max((window.scrollY - start) / range, 0), 1);
  }

  function apply() {
    const scale = AVATAR_MIN_SCALE + currentProgress * (1 - AVATAR_MIN_SCALE);
    avatarEls.forEach((el) => el.style.setProperty('--avatar-scale', scale.toFixed(3)));
    const armVisible = currentProgress >= ARM_REVEAL_START;
    if (armEl) armEl.style.setProperty('--avatar-arm-opacity', armVisible ? 1 : 0);
    if (footEl) footEl.classList.toggle('dp-foot-arm-hidden', !armVisible);
    // la teinte claire/foncée de la nav et du bouton "remonter" dépend de la position
    // de #contact, qui continue de bouger quelques frames après l'arrêt du scroll.
    window.dispatchEvent(new Event('parallax-tick'));
  }

  function tick() {
    const target = targetProgress();
    currentProgress += (target - currentProgress) * EASE;
    if (Math.abs(target - currentProgress) < 0.001) currentProgress = target;
    apply();
    if (currentProgress !== target) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  function onScroll() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  apply();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
})();

// Nav de pages et bouton "remonter" passent en blanc au-dessus du bleu de #contact
// (même principe que initOnDarkNav dans js/details.js, réduit à la seule section
// contact : c'est le seul aplat foncé de cette page).
(function initOnDarkOverContact() {
  const contact = document.getElementById('contact');
  if (!contact) return;
  const backToTop = document.querySelector('.back-to-top');
  const pageTag = document.querySelector('.page-tag');
  const updated = document.querySelector('.vl-updated');
  const railLinks = document.querySelectorAll('.dot-rail a');
  const indicator = document.querySelector('.dot-rail-indicator');

  // --contact-slope est une clamp() : parseFloat sur la custom property échouerait.
  // On la fait résoudre par le moteur de layout via une sonde hors-écran.
  function resolveCSSLength(value) {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute; visibility:hidden; pointer-events:none; height:${value};`;
    document.body.appendChild(probe);
    const px = probe.getBoundingClientRect().height;
    probe.remove();
    return px;
  }

  let slope = resolveCSSLength('var(--contact-slope)');

  // side: 'left' pour la nav de pages, collée au bord gauche, où le pli diagonal
  // descend le plus bas (cf. clip-path de .contact-fill) ; 'right' pour le reste.
  function overDark(y, side) {
    const r = contact.getBoundingClientRect();
    if (side === 'left') return y > r.top + slope && y < r.bottom;
    return y > r.top && y < r.bottom;
  }

  function toggle(el, side) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.classList.toggle('is-on-dark', overDark(r.top + r.height / 2, side));
  }

  function update() {
    railLinks.forEach((el) => toggle(el, 'right'));
    toggle(indicator, 'right');
    toggle(backToTop, 'right');
    toggle(pageTag, 'left');
    toggle(updated, 'left');
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', () => { slope = resolveCSSLength('var(--contact-slope)'); update(); });
  window.addEventListener('parallax-tick', update);
})();

initVeille();
