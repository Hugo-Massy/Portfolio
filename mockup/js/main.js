// Langue actuellement affichée — lue par TERM_COMMANDS pour produire ses sorties dans
// la bonne langue, et mise à jour par initLangSwitch (voir applyTranslations).
let CURRENT_LANG = 'fr';

// Parcourt le DOM et remplace le contenu de chaque élément [data-i18n]/[data-i18n-attr]
// par la traduction correspondante, puis prévient le reste de l'appli (hero cycle,
// contenu par défaut du terminal...) via l'évènement "langchange".
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
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

// Le HTML des sections est directement présent dans index.html (visible sans JS,
// indexable sans exécution JS) ; cette fonction se contente d'attacher les comportements.
function initSite() {
  initRevealObserver();
  initXpBentoWave();
  initSkillFloaterObserver();
  initTerminal();
  initBackgroundGrid();
  initTabSpy();
  initRailOnDark();
  initBackToTop();
  initHeroCycle();
  initHeroTermGrow();
  initLangSwitch();
  initIdBadgeFlip();
  initAboutParallax();
  initScrollDownButton();
  initContactCta();
  initExperienceCta();
  initAvailability();
  initFooterYear();
  initClickableCards();
  initRefsCarousel();
}

// Carrousel des références : la citation active occupe le centre, ses voisines
// dépassent aux extrémités (atténuées) et servent de commandes « précédent/suivant ».
// Navigation par clic sur une carte latérale, flèches, points ou glisser.
function initRefsCarousel() {
  const carousel = document.querySelector('.refs-carousel');
  if (!carousel) return;
  const cards = Array.from(carousel.querySelectorAll('.ref-card'));
  const dotsWrap = carousel.querySelector('.refs-dots');
  if (cards.length < 2 || !dotsWrap) return;

  const n = cards.length;
  let index = 0;

  // défilement automatique des citations, désactivé dès qu'une navigation manuelle survient
  const AUTOPLAY_DELAY = 6000;
  let autoplayTimer = null;
  function stopAutoplay() {
    if (autoplayTimer === null) return;
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = setInterval(() => go(index + 1), AUTOPLAY_DELAY);
  }

  // un point par citation
  const dots = cards.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'refs-dot';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `Référence ${i + 1} sur ${n}`);
    dot.addEventListener('click', () => { stopAutoplay(); go(i); });
    dotsWrap.appendChild(dot);
    return dot;
  });

  function render() {
    const prev = (index - 1 + n) % n;
    const next = (index + 1) % n;
    cards.forEach((card, i) => {
      card.classList.remove('is-active', 'is-prev', 'is-next');
      if (i === index) card.classList.add('is-active');
      else if (i === prev) card.classList.add('is-prev');
      else if (i === next) card.classList.add('is-next');
      card.setAttribute('aria-hidden', i === index ? 'false' : 'true');
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-on', i === index);
      dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
  }

  function go(i) { index = (i % n + n) % n; render(); }
  const goPrev = () => go(index - 1);
  const goNext = () => go(index + 1);

  // clic sur une carte latérale → elle passe au centre
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('is-prev')) { stopAutoplay(); goPrev(); }
      else if (card.classList.contains('is-next')) { stopAutoplay(); goNext(); }
    });
  });

  // flèches clavier quand le carrousel a le focus
  carousel.setAttribute('tabindex', '0');
  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); stopAutoplay(); goPrev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stopAutoplay(); goNext(); }
  });

  // glisser tactile / souris sur la scène
  const stage = carousel.querySelector('.refs-stage');
  let startX = null;
  if (stage) {
    stage.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    stage.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 45) { stopAutoplay(); dx < 0 ? goNext() : goPrev(); }
      startX = null;
    });
    stage.addEventListener('pointercancel', () => { startX = null; });
  }

  render();
  startAutoplay();
}

// Rend les piliers (.skill-item) et les cartes du bento (.xp-tile) cliquables.
// La destination se lit dans data-href ; si l'attribut est vide, le clic ne redirige pas.
function initClickableCards() {
  const cards = document.querySelectorAll('.skill-item[role="link"], .xp-tile[role="link"]');
  cards.forEach((card) => {
    const go = () => {
      const href = card.dataset.href;
      if (href) window.location.href = href;
    };
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
  });
}

// Le CTA "Voir mon expérience" du hero mène en haut de #xp. Comme #xp est remonté par le
// parallax de #about (translateY, cf. initAboutParallax), un simple saut d'ancre vise sa
// position de MISE EN PAGE et atterrit trop bas (la section, décalée vers le haut à l'écran,
// dépasse le haut du viewport). On recale donc frame par frame sur sa position AFFICHÉE
// (getBoundingClientRect().top, qui inclut le transform), comme la flèche du hero — le lift
// bouge encore pendant le scroll, la boucle converge naturellement.
function initExperienceCta() {
  const btn = document.querySelector('.hero-cta a[href="#xp"]');
  const xp = document.getElementById('xp');
  if (!btn || !xp) return;

  let rafId = null;
  function cancel() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  ['wheel', 'touchstart', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, cancel, { passive: true });
  });

  const LANDING_OFFSET = 24; // px d'air laissés au-dessus du titre une fois arrivé

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    cancel();
    function step() {
      const remaining = xp.getBoundingClientRect().top - LANDING_OFFSET;
      if (Math.abs(remaining) < 1) { rafId = null; return; }
      // behavior:'instant' obligatoire : html{scroll-behavior:smooth} rejouerait sinon
      // une animation CSS à chaque frame et bloquerait le défilement.
      window.scrollTo({ top: window.scrollY + remaining * 0.18, left: 0, behavior: 'instant' });
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  });
}

// Le CTA "Me contacter" du hero mène tout en bas de la page (jusqu'au footer) plutôt
// qu'au simple haut de la section #contact. On ne peut pas utiliser un scrollTo lissé
// natif : en traversant la zone figée de #xp, initXpBentoWave.release() déclenche un
// scrollBy instantané et repasse sa piste en height:auto (la page raccourcit d'un coup),
// ce qui annule l'animation native — le scroll s'arrêterait pile en sortant du figement.
// On pilote donc le défilement frame par frame (comme la flèche du hero) en recalculant
// le bas réel du document à chaque frame : la boucle survit ainsi au recalage de release()
// et à la hauteur qui change, et converge quand même jusqu'en bas.
function initContactCta() {
  const btn = document.querySelector('.hero-cta a[href="#contact"]');
  if (!btn) return;

  let rafId = null;
  function cancel() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  // Si l'utilisateur reprend la main pendant l'animation, on arrête le recalage auto.
  ['wheel', 'touchstart', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, cancel, { passive: true });
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    cancel();
    function step() {
      const target = document.documentElement.scrollHeight - window.innerHeight;
      const remaining = target - window.scrollY;
      if (remaining < 1) { rafId = null; return; }
      // behavior:'instant' obligatoire : html{scroll-behavior:smooth} rejouerait sinon
      // une animation CSS à chaque frame et bloquerait le défilement.
      window.scrollTo({ top: window.scrollY + remaining * 0.18, left: 0, behavior: 'instant' });
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  });
}

// Année courante dans le copyright du pied de page.
function initFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

// ============================================================
// DISPONIBILITÉ — calendrier mensuel (fenêtre sombre façon terminal) + agenda
// (section #availability). Tout le contenu "métier" vit dans AVAILABILITY_CONFIG :
// c'est le seul bloc à éditer. Le calendrier est généré en JS pour rester localisé
// (mois/jours via Intl) et pouvoir colorer chaque semaine selon le rythme
// d'alternance sans HTML à la main.
// ============================================================

const AVAILABILITY_CONFIG = {
  // Semaine de référence du rythme : un LUNDI de semaine "entreprise".
  // (2025-09-01 est un lundi.) Tout le reste s'en déduit par cycles.
  rhythmAnchor: '2025-09-01',
  // Un élément = une semaine du cycle, répété à l'infini : 'ent' (entreprise) ou 'ecole'.
  // Aligné sur la section "à propos" : 2 semaines entreprise / 1 semaine école.
  rhythm: ['ent', 'ent', 'ecole'],
  // Échéances ponctuelles. type: 'event' (échéance clé) | 'avail' (jalon de dispo) | 'ecole'.
  events: [
    { date: '2026-07-08', type: 'event', label: { fr: 'Soutenance — Mastère cybersécurité', en: 'Defense — Cybersecurity Master', es: 'Defensa — Máster ciberseguridad' } },
    { date: '2026-07-17', type: 'ecole', label: { fr: 'Fin des cours', en: 'End of classes', es: 'Fin de las clases' } },
    { date: '2026-08-31', type: 'event', label: { fr: 'Fin d\'alternance', en: 'End of apprenticeship', es: 'Fin de la alternancia' } },
    { date: '2026-09-01', type: 'avail', label: { fr: 'Disponible temps plein — CDI / CDD', en: 'Available full-time — permanent / fixed-term', es: 'Disponible a tiempo completo' } },
  ],
  // Plages d'indisponibilité. Les jours compris entre `from` et `to` (inclus) sont marqués en rouge.
  unavailableRanges: [
    { from: '2026-07-04', to: '2026-07-05', label: { fr: 'Indisponible ce week-end', en: 'Unavailable this weekend', es: 'No disponible este fin de semana' } },
    { from: '2026-07-13', to: '2026-07-31', label: { fr: 'Indisponible', en: 'Unavailable', es: 'No disponible' } },
  ],
};

