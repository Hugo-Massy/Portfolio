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

// Rend n'importe quelle valeur de champ en texte lisible.
function fmtValue(key, value) {
  if (value === null || value === undefined) return '<em>null</em>';
  if (Array.isArray(value)) return value.length ? value.map(escapeHtml).join(', ') : '<em>(vide)</em>';
  if (typeof value === 'object') return escapeHtml(JSON.stringify(value));
  if (key === 'link') {
    const u = escapeHtml(value);
    return `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`;
  }
  return escapeHtml(value);
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

// Rendu brut d'un élément. `withImage` (top 3 uniquement) ajoute une vignette :
// l'<img> est posée directement dans le DOM (chargement immédiat garanti), le
// spinner restant visible derrière tant qu'elle n'est pas peinte (voir dumpAll).
function itemHtml(it, label, withImage) {
  const rows = Object.keys(it).map((k) =>
    `<dt>${escapeHtml(k)}</dt><dd>${fmtValue(k, it[k])}</dd>`).join('');
  const img = withImage && it.image
    ? `<figure class="vl-img"><img src="${escapeHtml(it.image)}" alt="" decoding="async"><span class="vl-img-spinner" aria-hidden="true"></span></figure>`
    : '';
  return `<div class="vl-item">${img}<h3>${escapeHtml(label)} — ${escapeHtml(it.title || '')}</h3><dl>${rows}</dl></div>`;
}

function dumpAll(data) {
  const meta = document.getElementById('vl-meta');
  const srcList = (data.sources || []).map((s) => `${s.name}/${s.kind}`).join(', ');
  meta.textContent = `généré le ${data.generatedAt} · ${data.count} éléments · sources : ${srcList}`;

  const items = data.items || [];

  // Les 3 news les plus importantes — parmi les seuls items pourvus d'une image
  // (le build ne renseigne `image` que sur les items mis en avant). Un item sans
  // image (typiquement CERT-FR) reste dans le flux complet mais pas dans le top.
  const top = document.getElementById('vl-top');
  const top3 = items.filter((it) => it.image).sort((a, b) => importance(b) - importance(a)).slice(0, 3);
  top.innerHTML = `<h2 class="vl-top-h">Les 3 news les plus importantes</h2>`
    + top3.map((it, i) => itemHtml(it, `#${i + 1}`, true)).join('');

  // Câblage des vignettes : on masque le spinner dès que l'image est peinte.
  // img.complete couvre le cas où l'image (en cache) charge avant l'écoute.
  top.querySelectorAll('.vl-img img').forEach((img) => {
    const fig = img.closest('.vl-img');
    const done = () => fig.classList.add('is-loaded');
    if (img.complete && img.naturalWidth > 0) done();
    else {
      img.addEventListener('load', done);
      img.addEventListener('error', () => fig.classList.add('is-error'));
    }
  });

  // Affichage brut complet de tout le flux.
  const grid = document.getElementById('vl-grid');
  grid.innerHTML = `<h2 class="vl-all-h">Tout le flux (${items.length})</h2>`
    + items.map((it, i) => itemHtml(it, `#${i + 1}`)).join('');
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