// Icône de la piste hebdomadaire (voir renderGrid) — même style que les icônes
// utilisées ailleurs sur le site (trait, currentColor, coins arrondis). Seule la
// semaine "école" (l'exception au rythme habituel) porte une icône ; les semaines
// "entreprise" restent sans repère.
const CAL_WEEK_ICONS = {
  ecole: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>',
};

function initAvailability() {
  const grid = document.getElementById('cal-grid');
  const railEl = document.getElementById('cal-rail');
  const weekdaysEl = document.getElementById('cal-weekdays');
  const titleEl = document.getElementById('cal-title');
  const prevBtn = document.getElementById('cal-prev');
  const nextBtn = document.getElementById('cal-next');
  const todayBtn = document.getElementById('cal-today');
  const mailLink = document.getElementById('avail-contact-mail');
  const ctaLabelEl = document.getElementById('avail-contact-cta-label');
  if (!grid || !titleEl) return;

  const cfg = AVAILABILITY_CONFIG;
  const MS_DAY = 86400000;

  function keyOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parse(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function midnight(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const today = midnight(new Date());
  const anchor = parse(cfg.rhythmAnchor); // un lundi

  const eventsByDate = new Map();
  cfg.events.forEach((ev) => eventsByDate.set(ev.date, ev));

  function unavailRangeOf(d) {
    const key = keyOf(d);
    return (cfg.unavailableRanges || []).find((r) => key >= r.from && key <= r.to) || null;
  }

  // Type de rythme d'un jour donné : on ramène au lundi de sa semaine, on compte
  // les semaines écoulées depuis l'ancre, et on lit le cycle (modulo). Renvoie null
  // le week-end (pas de rythme d'alternance à afficher).
  function rhythmType(d) {
    const day = d.getDay(); // 0=dim … 6=sam
    if (day === 0 || day === 6) return null;
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const weeks = Math.floor((monday - anchor) / (MS_DAY * 7));
    const idx = ((weeks % cfg.rhythm.length) + cfg.rhythm.length) % cfg.rhythm.length;
    return cfg.rhythm[idx];
  }

  function locale() {
    return { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' }[CURRENT_LANG] || 'fr-FR';
  }
  function labelOf(ev) {
    return ev.label[CURRENT_LANG] || ev.label.fr;
  }

  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  // Date sélectionnée sur le calendrier (clé "YYYY-MM-DD"), null si aucune : pilote
  // le panneau de droite (avail-detail) et le mailto pré-rempli.
  let selectedKey = null;

  // Fin d'alternance : au-delà, plus de rythme entreprise/école, disponibilité pleine.
  const fullAvailFrom = cfg.events.find((ev) => ev.type === 'avail');
  const fullAvailDate = fullAvailFrom ? parse(fullAvailFrom.date) : null;

  // Détermine le statut d'un jour (passé, échéance, dispo pleine, week-end, ou
  // "occupé" pendant le rythme d'alternance) et le créneau à proposer en conséquence.
  function dayInfo(d) {
    const isPast = d < today;
    const ev = eventsByDate.get(keyOf(d));
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isFullAvail = fullAvailDate && d >= fullAvailDate;
    const unavail = unavailRangeOf(d);

    if (isPast) return { status: 'past', event: ev };
    if (ev && ev.type === 'event') return { status: 'event', event: ev };
    if (unavail) return { status: 'unavailable', event: ev, unavailLabel: unavail.label };
    if (isFullAvail) return { status: 'full', event: ev, slotKey: 'day' };
    if (isWeekend) return { status: 'weekend', event: ev, slotKey: 'day' };
    return { status: 'busy', event: ev, slotKey: 'busy' };
  }

  function renderWeekdays() {
    const ref = new Date(2024, 0, 1); // lundi 1er janv. 2024
    const fmt = new Intl.DateTimeFormat(locale(), { weekday: 'short' });
    let html = '';
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(ref);
      d.setDate(ref.getDate() + i);
      html += `<span>${fmt.format(d).replace('.', '')}</span>`;
    }
    weekdaysEl.innerHTML = html;
  }

  function renderTitle() {
    const fmt = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' });
    const label = fmt.format(view);
    titleEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }

  function renderGrid() {
    const first = new Date(view);
    const offset = (first.getDay() + 6) % 7; // nb de jours depuis lundi
    const start = new Date(first);
    start.setDate(first.getDate() - offset);

    // Nombre de semaines réellement nécessaires pour ce mois (4, 5 ou 6) : évite
    // une rangée de fin entièrement vide quand le mois tient sur moins de 6 semaines.
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const weeksNeeded = Math.ceil((offset + daysInMonth) / 7);

    // Piste des pastilles : positionnée en absolu à côté de la grille (voir CSS
    // .cal-rail), avec autant de rangées que de semaines affichées, pour rester
    // alignée avec chaque ligne sans faire partie de la grille centrée elle-même.
    if (railEl) railEl.style.gridTemplateRows = `repeat(${weeksNeeded}, 1fr)`;
    let railHtml = '';

    let html = '';
    for (let w = 0; w < weeksNeeded; w += 1) {
      // Rythme de la semaine : lu sur son lundi, qu'il soit dans le mois affiché ou non
      // (une pastille reste affichée même si le lundi appartient au mois précédent/suivant).
      const monday = new Date(start);
      monday.setDate(start.getDate() + w * 7);
      const weekType = rhythmType(monday);
      railHtml += CAL_WEEK_ICONS[weekType]
        ? `<span class="cal-week-icon cal-week-icon--${weekType}" aria-hidden="true">${CAL_WEEK_ICONS[weekType]}</span>`
        : '<span class="cal-week-icon"></span>';

      for (let i = 0; i < 7; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + w * 7 + i);
        const inMonth = d.getMonth() === view.getMonth();

        // Jours hors mois : case vide, juste pour garder l'alignement des colonnes.
        if (!inMonth) {
          html += '<div class="cal-day is-out"></div>';
          continue;
        }

        const isToday = d.getTime() === today.getTime();
        const isPast = d < today;
        const ev = eventsByDate.get(keyOf(d));
        const unavail = unavailRangeOf(d);

        const classes = ['cal-day'];
        if (isToday) classes.push('is-today');
        if (isPast) classes.push('is-past');
        if (ev) classes.push('has-event', `event-${ev.type}`);
        else if (unavail) classes.push('has-event', 'event-unavailable');
        if (keyOf(d) === selectedKey) classes.push('is-selected');

        const unavailTitle = unavail ? (unavail.label[CURRENT_LANG] || unavail.label.fr) : '';
        const title = ev ? ` title="${labelOf(ev).replace(/"/g, '&quot;')}"` : (unavail ? ` title="${unavailTitle.replace(/"/g, '&quot;')}"` : '');
        html += `<div class="${classes.join(' ')}" data-date="${keyOf(d)}" tabindex="0" role="button"`
          + ` aria-pressed="${keyOf(d) === selectedKey}"${title}>`
          + `<span class="cal-num">${d.getDate()}</span>`
          + (ev || unavail ? '<span class="cal-dot" aria-hidden="true"></span>' : '')
          + '</div>';
      }
    }
    grid.innerHTML = html;
    if (railEl) railEl.innerHTML = railHtml;
  }

  // État courant du panneau, relu par updateMailHref() quand l'utilisateur change
  // l'heure choisie dans le <select> sans re-déclencher tout le rendu.
  function updateMailHref() {
    const dict = I18N[CURRENT_LANG] || I18N.fr;
    const subject = dict['avail-contact-mail-subject'] || '';
    const body = dict['avail-contact-mail-body'] || '';
    mailLink.href = `mailto:${AVAILABILITY_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function renderContactPanel() {
    if (!mailLink) return;
    const dict = I18N[CURRENT_LANG] || I18N.fr;

    if (ctaLabelEl) ctaLabelEl.textContent = dict['avail-contact-cta'] || '';
    updateMailHref();
  }

  function selectDate(d) {
    const key = keyOf(d);
    selectedKey = selectedKey === key ? null : key;
    renderGrid();
    renderContactPanel();
  }


  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-day');
    if (!cell || !cell.dataset.date) return;
    selectDate(parse(cell.dataset.date));
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cell = e.target.closest('.cal-day');
    if (!cell || !cell.dataset.date) return;
    e.preventDefault();
    selectDate(parse(cell.dataset.date));
  });

  function renderAll() {
    renderWeekdays();
    renderTitle();
    renderGrid();
    renderContactPanel();
  }

  prevBtn && prevBtn.addEventListener('click', () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    renderTitle();
    renderGrid();
  });
  nextBtn && nextBtn.addEventListener('click', () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    renderTitle();
    renderGrid();
  });
  todayBtn && todayBtn.addEventListener('click', () => {
    view = new Date(today.getFullYear(), today.getMonth(), 1);
    renderTitle();
    renderGrid();
  });

  document.addEventListener('langchange', renderAll);

  renderAll();
}

// Email de contact utilisé par le mailto pré-rempli du panneau de droite (voir
// renderContactPanel dans initAvailability) — un vrai formulaire nécessiterait un backend.
const AVAILABILITY_CONTACT_EMAIL = 'hugo@menu-family.fr';

// Effet de parallax marqué : toute la section "à propos" (fond, vague, contenu) part de
// sa position normale (transform nul) puis remonte de plus en plus au fur et à mesure
// qu'elle traverse le viewport, en plus du scroll classique — purement visuel (transform),
// ne touche pas au flow du document. La position "naturelle" (offsetTop) sert de référence
// plutôt que getBoundingClientRect, qui inclurait déjà le transform qu'on est en train d'appliquer.
function initAboutParallax() {
  const about = document.getElementById('about');
  if (!about) return;
  // Les sections situées sous "à propos" suivent le même décalage, sinon le lift
  // creuserait un trou entre #about (qui remonte) et la section suivante (immobile).
  const followers = [];
  for (let el = about.nextElementSibling; el; el = el.nextElementSibling) {
    if (el.tagName === 'SECTION' || el.querySelector('section')) followers.push(el);
  }
  // La dernière section (#contact) n'a rien après elle : si elle remontait comme les
  // autres, ce lift resterait un trou vide en bas de page (le flow du document, lui,
  // ne bouge pas). On lui applique donc un contre-lift qui grandit sur les derniers
  // MAX_LIFT px de scroll, pour qu'elle revienne pile à sa position naturelle (transform
  // nul) au moment où on atteint le bas réel du document — plus de trou à combler.
  const last = followers[followers.length - 1];
  // L'avatar de #contact grandit en même temps que le contre-lift se résorbe : minuscule
  // au début (avatarProgress 0), taille normale une fois le lift revenu à sa position
  // naturelle (avatarProgress 1) — même timing que counterProgress, donc même sensation
  // que le reste de la section "arrive" avec le scroll.
  const avatarEls = last ? last.querySelectorAll('.contact-avatar') : [];
  const armEl = last ? last.querySelector('.contact-avatar-arm') : null;
  const AVATAR_MIN_SCALE = 0.15;
  // Le bras (crop calé sur la diagonale fixe) ne doit apparaître que sur la toute fin de
  // la croissance, sinon sa découpe se voit tant que l'avatar est encore petit.
  const ARM_REVEAL_START = 0.75;
  // Source unique partagée avec le CSS (--about-lift) : le figement du bento #xp
  // compense ce lift pour rester centré (cf. .xp-bento-stick top).
  const MAX_LIFT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--about-lift')) || 220; // px
  // Lissage du mouvement : au lieu de coller pile à la position de scroll, le lift
  // "rattrape" sa cible avec un peu d'inertie (lerp à chaque frame) — l'effet paraît
  // fluide au lieu de suivre au pixel près, saccadé, le défilement de la souris/molette.
  const EASE = 0.35;
  let currentAboutLift = 0;
  let currentLastLift = 0;
  let currentAvatarProgress = 0;
  let rafId = null;

  function naturalTop(el) {
    let top = 0;
    let node = el;
    while (node) {
      top += node.offsetTop;
      node = node.offsetParent;
    }
    return top;
  }

  function targets() {
    const viewportTop = naturalTop(about) - window.scrollY;
    const progress = Math.min(Math.max(1 - viewportTop / window.innerHeight, 0), 1);
    const aboutLift = -progress * MAX_LIFT;
    let lastLift = aboutLift;
    let avatarProgress = 1;
    if (last) {
      // Le contre-lift doit annuler pile MAX_LIFT au moment où on touche le bas réel du
      // document (sinon le trou revient), mais peut commencer à monter bien avant :
      // COUNTER_RANGE contrôle sur quelle distance de scroll ça démarre, indépendamment
      // du montant à annuler.
      const COUNTER_RANGE = Math.max(MAX_LIFT, window.innerHeight * 0.9);
      const revealStart = naturalTop(last) + last.offsetHeight - COUNTER_RANGE;
      const counterProgress = Math.min(Math.max((window.scrollY + window.innerHeight - revealStart) / COUNTER_RANGE, 0), 1);
      lastLift = aboutLift + counterProgress * MAX_LIFT;
      avatarProgress = counterProgress;
    }
    return { aboutLift, lastLift, avatarProgress };
  }

  function apply() {
    const transform = `translateY(${currentAboutLift}px)`;
    about.style.transform = transform;
    followers.forEach((el) => {
      if (el === last) return;
      el.style.transform = transform;
    });
    if (last) last.style.transform = `translateY(${currentLastLift}px)`;
    const avatarScale = AVATAR_MIN_SCALE + currentAvatarProgress * (1 - AVATAR_MIN_SCALE);
    avatarEls.forEach((el) => el.style.setProperty('--avatar-scale', avatarScale.toFixed(3)));
    if (armEl) {
      const armOpacity = currentAvatarProgress >= ARM_REVEAL_START ? 1 : 0;
      armEl.style.setProperty('--avatar-arm-opacity', armOpacity);
      // posée aussi sur #contact (ancêtre commun) pour que .details-link puisse
      // s'aligner sur la même bascule sans dépendre de l'observer .reveal générique
      if (last) last.style.setProperty('--avatar-arm-opacity', armOpacity);
    }
    // #contact continue de bouger (lissage EASE) pendant plusieurs frames après la fin
    // du scroll : le bouton "remonter" et le rail, qui ne se recalculent que sur l'event
    // scroll, resteraient sinon bloqués sur une couleur calculée à mi-course si on scrolle
    // vite jusqu'en bas (plus aucun scroll event pour les rafraîchir une fois arrêtés).
    window.dispatchEvent(new Event('parallax-tick'));
  }

  function loop() {
    const { aboutLift, lastLift, avatarProgress } = targets();
    currentAboutLift += (aboutLift - currentAboutLift) * EASE;
    currentLastLift += (lastLift - currentLastLift) * EASE;
    currentAvatarProgress += (avatarProgress - currentAvatarProgress) * EASE;
    apply();
    const settled = Math.abs(aboutLift - currentAboutLift) < 0.05
      && Math.abs(lastLift - currentLastLift) < 0.05
      && Math.abs(avatarProgress - currentAvatarProgress) < 0.001;
    if (settled) {
      currentAboutLift = aboutLift;
      currentLastLift = lastLift;
      currentAvatarProgress = avatarProgress;
      apply();
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function requestLoop() {
    if (rafId === null) rafId = requestAnimationFrame(loop);
  }

  window.addEventListener('scroll', requestLoop, { passive: true });
  window.addEventListener('resize', requestLoop);
  // Positionne tout correctement dès le chargement (ex: retour sur la page avec un
  // scroll déjà restauré par le navigateur), sans animation de rattrapage visible.
  const initial = targets();
  currentAboutLift = initial.aboutLift;
  currentLastLift = initial.lastLift;
  currentAvatarProgress = initial.avatarProgress;
  apply();
}

// La flèche du hero ne peut pas se contenter d'un lien #about classique : #about remonte
// au scroll (voir initAboutParallax), donc sa position réelle à l'écran change pendant
// le défilement lui-même. On recale donc le scroll image par image sur la position
// affichée (rect.top, qui inclut déjà le transform courant) jusqu'à ce qu'elle soit
// alignée en haut du viewport — ça converge naturellement avec le lift.
function initScrollDownButton() {
  const btn = document.querySelector('.scroll-down');
  const about = document.getElementById('about');
  if (!btn || !about) return;

  let rafId = null;
  function cancel() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  // Si l'utilisateur reprend la main pendant l'animation (molette, tactile, clavier),
  // on arrête tout de suite le recalage automatique pour ne pas lutter contre son geste.
  ['wheel', 'touchstart', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, cancel, { passive: true });
  });

  const LANDING_OFFSET = 80; // px restants visibles du hero une fois arrivé

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    cancel();
    function step() {
      const remaining = about.getBoundingClientRect().top - LANDING_OFFSET;
      if (Math.abs(remaining) < 1) { rafId = null; return; }
      // On avance d'une fraction de la distance restante à chaque frame (vitesse de
      // scroll normale, avec décélération en fin de course), tout en se recalant en
      // continu sur la position affichée de #about. behavior:'instant' est obligatoire
      // ici : html{scroll-behavior:smooth} ferait sinon répéter/écraser une animation
      // CSS à chaque frame, ce qui rend le défilement très lent voire bloqué.
      window.scrollTo({ top: window.scrollY + remaining * 0.18, left: 0, behavior: 'instant' });
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);
  });
}

// Carte d'identité façon badge d'accès : cliquer n'importe où sur la carte (recto ou
// verso) bascule la classe is-flipped, qui pilote la rotation 3D en CSS — sauf sur les
// liens internes (GitHub, LinkedIn, CV, mailto), qui doivent garder leur comportement normal.
// is-flipping ne reste posée que le temps de la rotation, pour jouer l'ombre qui s'amplifie
// au milieu du mouvement (voir @keyframes about-card-flip-shadow) sans rester active après.
function initIdBadgeFlip() {
  const card = document.querySelector('.about-card');
  if (!card) return;
  const FLIP_DURATION = 700;
  let flipTimer = null;

  function flip() {
    card.classList.toggle('is-flipped');
    card.classList.remove('is-flipping');
    void card.offsetWidth; // force le redémarrage de l'animation si on enchaîne deux flips rapprochés
    card.classList.add('is-flipping');
    clearTimeout(flipTimer);
    flipTimer = setTimeout(() => card.classList.remove('is-flipping'), FLIP_DURATION);
  }

  // Retournement automatique : une seule fois, pour signaler que la carte est
  // cliquable. Dès qu'elle est visible à l'écran 5s sans interaction, elle se
  // retourne (recto → verso) puis revient vite (verso → recto), et ne se
  // déclenche plus jamais ensuite — ni en repassant dans le viewport, ni au clic.
  const AUTO_FLIP_DELAY = 5000;
  const AUTO_FLIP_RETURN_DELAY = 1200;
  let autoFlipTimer = null;
  let autoFlipActive = true;
  let autoFlipDone = false;

  function scheduleAutoFlip() {
    if (!autoFlipActive || autoFlipDone) return;
    clearTimeout(autoFlipTimer);
    autoFlipTimer = setTimeout(() => {
      if (!autoFlipActive || autoFlipDone) return;
      flip();
      autoFlipTimer = setTimeout(() => {
        if (!autoFlipActive) return;
        flip();
        autoFlipDone = true;
      }, AUTO_FLIP_RETURN_DELAY);
    }, AUTO_FLIP_DELAY);
  }

  function stopAutoFlip() {
    autoFlipActive = false;
    clearTimeout(autoFlipTimer);
  }

  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) scheduleAutoFlip();
      else clearTimeout(autoFlipTimer);
    });
  }, { threshold: .6 });
  visibilityObserver.observe(card);

  card.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    stopAutoFlip();
    flip();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    stopAutoFlip();
    flip();
  });
}

// Bascule FR/EN/ES du bouton drapeau en haut à droite — traduit tout le contenu
// statique du site (voir applyTranslations) ainsi que le terminal interactif.
// Toujours en français au chargement de la page.
function initLangSwitch() {
  const btn = document.querySelector('.lang-switch');
  if (!btn) return;

  const LANGS = ['fr', 'en', 'es'];
  const flags = {
    fr: btn.querySelector('.flag-fr'),
    en: btn.querySelector('.flag-en'),
    es: btn.querySelector('.flag-es'),
  };

  function apply(lang, { persist = true } = {}) {
    btn.dataset.lang = lang;
    LANGS.forEach((l) => { flags[l].classList.toggle('is-active', l === lang); });
    CURRENT_LANG = lang;
    applyTranslations(lang);
    if (persist) storeLang(lang);
  }

  apply(getStoredLang() || 'fr', { persist: false });

  function updateAtTop() {
    btn.classList.toggle('is-at-top', window.scrollY <= 10);
  }
  updateAtTop();
  window.addEventListener('scroll', updateAtTop, { passive: true });

  btn.addEventListener('click', () => {
    const next = LANGS[(LANGS.indexOf(btn.dataset.lang) + 1) % LANGS.length];
    apply(next);
  });
}

// Le terminal du hero garde une taille fixe (plus de scroll-jacking ni de plein écran) :
// le contenu par défaut et le menu des catégories sont affichés en permanence.
function initHeroTermGrow() {
  const card = document.getElementById('term-card');
  const scrollDownBtn = document.querySelector('.scroll-down');
  const categories = document.getElementById('term-categories');
  if (!card) return;

  if (categories) categories.removeAttribute('aria-hidden');

  // La flèche se cache dès qu'on quitte le haut de page, comme un indicateur de
  // scroll classique.
  if (scrollDownBtn) {
    window.addEventListener('scroll', () => {
      scrollDownBtn.classList.toggle('is-hidden', window.scrollY > 10);
    }, { passive: true });
  }

  // Rond rouge façon macOS : clear (délégué à window.HeroTerminal, posé par initTerminal).
  const dotClose = document.getElementById('term-dot-close');
  if (dotClose) {
    dotClose.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.HeroTerminal && window.HeroTerminal.clear) window.HeroTerminal.clear();
    });
  }

  // Menu des catégories : cliquable directement, et sélectionnable en tapant son
  // numéro (1-5) dans le champ de saisie du terminal — voir TERM_COMMANDS plus bas,
  // qui relaie l'appel via window.HeroCategories.select().
  function selectCategory(key) {
    if (!categories) return false;
    const item = categories.querySelector(`.term-cat-item[data-cat="${key}"]`);
    if (!item) return false;
    categories.querySelectorAll('.term-cat-item').forEach((el) => el.classList.remove('is-selected'));
    item.classList.add('is-selected');
    const href = item.getAttribute('href');
    if (href) window.location.hash = href;
    return true;
  }
  if (categories) {
    categories.addEventListener('click', (e) => {
      const item = e.target.closest('.term-cat-item');
      if (!item) return;
      e.preventDefault();
      selectCategory(item.dataset.cat);
    });
  }

  function normalizeCatText(s) {
    return s.trim().toLowerCase().replace(/\/+$/, '');
  }

  // Permet de taper le nom complet d'une entrée ("01_à-propos/", "_projets" ou
  // "projets") plutôt que son seul numéro — lu directement sur le DOM pour suivre
  // la langue affichée (voir TERM_COMMANDS plus bas, qui relaie via runCommand).
  function matchCategoryByText(raw) {
    if (!categories) return null;
    const needle = normalizeCatText(raw);
    if (!needle) return null;
    const items = categories.querySelectorAll('.term-cat-item');
    for (const item of items) {
      const numEl = item.querySelector('.term-cat-num');
      const slugEl = item.querySelector('[data-i18n^="term-slug-"]');
      const num = numEl ? numEl.textContent : '';
      const slug = slugEl ? slugEl.textContent : '';
      const candidates = [
        normalizeCatText(num + slug),
        normalizeCatText(slug),
        normalizeCatText(slug.replace(/^_/, '')),
      ];
      if (candidates.includes(needle)) return item.dataset.cat;
    }
    return null;
  }

  // Noms complets affichés ("01_à-propos/"...), pour les proposer aussi via Tab
  // dans le terminal (voir initTerminal plus bas).
  function listCategoryNames() {
    if (!categories) return [];
    return Array.from(categories.querySelectorAll('.term-cat-item')).map((item) => {
      const numEl = item.querySelector('.term-cat-num');
      const slugEl = item.querySelector('[data-i18n^="term-slug-"]');
      return `${numEl ? numEl.textContent : ''}${slugEl ? slugEl.textContent : ''}`.trim();
    });
  }

  window.HeroCategories = {
    select: selectCategory,
    matchByText: matchCategoryByText,
    list: listCategoryNames,
  };
}

// Fait défiler le mot-clé du titre du Hero, puis s'arrête définitivement sur "protège".
function initHeroCycle() {
  const el = document.getElementById('cycle-word');
  const suffix = document.getElementById('cycle-suffix');
  if (!el) return;

  const HOLD_MS = 2200;
  const SWAP_MS = 350;
  let i = 0;
  let isFinal = false;

  function phrases() {
    return HERO_PHRASES[CURRENT_LANG] || HERO_PHRASES.fr;
  }

  el.textContent = phrases()[0];

  // Si la langue change en cours de cycle, on retraduit juste le mot actuellement
  // affiché (à la même position dans la nouvelle liste) sans relancer le minuteur.
  document.addEventListener('langchange', () => {
    el.textContent = isFinal ? phrases()[phrases().length - 1] : phrases()[i];
  });

  const timer = setInterval(() => {
    i += 1;
    el.classList.add('is-swapping');
    setTimeout(() => {
      el.textContent = phrases()[i];
      el.classList.remove('is-swapping');
      if (i === phrases().length - 1) {
        clearInterval(timer);
        isFinal = true;
        el.classList.add('is-final');
        if (suffix) suffix.remove();
      }
    }, SWAP_MS);
  }, HOLD_MS);
}

// Cache le bouton de défilement dès qu'on clique dessus ou qu'on scrolle.

// Surligne le point du rail correspondant à la section actuellement visible, et fait
// voyager l'indicateur le long du rail pour animer le passage d'une section à l'autre.
function initTabSpy() {
  const rail = document.querySelector('.dot-rail');
  const tabs = document.querySelectorAll('.dot-rail a[href^="#"]');
  const indicator = document.querySelector('.dot-rail-indicator');
  if (!rail || !tabs.length) return;
  const sectionToTab = new Map();
  tabs.forEach((tab) => {
    const section = document.getElementById(tab.getAttribute('href').slice(1));
    if (section) sectionToTab.set(section, tab);
  });

  const INDICATOR_TRAVEL_MS = 450;
  let activateTimer = null;

  function moveIndicatorTo(tab) {
    if (!indicator) return;
    const y = tab.offsetTop + tab.offsetHeight / 2;
    indicator.style.top = `${y}px`;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const tab = sectionToTab.get(entry.target);
      if (!tab) return;
      // l'indicateur part tout de suite, mais le label n'apparaît qu'une fois qu'il est arrivé
      clearTimeout(activateTimer);
      tabs.forEach((t) => t.classList.remove('is-active'));
      moveIndicatorTo(tab);
      activateTimer = setTimeout(() => tab.classList.add('is-active'), INDICATOR_TRAVEL_MS);
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sectionToTab.forEach((tab, section) => observer.observe(section));
  moveIndicatorTo(tabs[0]);
}

// Résout une longueur CSS (clamp(), calc(), var()...) en px réels, en la posant sur une
// propriété de layout normale (height) d'une sonde hors-écran : contrairement à
// parseFloat(getComputedStyle(el).getPropertyValue('--xxx')), qui échoue silencieusement
// dès que la custom property contient autre chose qu'un nombre nu (ex: "clamp(120px,
// 14vw, 320px)"), le moteur de layout résout toujours une hauteur en un nombre de px.
function resolveCSSLength(value) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute; visibility:hidden; pointer-events:none; height:${value};`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
}

let waveH = resolveCSSLength('var(--wave-h)');
let contactSlope = resolveCSSLength('var(--contact-slope)');
window.addEventListener('resize', () => {
  waveH = resolveCSSLength('var(--wave-h)');
  contactSlope = resolveCSSLength('var(--contact-slope)');
});

// Vrai si le point d'ordonnée y tombe sur la vague bleue de .section-divider-bar plutôt
// que sur le fond clair — cf. son clip-path : polygon(0 13px, 100% 117px, 100% 100%,
// 0 calc(100% - var(--wave-h) * 0.4)). La pente est inversée entre les deux bords : au
// bord droit (x=100%, là où vivent le rail et le bouton), le bleu va de 117px sous le
// haut jusqu'au tout bas ; au bord gauche (x=0, là où vit page-tag), il va de 13px sous
// le haut jusqu'à "wave-h * 0.4" avant le bas.
function isOverAboutWave(about, y, side) {
  const rect = about.getBoundingClientRect();
  if (side === 'left') {
    const top = rect.top + 13;
    const bottom = rect.top + rect.height - waveH * 0.4;
    return y > top && y < bottom;
  }
  const top = rect.top + 117;
  const bottom = rect.top + rect.height;
  return y > top && y < bottom;
}

// Vrai si le point d'ordonnée y tombe sur le bloc bleu de #contact — cf. son clip-path :
// polygon(0 var(--contact-slope), 100% 0, 100% 100%, 0 100%). Au bord droit (x=100%, rail
// et bouton), la diagonale du haut touche 0 : le bleu couvre toute la hauteur. Au bord
// gauche (x=0, page-tag), le bleu ne commence qu'à "contact-slope" sous le haut.
function isOverContactBlue(contact, y, side) {
  const rect = contact.getBoundingClientRect();
  if (side === 'left') {
    return y > rect.top + contactSlope && y < rect.bottom;
  }
  return y > rect.top && y < rect.bottom;
}

// Regroupe les deux zones sombres du bas de page (vague #about + bloc #contact) : un
// point en est "sur fond sombre" s'il tombe sur l'une ou l'autre.
function isOverDarkZone(about, contact, y, side) {
  return isOverAboutWave(about, y, side) || (contact && isOverContactBlue(contact, y, side));
}

// Bascule chaque point du rail sur des teintes claires quand la vague bleue passe sous lui,
// pour qu'il reste lisible (sinon ses points/labels gris se fondent dans le bleu). Chaque
// point est testé indépendamment : selon sa hauteur sur le rail, certains peuvent être sur
// la vague bleue pendant que d'autres n'y sont pas.
function initRailOnDark() {
  const rail = document.querySelector('.dot-rail');
  const indicator = document.querySelector('.dot-rail-indicator');
  const dots = document.querySelectorAll('.dot-rail a');
  const pageTag = document.querySelector('.page-tag');
  const about = document.getElementById('about');
  const contact = document.getElementById('contact');
  if (!rail || !about || !dots.length) return;

  function update() {
    dots.forEach((dot) => {
      const r = dot.getBoundingClientRect();
      dot.classList.toggle('is-on-dark', isOverDarkZone(about, contact, r.top + r.height / 2, 'right'));
    });
    if (indicator) {
      const r = indicator.getBoundingClientRect();
      indicator.classList.toggle('is-on-dark', isOverDarkZone(about, contact, r.top + r.height / 2, 'right'));
    }
    if (pageTag) {
      const r = pageTag.getBoundingClientRect();
      pageTag.classList.toggle('is-on-dark', isOverDarkZone(about, contact, r.top + r.height / 2, 'left'));
    }
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('parallax-tick', update);
}

// Affiche le bouton "remonter en haut" dès qu'on a quitté le hero (et jusqu'en bas de page,
// quelle que soit la section affichée), et inverse ses couleurs (fond blanc/icône bleue) quand
// il se trouve sur la vague bleue, pour rester lisible dans les deux cas.
function initBackToTop() {
  const btn = document.querySelector('.back-to-top');
  const about = document.getElementById('about');
  const contact = document.getElementById('contact');
  const hero = document.getElementById('hero');
  if (!btn || !about || !hero) return;

  function update() {
    btn.classList.toggle('is-visible', window.scrollY > hero.offsetHeight * 0.5);
    const r = btn.getBoundingClientRect();
    btn.classList.toggle('is-on-dark', isOverDarkZone(about, contact, r.top + r.height / 2, 'right'));
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('parallax-tick', update);
}

// Anime les blocs .reveal lorsqu'ils entrent dans le viewport (motion discret, pas au chargement).
function initRevealObserver() {
  const targets = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  targets.forEach((el) => observer.observe(el));
}

// Vague du bento #xp pilotée au scroll : le bento reste figé (sticky, cf. CSS)
// pendant que la page défile sur la hauteur de .xp-bento-track. La progression du
// scroll (0 → 1) déplace un « pic » qui balaie les cartes une à une (lift + zoom).
// Ainsi chaque carte s'anime de façon fiable, dans l'ordre, au rythme du scroll.
function initXpBentoWave() {
  const track = document.querySelector('.xp-bento-track');
  const stick = track && track.querySelector('.xp-bento-stick');
  const bento = stick && stick.querySelector('.xp-bento');
  if (!track || !stick || !bento) return;
  const tiles = Array.from(bento.querySelectorAll('.xp-tile'));
  if (!tiles.length) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const N = tiles.length;
  const LIFT = 10;    // amplitude verticale du pic, en px
  const SCALE = 0.03; // zoom au sommet du pic

  let rafId = null;
  // Passe à true une fois la vague entièrement parcourue : le figement est alors relâché
  // pour de bon (cf. release), pour ne pas re-geler la vue en remontant dans la page.
  let released = false;

  function flatten() {
    // Les cartes reviennent à plat en douceur (transition:transform .3s sur .xp-tile).
    tiles.forEach((tile) => { tile.style.transform = ''; tile.style.zIndex = ''; });
  }

  // Supprime le figement définitivement : la piste reprend la hauteur naturelle du bento,
  // de sorte qu'en REMONTANT (ou en repassant) on ne refait plus toute la fenêtre de
  // scroll figé (« vue gelée » sur le bento / la vague). Retirer la course figée décale
  // tout ce qui suit vers le haut ; pour que rien ne bouge à l'écran, on MESURE le saut
  // réel du bento (avant → après le repli) et on l'annule par un scroll d'autant. Mesurer
  // le déplacement rendu — plutôt que de le calculer — reste juste malgré le position:sticky
  // et le translateY du parallax, qui fausseraient un calcul en coordonnées de scroll
  // (overflow-anchor:none, donc pas de recalage automatique du navigateur).
  function release() {
    released = true;
    const before = bento.getBoundingClientRect().top;
    track.style.height = 'auto';
    const after = bento.getBoundingClientRect().top;
    flatten();
    window.scrollBy({ top: after - before, left: 0, behavior: 'instant' });
  }

  function apply() {
    rafId = null;
    // Figement relâché après une première traversée complète : cartes à plat, plus de
    // vague — on ne re-fige plus au retour vers le haut.
    if (released) { flatten(); return; }
    // Figement désactivé (mobile <=900px ou reduced-motion) : cartes à plat.
    if (reduce.matches || track.offsetHeight <= window.innerHeight + 1) {
      flatten();
      return;
    }
    // La vague est calée sur la fenêtre de figement RÉELLE : elle démarre pile
    // quand le bento se verrouille et finit quand il se relâche — pas de zone morte
    // « figé mais rien ne bouge ». On mesure le décalage du bento DANS sa piste :
    // 0 tant qu'il est en haut de la piste (pas figé), il grandit pendant le figement
    // (le bento reste fixe, la piste défile) jusqu'à hauteur de piste − hauteur du
    // bento. Comme les deux getBoundingClientRect subissent le même translateY (#about
    // qui remonte, cf. initAboutParallax), le lift s'annule dans la soustraction :
    // le calcul reste juste malgré le transform.
    const offsetInTrack = stick.getBoundingClientRect().top - track.getBoundingClientRect().top;
    const pinned = track.offsetHeight - stick.offsetHeight;   // course figée
    // Vague entièrement parcourue (bento arrivé au bas de sa piste) → on relâche le
    // figement pour de bon, à ce point précis où c'est invisible (cf. release).
    if (offsetInTrack >= pinned - 0.5) { release(); return; }
    const progress = clamp(offsetInTrack / pinned, 0, 1);
    // -0.5 et +1 : décale la course du pic pour que la fenêtre triangulaire (rayon 1,
    // centrée sur i+0.5) soit à distance >= 1 de la 1re/dernière carte aux bornes
    // (progress 0 et 1) — sinon ces cartes démarraient/finissaient déjà à moitié
    // gonflées (scale/lift) au lieu d'être plates.
    const head = -0.5 + progress * (N + 1);   // position du pic, en « unités carte »
    tiles.forEach((tile, i) => {
      const d = Math.abs(head - (i + 0.5));   // distance carte ↔ pic
      const t = Math.max(0, 1 - d);           // fenêtre triangulaire d'1 carte
      const e = t * t * (3 - 2 * t);          // smoothstep
      tile.style.transform = `translateY(${(-LIFT * e).toFixed(2)}px) scale(${(1 + SCALE * e).toFixed(3)})`;
      tile.style.zIndex = e > 0.15 ? 5 : 1;
    });
  }

  function request() { if (rafId === null) rafId = requestAnimationFrame(apply); }
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  if (reduce.addEventListener) reduce.addEventListener('change', request);
  apply();
}

// Contrairement à .reveal (qui ne joue qu'une fois), les icônes flottantes des piliers
// doivent réapparaître/disparaître à chaque passage dans le viewport : pas d'unobserve ici.
function initSkillFloaterObserver() {
  const targets = document.querySelectorAll('.skill-item');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle('icons-live', entry.isIntersecting);
    });
  }, { threshold: 0.15 });
  targets.forEach((el) => observer.observe(el));
}

// Donne accès au dictionnaire de la langue courante (voir i18n.js) pour le contenu
// généré par le terminal, qui n'est jamais dans le DOM tant qu'on ne tape pas la commande
// et ne peut donc pas être retraduit via applyTranslations comme le reste du site.
function termDict() {
  return TERM_I18N[CURRENT_LANG] || TERM_I18N.fr;
}

// Terminal interactif du Hero — commandes prédéfinies, "help" pour la liste. `desc` est un
// getter pour rester traduit même si la langue change après le chargement de la page ;
// `run` relit toujours termDict() au moment de l'exécution, pour la même raison.
const TERM_COMMANDS = {
  help: {
    get desc() { return termDict().help.desc; },
    run: () => Object.entries(TERM_COMMANDS)
      .filter(([, cmd]) => cmd.desc)
      .map(([name, cmd]) => `<span class="k">${name.padEnd(10, ' ')}</span>— ${cmd.desc}`),
  },
  clear: {
    get desc() { return termDict().clear.desc; },
    run: () => [],
  },
  whoami: {
    get desc() { return termDict().whoami.desc; },
    run: () => termDict().whoami.lines,
  },
  status: {
    get desc() { return termDict().status.desc; },
    run: () => termDict().status.lines,
  },
  about: {
    get desc() { return termDict().about.desc; },
    run: () => termDict().about.lines,
  },
  skills: {
    get desc() { return termDict().skills.desc; },
    run: () => termDict().skills.lines,
  },
  contact: {
    get desc() { return termDict().contact.desc; },
    run: () => termDict().contact.lines,
  },
  neofetch: {
    get desc() { return termDict().neofetch.desc; },
    run: () => termDict().neofetch.lines,
  },
  banner: {
    get desc() { return termDict().banner.desc; },
    run: () => termDict().banner.lines,
  },
};

TERM_COMMANDS.banner.runClass = 'ascii';
TERM_COMMANDS.neofetch.runClass = 'nf';
TERM_COMMANDS.neofetch.speed = 1;

// Easter eggs : sans `desc`, donc invisibles dans `help` (et dans le cycle Tab tant qu'on n'a
// pas déjà tapé leur début) — à découvrir en tapant la commande, comme un vrai easter egg.
TERM_COMMANDS.matrix = { desc: null, special: 'matrix' };
TERM_COMMANDS.crack = {
  desc: null,
  special: 'crack-start',
  run: () => termDict().crackIntro,
};
TERM_COMMANDS.hack = TERM_COMMANDS.crack; // alias caché, même mini-jeu

// Motifs de commandes "piégées" : pas de clé exacte dans TERM_COMMANDS (l'argument varie),
// on les teste donc par regex juste avant d'afficher "commande introuvable".
const TERM_EASTER_PATTERNS = [
  { re: /^sudo\b/i, run: () => termDict().easterSudo },
  { re: /^rm\s+-rf\s+\/?$/i, run: () => termDict().easterRm },
  { re: /^su(\s|$)/i, run: () => termDict().easterSu },
  { re: /^(ssh|nc|netcat)\b/i, run: () => termDict().easterSsh },
];

// Vraie commande, sans sortie : sert juste à "envoyer" `cd ~/hugo` au terminal dès que
// sa frappe simulée se termine (voir runAutoSequence), avant d'enchaîner sur la suite.
TERM_COMMANDS['cd ~/hugo'] = { desc: null, run: () => [] };

// Alias : "cat neofetch", comme si neofetch était un fichier d'identité posé dans le
// dossier ~/hugo (voir runAutoSequence) — même rendu, mais affiché depuis ce dossier
// (cwd) plutôt que depuis la racine. Pas de desc : reste caché du `help`, accessible
// seulement en le tapant ou via Tab.
TERM_COMMANDS['cat neofetch'] = {
  desc: null,
  cwd: '~/hugo',
  run: TERM_COMMANDS.neofetch.run,
  runClass: 'nf',
  speed: 1,
};

// Raccourcis numériques du menu ASCII des catégories (voir initHeroTermGrow) : tape
// 1-4 dans le terminal pour sélectionner la même entrée qu'au clic. Exclus de "help".
['1', '2', '3', '4'].forEach((key) => {
  TERM_COMMANDS[key] = {
    desc: null,
    run: () => {
      const ok = window.HeroCategories && window.HeroCategories.select(key);
      return ok ? [] : ['rien à sélectionner ici.'];
    },
  };
});

function initTerminal() {
  const card = document.getElementById('term-card');
  const scrollEl = document.getElementById('term-output');
  const output = document.getElementById('term-output-typed');
  const input = document.getElementById('term-input');
  const cwdEl = document.getElementById('term-cwd');
  const hintEl = card.querySelector('.term-hint');
  const outputDefault = document.getElementById('term-output-default');
  const categoriesEl = document.getElementById('term-categories');
  if (!card || !scrollEl || !output || !input) return;

  const history = [];
  let historyIndex = -1;
  // état du mini-jeu caché "crack"/"hack" : tant qu'il est actif, toute saisie qui n'est pas
  // exit/quit est interprétée comme une tentative de code plutôt que comme une commande.
  let crackState = null;
  const CRACK_CWD = '~/pfsense';

  function generateCrackCode() {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = digits.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.slice(0, 4);
  }

  // Mastermind simplifié (digits uniques) : compte les chiffres bien placés ("bulls") et
  // ceux présents mais mal placés ("cows"), pour guider le joueur tentative après tentative.
  function handleCrackGuess(raw) {
    const guess = raw.trim();
    if (!/^\d{4}$/.test(guess) || new Set(guess).size !== 4) {
      return [termDict().crackInvalid];
    }
    const guessDigits = guess.split('').map(Number);
    crackState.attempts += 1;
    let bulls = 0;
    let cows = 0;
    guessDigits.forEach((d, i) => {
      if (d === crackState.code[i]) bulls += 1;
      else if (crackState.code.includes(d)) cows += 1;
    });
    if (bulls === 4) {
      const { attempts } = crackState;
      crackState = null;
      setCwd('~');
      return termDict().crackSuccess(attempts);
    }
    const lines = [termDict().crackProgress(bulls, cows, crackState.attempts)];
    // toutes les 3 tentatives ratées, on révèle un chiffre supplémentaire du code (dans
    // l'ordre des positions) pour éviter que le brute-force pur ne devienne décourageant.
    if (crackState.attempts % 3 === 0 && crackState.revealed.size < crackState.code.length) {
      let idx = 0;
      while (crackState.revealed.has(idx)) idx += 1;
      crackState.revealed.add(idx);
      lines.push(termDict().crackHint(idx + 1, crackState.code[idx]));
    }
    return lines;
  }

  // Pluie de caractères en surimpression de la sortie, qui passe par chacun des patterns
  // les uns après les autres, sans effet de transition entre eux (juste un changement net) —
  // annulée proprement si une autre commande arrive (voir `gen`).
  function runMatrixEasterEgg(gen) {
    const PATTERNS = ['rain', 'diagonal', 'pulse', 'tunnel', 'scan'];
    const chars = 'アイウエオカキクケコサシスセソタチツテト0123456789';
    const fontSize = 14;
    const PATTERN_DURATION = 1400;

    if (hintEl) hintEl.style.display = 'none';

    const canvas = document.createElement('canvas');
    canvas.className = 'term-matrix-overlay';
    scrollEl.appendChild(canvas);
    canvas.width = scrollEl.clientWidth;
    canvas.height = scrollEl.clientHeight;
    const ctx = canvas.getContext('2d');

    const columns = Math.max(1, Math.floor(canvas.width / fontSize));
    const rows = Math.ceil(canvas.height / fontSize);
    const drops = new Array(columns).fill(0).map(() => Math.random() * -20);
    const diagDrops = new Array(columns).fill(0).map(() => Math.random() * -20);
    const pulsePhases = Array.from({ length: rows }, () => new Array(columns).fill(0).map(() => Math.random()));

    function drawRain() {
      ctx.fillStyle = 'rgba(13,17,15,0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#7ee787';
      ctx.font = `${fontSize}px monospace`;
      drops.forEach((y, i) => {
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 1;
      });
    }

    function drawDiagonal() {
      ctx.fillStyle = 'rgba(13,17,15,0.18)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#7ee787';
      ctx.font = `${fontSize}px monospace`;
      diagDrops.forEach((y, i) => {
        const x = (i * fontSize + y * fontSize * 0.4) % canvas.width;
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], x, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.97) diagDrops[i] = 0;
        diagDrops[i] += 1;
      });
    }

    function drawPulse() {
      ctx.fillStyle = '#0d1110';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      pulsePhases.forEach((row, r) => {
        row.forEach((phase, c) => {
          const intensity = 0.15 + 0.55 * Math.abs(Math.sin(performance.now() / 400 + phase * 10));
          ctx.fillStyle = `rgba(126,231,135,${intensity})`;
          ctx.fillText(Math.random() > 0.5 ? '1' : '0', c * fontSize, r * fontSize);
        });
      });
    }

    // anneau de glyphes qui s'étend depuis le centre, comme un sonar qui plonge dans le code.
    function drawTunnel(patternStart) {
      ctx.fillStyle = '#0d1110';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = Math.hypot(cx, cy);
      const t = ((performance.now() - patternStart) % 1400) / 1400;
      const ringR = t * maxR;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < columns; c += 1) {
          const x = c * fontSize;
          const y = r * fontSize;
          const diff = Math.abs(Math.hypot(x - cx, y - cy) - ringR);
          if (diff < fontSize * 2) {
            const intensity = 1 - diff / (fontSize * 2);
            ctx.fillStyle = `rgba(126,231,135,${0.2 + 0.7 * intensity})`;
            ctx.fillText(chars[Math.floor(Math.random() * chars.length)], x, y);
          }
        }
      }
    }

    // ligne de scan qui balaye le bloc de haut en bas, façon analyse de code en cours.
    function drawScan(patternStart) {
      ctx.fillStyle = '#0d1110';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      const cycle = 1300;
      const t = ((performance.now() - patternStart) % cycle) / cycle;
      const scanY = t * canvas.height;
      for (let r = 0; r < rows; r += 1) {
        const y = r * fontSize;
        const intensity = Math.max(0.1, 1 - Math.abs(y - scanY) / 36);
        ctx.fillStyle = `rgba(126,231,135,${intensity})`;
        for (let c = 0; c < columns; c += 1) {
          if (Math.random() > 0.55) ctx.fillText(chars[Math.floor(Math.random() * chars.length)], c * fontSize, y);
        }
      }
    }

    const drawers = {
      rain: drawRain, diagonal: drawDiagonal, pulse: drawPulse, tunnel: drawTunnel, scan: drawScan,
    };

    function finish() {
      canvas.remove();
      if (hintEl) hintEl.style.display = '';
    }

    function playPattern(index) {
      if (gen !== typingGen) { finish(); return; }
      if (index >= PATTERNS.length) { finish(); return; }

      const draw = drawers[PATTERNS[index]] || drawRain;
      const patternStart = performance.now();

      function loop() {
        if (gen !== typingGen) { finish(); return; }
        draw(patternStart);
        if (performance.now() - patternStart < PATTERN_DURATION) {
          requestAnimationFrame(loop);
        } else {
          playPattern(index + 1);
        }
      }
      loop();
    }
    playPattern(0);
  }
  // dossier courant affiché devant le champ de saisie, persiste tant qu'on ne "ressort"
  // pas du plein écran (voir cancelAuto) — mis à jour quand `cd ~/hugo` est envoyé.
  function setCwd(dir) {
    if (cwdEl) cwdEl.textContent = dir;
  }
  // jeton de génération : incrémenté à chaque nouvelle commande (y compris `clear`) pour
  // pouvoir interrompre une frappe en cours — sinon les setTimeout d'un neofetch encore en
  // train de s'écrire continueraient à réinjecter des lignes après un clear déclenché entre-temps.
  let typingGen = 0;

  // Prompt façon shell : affiche le dossier courant avant le "$", pour les commandes
  // (comme `cat neofetch`) qui ont un `cwd` distinct de la racine ~ (voir TERM_COMMANDS).
  function promptHtml(cwd) {
    return `<span class="prompt-path">${cwd}</span><span class="prompt">$</span>`;
  }

  function printLine(html, extraClass) {
    const line = document.createElement('div');
    line.className = extraClass ? `l ${extraClass}` : 'l';
    line.innerHTML = html;
    output.appendChild(line);
    scrollEl.scrollTop = scrollEl.scrollHeight;
    return line;
  }

  // Découpe le HTML en tokens : une balise entière = un seul token, sinon un caractère.
  // Permet de "taper" du HTML coloré sans jamais couper une balise en deux.
  function tokenizeHtml(html) {
    return html.match(/<[^>]+>|[^<]/g) || [];
  }

  function typeLine(line, html, speed, gen, onDone) {
    const tokens = tokenizeHtml(html);
    let i = 0;
    function step() {
      if (gen !== typingGen) return; // une commande plus récente a pris le relais
      line.innerHTML = tokens.slice(0, i + 1).join('');
      scrollEl.scrollTop = scrollEl.scrollHeight;
      i += 1;
      if (i < tokens.length) {
        setTimeout(step, speed);
      } else if (onDone) {
        onDone();
      }
    }
    step();
  }

  // Tape une suite de lignes les unes après les autres, chacune attendant que la précédente soit finie.
  function typeLines(lines, extraClass, speed, gen) {
    let i = 0;
    function next() {
      if (gen !== typingGen || i >= lines.length) return;
      const line = printLine('', extraClass);
      typeLine(line, lines[i], speed, gen, () => {
        i += 1;
        next();
      });
    }
    next();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // `append` garde la sortie précédente au lieu de l'effacer — utilisé par
  // runAutoSequence pour que "cd ~/hugo" reste affiché quand la commande suivante s'exécute.
  function runCommand(raw, append) {
    const cmd = raw.trim();
    if (!cmd) return;

    typingGen += 1; // invalide toute frappe en cours d'une commande précédente
    const gen = typingGen;
    if (cmd.toLowerCase() === 'clear') {
      output.innerHTML = '';
      history.push(cmd);
      historyIndex = history.length;
      return;
    }
    if (!append) {
      output.innerHTML = '';
      if (outputDefault) outputDefault.remove();
      if (categoriesEl) categoriesEl.remove();
    }

    // mini-jeu "crack"/"hack" en cours : toute saisie hors exit/quit est une tentative de code.
    if (crackState) {
      printLine(`${promptHtml(CRACK_CWD)} ${escapeHtml(cmd)}`, 'cmd');
      history.push(cmd);
      historyIndex = history.length;
      if (['exit', 'quit'].includes(cmd.toLowerCase())) {
        crackState = null;
        setCwd('~');
        typeLines(termDict().crackAbandon, null, 4, gen);
      } else {
        typeLines(handleCrackGuess(cmd), null, 4, gen);
      }
      return;
    }

    const entry = TERM_COMMANDS[cmd.toLowerCase()];
    const cwd = entry && entry.cwd ? entry.cwd : '~';
    printLine(`${promptHtml(cwd)} ${escapeHtml(cmd)}`, 'cmd');
    history.push(cmd);
    historyIndex = history.length;

    // "cd ..." déplace le dossier affiché devant le champ de saisie pour la suite.
    if (entry && cmd.toLowerCase().startsWith('cd ')) {
      setCwd(cmd.slice(3).trim() || '~');
    }

    if (!entry) {
      const catKey = window.HeroCategories && window.HeroCategories.matchByText
        && window.HeroCategories.matchByText(cmd);
      if (catKey) {
        window.HeroCategories.select(catKey);
        return;
      }
      const easter = TERM_EASTER_PATTERNS.find((p) => p.re.test(cmd));
      if (easter) {
        typeLines(easter.run(), 'error', 4, gen);
        return;
      }
      typeLines([termDict().notFound(escapeHtml(cmd))], 'error', 4, gen);
      return;
    }

    if (entry.special === 'matrix') {
      runMatrixEasterEgg(gen);
      return;
    }
    if (entry.special === 'crack-start') {
      crackState = { code: generateCrackCode(), attempts: 0, revealed: new Set() };
      setCwd(CRACK_CWD);
      typeLines(entry.run(), null, 4, gen);
      return;
    }
    typeLines(entry.run(), entry.runClass || null, entry.speed || 4, gen);
  }

  const inputRow = input.closest('.term-input-row');
  function updateHasValue() {
    inputRow.classList.toggle('has-value', input.value.length > 0);
  }

  // Autocomplétion par Tab : cycle parmi les commandes qui commencent par ce qui a été tapé.
  let tabMatches = [];
  let tabIndex = -1;

  function resetTabCycle() {
    tabMatches = [];
    tabIndex = -1;
  }

  // Simule une frappe humaine dans le champ : caractère par caractère, à un rythme
  // irrégulier (pas un débit de robot), avec une petite pause avant le "Entrée" final.
  function typeIntoInput(text, gen, onDone) {
    let i = 0;
    function step() {
      if (gen !== typingGen) return; // une commande plus récente (ou une annulation) a pris le relais
      i += 1;
      input.value = text.slice(0, i);
      updateHasValue();
      if (i < text.length) {
        setTimeout(step, 55 + Math.random() * 70);
      } else {
        setTimeout(() => { if (gen === typingGen) onDone(); }, 280);
      }
    }
    step();
  }

  // Permet de piloter le terminal depuis l'extérieur (auto-démo neofetch quand le
  // terminal atteint sa taille max — voir initHeroTermGrow). `isAutoOutput` marque
  // cette séquence comme automatique, pour pouvoir l'annuler/l'effacer sans toucher
  // à une commande que l'utilisateur aurait tapée lui-même par-dessus.
  let isAutoOutput = false;
  // jeton dédié à la séquence (distinct de typingGen, que runCommand incrémente à
  // chaque commande) : permet d'enchaîner plusieurs runCommand sans que l'un invalide
  // la suite de la chaîne de setTimeout qui pilote la frappe simulée.
  let autoSeqId = 0;
  window.HeroTerminal = {
    isEmpty: () => output.children.length === 0,
    isAutoOutput: () => isAutoOutput,
    // Rond rouge de la barre du terminal : vide la sortie tapée, comme `clear`.
    clear: () => runCommand('clear'),
    // Tape chaque commande de `commands` dans le champ comme le ferait une vraie
    // personne, puis l'envoie réellement (echo immédiat) dès la frappe finie — chaque
    // commande s'ajoute à la suite de la précédente, sans effacer l'écran entre les deux.
    runAutoSequence: (commands) => {
      isAutoOutput = true;
      autoSeqId += 1;
      const seqId = autoSeqId;
      function typeAt(idx) {
        if (seqId !== autoSeqId) return;
        typingGen += 1;
        const charGen = typingGen;
        typeIntoInput(commands[idx], charGen, () => {
          if (seqId !== autoSeqId) return;
          input.value = '';
          updateHasValue();
          runCommand(commands[idx], idx > 0);
          if (idx < commands.length - 1) {
            setTimeout(() => { if (seqId === autoSeqId) typeAt(idx + 1); }, 450);
          }
        });
      }
      typeAt(0);
    },
    // Coupe net une séquence auto en cours (frappe ou sortie déjà affichée) et nettoie.
    cancelAuto: () => {
      autoSeqId += 1;
      typingGen += 1;
      isAutoOutput = false;
      crackState = null;
      input.value = '';
      updateHasValue();
      output.innerHTML = '';
      setCwd('~');
    },
  };

  // Démo passive dans le champ de saisie : tape "neofetch" lettre par lettre puis
  // l'efface, en boucle, tant que l'utilisateur n'a pas cliqué sur la console —
  // simple incitation visuelle, ne déclenche jamais la commande réellement.
  let idleActive = true;
  let idleGen = 0;
  const idleTextEl = document.getElementById('term-idle-text');

  function idleTypeText(text, gen, onDone) {
    let i = 0;
    function step() {
      if (gen !== idleGen) return;
      i += 1;
      if (idleTextEl) idleTextEl.textContent = text.slice(0, i);
      if (i < text.length) {
        setTimeout(step, 70 + Math.random() * 80);
      } else {
        onDone();
      }
    }
    step();
  }

  function idleEraseText(gen, onDone) {
    function step() {
      if (gen !== idleGen || !idleTextEl) return;
      idleTextEl.textContent = idleTextEl.textContent.slice(0, -1);
      if (idleTextEl.textContent.length > 0) {
        setTimeout(step, 35 + Math.random() * 35);
      } else {
        onDone();
      }
    }
    step();
  }

  function idleLoop() {
    if (!idleActive) return;
    const gen = idleGen;
    idleTypeText('neofetch', gen, () => {
      if (gen !== idleGen) return;
      setTimeout(() => {
        if (gen !== idleGen) return;
        idleEraseText(gen, () => {
          if (gen !== idleGen) return;
          setTimeout(() => { if (gen === idleGen) idleLoop(); }, 2200);
        });
      }, 900);
    });
  }

  function stopIdleTease() {
    if (!idleActive) return;
    idleActive = false;
    idleGen += 1;
    if (idleTextEl) idleTextEl.textContent = '';
    inputRow.classList.remove('is-idle');
  }

  inputRow.classList.add('is-idle');
  setTimeout(idleLoop, 1000);
  window.HeroTerminal.stopIdleTease = stopIdleTease;

  card.addEventListener('click', () => { stopIdleTease(); input.focus(); });
  input.addEventListener('focus', stopIdleTease);
  input.addEventListener('input', () => {
    resetTabCycle();
    updateHasValue();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      resetTabCycle();
      isAutoOutput = false;
      runCommand(input.value);
      input.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      resetTabCycle();
      if (historyIndex > 0) historyIndex -= 1;
      input.value = history[historyIndex] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      resetTabCycle();
      if (historyIndex < history.length) historyIndex += 1;
      input.value = history[historyIndex] || '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (tabMatches.length === 0) {
        const base = input.value.trim().toLowerCase();
        const catNames = (window.HeroCategories && window.HeroCategories.list) ? window.HeroCategories.list() : [];
        // Tab à vide ne propose que les commandes "publiques" (avec desc) plus le
        // sommaire des catégories : les raccourcis cachés (1-5, matrix, crack...)
        // ne sortent que si on a déjà tapé le début de leur nom.
        tabMatches = base
          ? Object.keys(TERM_COMMANDS).concat(catNames).filter((name) => name.toLowerCase().startsWith(base))
          : Object.keys(TERM_COMMANDS).filter((name) => TERM_COMMANDS[name].desc != null).concat(catNames);
        if (tabMatches.length === 0) return;
        tabIndex = 0;
      } else {
        tabIndex = (tabIndex + 1) % tabMatches.length;
      }
      input.value = tabMatches[tabIndex];
    }
    updateHasValue();
  });
}

initSite();

// Grille de points en fond du hero, qui réagit à la position de la souris (effet magnétique discret).
function initBackgroundGrid() {
  const canvas = document.getElementById('bg-grid');
  const container = canvas ? canvas.closest('.hero') : null;
  const copy = container ? container.querySelector('.hero-copy') : null;
  const navRail = document.querySelector('.dot-rail');
  if (!canvas || !container) return;
  const ctx = canvas.getContext('2d');

  const SPACING = 38;
  const BASE_RADIUS = 1.2;
  const REACT_RADIUS = 140;
  const MAX_OFFSET = 10;
  const MAX_SCALE = 2.4;
  const FEATHER_IN = 40;
  const FEATHER_OUT = 90;
  const MIN_ALPHA = 0.04;
  const ROUND_RADIUS = 10;
  // la grille ne se révèle qu'autour du curseur : rayon plein visible, puis fondu jusqu'à 0
  const REVEAL_RADIUS = 160;
  const REVEAL_FEATHER = 140;
  const EXCLUSION_SELECTOR = 'h1, .lede, .btn, .social-row a';
  // déborde sous le hero pour que la grille continue derrière le bord diagonal de la section
  // "about" (.section-divider-bar), au lieu de s'arrêter pile au bas du hero.
  const EXTRA_BELOW = 140;
  const BASE_COLOR = '37,70,200';

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let points = [];
  let exclusionRects = [];
  const mouse = { x: -9999, y: -9999, active: false };

  function smoothstep(edge0, edge1, value) {
    const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
  }

  // Distance signée à un rectangle à coins arrondis (SDF) — négative à l'intérieur, 0 sur le bord, positive à l'extérieur.
  function distToRoundedRect(px, py, rect, radius) {
    const halfW = (rect.right - rect.left) / 2;
    const halfH = (rect.bottom - rect.top) / 2;
    const r = Math.min(radius, halfW, halfH);
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const dx = Math.abs(px - cx) - (halfW - r);
    const dy = Math.abs(py - cy) - (halfH - r);
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r;
  }

  // Récupère un rectangle par ligne visuelle (pas un seul bloc englobant tout un paragraphe multi-lignes).
  function getLineRects(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    return Array.from(range.getClientRects());
  }

  function updateExclusionRect() {
    exclusionRects = [];
    const containerRect = container.getBoundingClientRect();
    const pad = 3;
    if (copy) {
      copy.querySelectorAll(EXCLUSION_SELECTOR).forEach((el) => {
        getLineRects(el).forEach((r) => {
          if (r.width < 1 || r.height < 1) return;
          exclusionRects.push({
            left: r.left - containerRect.left - pad,
            top: r.top - containerRect.top - pad,
            right: r.right - containerRect.left + pad,
            bottom: r.bottom - containerRect.top + pad,
          });
        });
      });
    }
    // le rail de nav est fixed (sa position relative au hero bouge au scroll) : on
    // l'exclut en plus du texte, pour qu'il bénéficie du même halo feathered que le h1.
    if (navRail) {
      const r = navRail.getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) {
        exclusionRects.push({
          left: r.left - containerRect.left - pad,
          top: r.top - containerRect.top - pad,
          right: r.right - containerRect.left + pad,
          bottom: r.bottom - containerRect.top + pad,
        });
      }
    }
  }

  function buildPoints() {
    points = [];
    for (let y = SPACING / 2; y < height; y += SPACING) {
      for (let x = SPACING / 2; x < width; x += SPACING) {
        points.push({ x, y, rgb: BASE_COLOR });
      }
    }
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height + EXTRA_BELOW;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPoints();
    updateExclusionRect();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (const p of points) {
      let alpha = 1;
      if (exclusionRects.length) {
        let minDist = Infinity;
        for (const rect of exclusionRects) {
          const dist = distToRoundedRect(p.x, p.y, rect, ROUND_RADIUS);
          if (dist < minDist) minDist = dist;
        }
        alpha = MIN_ALPHA + (1 - MIN_ALPHA) * smoothstep(-FEATHER_IN, FEATHER_OUT, minDist);
      }
      let dx = 0;
      let dy = 0;
      let scale = 1;
      let reveal = 0;

      if (mouse.active) {
        const distX = p.x - mouse.x;
        const distY = p.y - mouse.y;
        const dist = Math.hypot(distX, distY);
        reveal = 1 - smoothstep(REVEAL_RADIUS - REVEAL_FEATHER, REVEAL_RADIUS, dist);
        if (dist < REACT_RADIUS) {
          const force = 1 - dist / REACT_RADIUS;
          const angle = Math.atan2(distY, distX);
          dx = Math.cos(angle) * force * MAX_OFFSET;
          dy = Math.sin(angle) * force * MAX_OFFSET;
          scale = 1 + force * (MAX_SCALE - 1);
        }
      }

      alpha *= reveal;
      if (alpha <= 0.01) continue;

      const r = BASE_RADIUS * scale;
      const fill = `rgba(${p.rgb},${0.6 * alpha})`;

      ctx.beginPath();
      ctx.arc(p.x + dx, p.y + dy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  let lastClientX = -9999;
  let lastClientY = -9999;

  function updateMouseFromClient() {
    const rect = container.getBoundingClientRect();
    mouse.x = lastClientX - rect.left;
    mouse.y = lastClientY - rect.top;
  }

  // Écoute sur window (et non sur .hero) pour rester réactif même quand le curseur quitte
  // brièvement la zone ; les coords sont reconverties en repère local via updateMouseFromClient.
  window.addEventListener('mousemove', (e) => {
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    updateMouseFromClient();
    mouse.active = true;
  }, { passive: true });
  document.addEventListener('mouseleave', () => {
    mouse.active = false;
  });
  window.addEventListener('scroll', () => {
    if (mouse.active) updateMouseFromClient();
    if (navRail) updateExclusionRect();
  }, { passive: true });
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resize);
  }

  resize();
  draw();
}
