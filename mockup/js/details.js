// Page détails — deux comportements légers, autonomes (aucune dépendance au SPA
// de la page d'accueil) : révélation des blocs au scroll, et surlignage de l'entrée
// active dans le sommaire latéral au fil du défilement.

// Quadrillage de points réactif au curseur, repris du hero de l'accueil (initBackgroundGrid
// dans js/main.js) mais fixé au viewport pour couvrir toute la page détails plutôt qu'une
// seule section — pas d'exclusion de zones de texte ici, le curseur révèle la grille partout.
(function initDetailsBgGrid() {
  const canvas = document.getElementById('dp-bg-grid');
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');

  const SPACING = 38;
  const BASE_RADIUS = 1.2;
  const REACT_RADIUS = 140;
  const MAX_OFFSET = 10;
  const MAX_SCALE = 2.4;
  const REVEAL_RADIUS = 160;
  const REVEAL_FEATHER = 140;
  const BASE_COLOR = '37,70,200';

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let points = [];
  const mouse = { x: -9999, y: -9999, active: false };

  function smoothstep(edge0, edge1, value) {
    const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
  }

  function buildPoints() {
    points = [];
    for (let y = SPACING / 2; y < height; y += SPACING) {
      for (let x = SPACING / 2; x < width; x += SPACING) {
        points.push({ x, y });
      }
    }
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPoints();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    if (mouse.active) {
      for (const p of points) {
        const distX = p.x - mouse.x;
        const distY = p.y - mouse.y;
        const dist = Math.hypot(distX, distY);
        const reveal = 1 - smoothstep(REVEAL_RADIUS - REVEAL_FEATHER, REVEAL_RADIUS, dist);
        if (reveal <= 0.01) continue;

        let dx = 0, dy = 0, scale = 1;
        if (dist < REACT_RADIUS) {
          const force = 1 - dist / REACT_RADIUS;
          const angle = Math.atan2(distY, distX);
          dx = Math.cos(angle) * force * MAX_OFFSET;
          dy = Math.sin(angle) * force * MAX_OFFSET;
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

  // Le canvas est fixé au viewport : les coordonnées souris (clientX/Y) s'y reportent
  // directement, sans conversion par rapport à un conteneur qui défile.
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  }, { passive: true });
  document.addEventListener('mouseleave', () => { mouse.active = false; });
  window.addEventListener('resize', resize);

  resize();
  draw();
})();

// Année courante dans le copyright du pied de page (section contact, dupliquée de l'accueil).
(function initFooterYear() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
})();

// Avatar de #contact qui grandit progressivement au scroll, comme sur l'accueil
// (initAboutParallax dans main.js). Là-bas, la progression suit le contre-lift qui
// résorbe le décalage entre #about et #contact ; ici, sans #about, on la fait dépendre
// simplement de la distance parcourue jusqu'au vrai bas de la page — l'avatar termine
// sa croissance (et révèle le bras posé sur le pli) pile quand on atteint le bas du document.
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
    if (armEl) {
      armEl.style.setProperty('--avatar-arm-opacity', armVisible ? 1 : 0);
    }
    if (footEl) footEl.classList.toggle('dp-foot-arm-hidden', !armVisible);
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

// Parallax du bandeau bleu des 4 piliers de compétences, repris de #about sur l'accueil
// (initAboutParallax dans js/main.js) : le bloc bleu part de sa position naturelle
// (transform nul) puis remonte de plus en plus (translateY négatif) au fil de sa traversée
// du viewport — purement visuel (transform), sans toucher au flow du document.
//
// Deux gaps naîtraient de ce lift, qu'on comble sans jamais faire bouger le bas visible de
// la page (le rappel de pied .dp-foot et #contact restent, eux, TOUJOURS à leur place —
// c'est ce qui manquait avant : le petit pied glissait visiblement) :
//   1. juste sous le bloc bleu qui remonte → #experience remonte du même montant, collée
//      dessous ;
//   2. tout en bas du document → #experience, grande section, porte un contre-lift qui la
//      ramène pile à 0 au moment où son bas atteint le bas du viewport, donc juste avant que
//      le pied n'entre en scène. Comme ce contre-lift ne joue que tant que la frontière
//      #experience / pied est encore sous le viewport, le raccord reste toujours hors écran :
//      le pied ne bouge pas, et aucun trou n'apparaît.
(function initCompetencesParallax() {
  const block = document.getElementById('competences');
  const settle = document.getElementById('experience');
  if (!block) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Même amplitude et même lissage que --about-lift / EASE sur l'accueil : sensation identique.
  const MAX_LIFT = 220; // px
  const EASE = 0.35;
  let currentLift = 0;
  let currentSettleLift = 0;
  let rafId = null;

  // Position "naturelle" (hors transform) via offsetTop cumulé, plutôt que getBoundingClientRect
  // qui inclurait déjà le transform qu'on est en train d'appliquer.
  function naturalTop(el) {
    let top = 0;
    for (let node = el; node; node = node.offsetParent) top += node.offsetTop;
    return top;
  }

  function targets() {
    const viewportTop = naturalTop(block) - window.scrollY;
    const progress = Math.min(Math.max(1 - viewportTop / window.innerHeight, 0), 1);
    const lift = -progress * MAX_LIFT;
    let settleLift = lift;
    if (settle) {
      // Le contre-lift résorbe le lift de #experience pile quand son bas naturel atteint le
      // bas du viewport (donc avant que le pied, immobile juste dessous, n'apparaisse) ; il
      // peut commencer à jouer bien avant, sur COUNTER_RANGE px de scroll.
      const COUNTER_RANGE = Math.max(MAX_LIFT, window.innerHeight * 0.9);
      const settleBottom = naturalTop(settle) + settle.offsetHeight;
      const counterProgress = Math.min(Math.max((window.scrollY + window.innerHeight - (settleBottom - COUNTER_RANGE)) / COUNTER_RANGE, 0), 1);
      settleLift = lift + counterProgress * MAX_LIFT;
    }
    return { lift, settleLift };
  }

  function apply() {
    block.style.transform = `translateY(${currentLift}px)`;
    if (settle) settle.style.transform = `translateY(${currentSettleLift}px)`;
    // Le rail de nav et le bouton "remonter" recalculent leur teinte sur l'event scroll ;
    // comme le lift continue de bouger (lissage EASE) quelques frames après l'arrêt du
    // scroll, on les réveille via cet event dédié pour qu'ils suivent jusqu'au repos.
    window.dispatchEvent(new Event('parallax-tick'));
  }

  function loop() {
    const { lift, settleLift } = targets();
    currentLift += (lift - currentLift) * EASE;
    currentSettleLift += (settleLift - currentSettleLift) * EASE;
    apply();
    if (Math.abs(lift - currentLift) < 0.05 && Math.abs(settleLift - currentSettleLift) < 0.05) {
      currentLift = lift;
      currentSettleLift = settleLift;
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
  // Positionne tout correctement dès le chargement (ex. scroll déjà restauré par le
  // navigateur), sans animation de rattrapage visible.
  const initial = targets();
  currentLift = initial.lift;
  currentSettleLift = initial.settleLift;
  apply();
})();

// Anime les blocs .reveal quand ils entrent dans le viewport (une seule fois).
(function initReveal() {
  const targets = document.querySelectorAll('.reveal');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Compteur 0 → valeur pour les métriques de la carte Massy Innove (100%, 0…),
  // déclenché une fois quand la tuile devient visible.
  function animateCountUp(el) {
    const match = el.textContent.trim().match(/^(\d+)(.*)$/);
    if (!match) return;
    const target = parseInt(match[1], 10);
    const suffix = match[2];
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        if (!reduceMotion && entry.target.classList.contains('dp-bt--metrics') && entry.target.closest('.dp-fam--massy')) {
          entry.target.querySelectorAll('.dp-bt-metric b').forEach(animateCountUp);
        }
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  targets.forEach((el) => observer.observe(el));
})();

// Léger tilt 3D de la maquette chat au survol de la carte Massy Innove : suit
// la position de la souris dans la tuile, désactivé au tactile / reduced-motion.
(function initFeatureTilt() {
  const tile = document.querySelector('.dp-fam--massy .xp-tile--feature');
  const mock = tile && tile.querySelector('.xp-mock--chat');
  if (!mock) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const MAX_DEG = 6;
  mock.style.transition = 'transform .25s ease-out';
  tile.addEventListener('mousemove', (e) => {
    const rect = tile.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mock.style.transform = `rotateX(${(-y * MAX_DEG).toFixed(2)}deg) rotateY(${(x * MAX_DEG).toFixed(2)}deg)`;
  });
  tile.addEventListener('mouseleave', () => {
    mock.style.transform = '';
  });
})();

// Snap plus lent entre les cartes : le scroll-snap natif du CSS anime toujours au même
// tempo (rapide, non réglable), donc on prend la main sur la molette/le tactile pour
// glisser d'une carte à l'autre avec une durée et un easing choisis, façon carrousel.
(function initSlideScroll() {
  // Le hero (accueil) fait partie de la séquence : il doit aussi s'accrocher au
  // scroll, pas juste les cartes, sinon on reste bloqué en sortant de la 1ère carte.
  // Les 4 piliers du bloc bleu (#security, #sysadmin, #infra, #dev) en sont exclus :
  // ils se parcourent désormais en carrousel horizontal (voir initCompetenceCarousel
  // plus bas), pas en défilement vertical plein écran carte par carte.
  const hero = document.getElementById('dp-hero');
  const slideEls = Array.from(document.querySelectorAll('.dp-slide')).filter((el) => !el.closest('.dp-blue-block-wrap'));
  const slides = [hero, ...slideEls].filter(Boolean);
  // Depuis le passage de l'expérience en grilles bento (défilement libre), il ne reste
  // que le hero dans cette séquence : sans au moins deux slides, le calage molette n'a
  // plus de sens et renverrait par erreur vers le hero au moindre scroll vers le haut.
  if (slides.length < 2) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Le bloc bleu (défilement libre) s'intercale entre le hero et #massy-innove : ces deux-là
  // ne sont donc plus des voisins directs. gapAfter[i] signale un tel "trou" entre
  // slides[i] et slides[i+1] — sur cette paire, on n'accroche pas la molette, pour laisser
  // le scroll natif traverser librement tout le bloc bleu.
  let gapAfter = [];
  function computeGaps() {
    gapAfter = slides.map((el, i) => {
      if (i === slides.length - 1) return false;
      const rect = el.getBoundingClientRect();
      const nextRect = slides[i + 1].getBoundingClientRect();
      return (nextRect.top - rect.bottom) > window.innerHeight * 0.5;
    });
  }
  computeGaps();
  window.addEventListener('resize', computeGaps);

  const DURATION = 550; // ms — augmente/diminue pour ralentir/accélérer la transition
  let animating = false;
  let raf = null;

  // Démarre vite (réponse immédiate à l'action de l'utilisateur), ralentit en arrivant.
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // Carte dont le centre est le plus proche du centre du viewport.
  function closestSlide() {
    const mid = window.scrollY + window.innerHeight / 2;
    let best = 0, bestDist = Infinity;
    slides.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const center = window.scrollY + rect.top + rect.height / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    return { index: best, dist: bestDist };
  }

  // Index "logique" de la position actuelle. Au-delà de la dernière slide (dans #contact
  // ou le pied de page), closestSlide() renverrait quand même le dernier index par simple
  // proximité — et remonter d'un cran depuis là sauterait carrément la dernière carte au
  // lieu d'y revenir en premier. On renvoie donc slides.length pour signaler "après la fin".
  function currentIndex() {
    const mid = window.scrollY + window.innerHeight / 2;
    const lastRect = slides[slides.length - 1].getBoundingClientRect();
    if (mid > window.scrollY + lastRect.bottom) return slides.length;
    return closestSlide().index;
  }

  function scrollToSlide(index) {
    index = Math.max(0, Math.min(slides.length - 1, index));
    const target = slides[index];
    const rect = target.getBoundingClientRect();
    const targetY = window.scrollY + rect.top - Math.max(0, (window.innerHeight - rect.height) / 2);
    const startY = window.scrollY;
    const delta = targetY - startY;
    if (Math.abs(delta) < 2) return;

    animating = true;
    if (raf) cancelAnimationFrame(raf);
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / DURATION);
      window.scrollTo(0, startY + delta * easeOutCubic(t));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        animating = false;
      }
    }
    raf = requestAnimationFrame(step);
  }

  // Toujours un slide à la fois, peu importe la distance (pas de zone morte à traverser
  // en scroll natif avant que l'effet ne s'enclenche). Seule exception : si on est déjà
  // sur la première/dernière slide et qu'on continue dans le sens qui en sortirait (vers
  // le pied de page tout en bas), on laisse le scroll natif faire son travail.
  window.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) < 2) return;
    const index = currentIndex();
    // Après la dernière slide (dans #contact) et on remonte : revenir sur la dernière
    // carte d'abord, pas sur l'avant-dernière (index serait déjà slides.length).
    const nextIndex = index >= slides.length && e.deltaY < 0 ? slides.length - 1 : index + (e.deltaY > 0 ? 1 : -1);
    if (nextIndex < 0 || nextIndex > slides.length - 1) return;
    if (gapAfter[Math.min(index, nextIndex)]) return; // trou (bloc bleu) : scroll natif
    e.preventDefault();
    if (animating) return;
    scrollToSlide(nextIndex);
  }, { passive: false });

  let touchStartY = null;
  window.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (touchStartY === null || animating) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    touchStartY = null;
    if (Math.abs(dy) < 40) return;
    const index = currentIndex();
    const nextIndex = index >= slides.length && dy < 0 ? slides.length - 1 : index + (dy > 0 ? 1 : -1);
    if (nextIndex < 0 || nextIndex > slides.length - 1) return;
    if (gapAfter[Math.min(index, nextIndex)]) return; // trou (bloc bleu) : scroll natif déjà appliqué
    scrollToSlide(nextIndex);
  }, { passive: true });
})();

// Carrousel des 4 piliers de compétences (bloc bleu) : un seul panneau visible à la fois,
// piloté par transform sur le track. Les liens qui pointent vers un des 4 (boutons
// précédent/suivant de chaque carte, rail de nav, arborescence du hero) sont détournés
// pour changer de panneau plutôt que de sauter d'ancre en ancre — un lien qui pointe
// ailleurs (ex. #dp-hero, #massy-innove) continue de faire un scroll d'ancre classique.
(function initCompetenceCarousel() {
  const carousel = document.getElementById('dp-carousel-competences');
  if (!carousel) return;
  const track = carousel.querySelector('.dp-carousel-track');
  const panels = Array.from(track.children).filter((el) => el.classList.contains('dp-slide'));
  const dots = Array.from(document.querySelectorAll('.dp-carousel-dot'));
  const idToIndex = new Map(panels.map((el, i) => [el.id, i]));
  const pillarLabel = document.querySelector('.dp-pillar-label');
  const pillarIcon = document.querySelector('.dp-pillar-icon');
  const pillarTitle = document.querySelector('.dp-pillar-title');
  const floaterSets = Array.from(document.querySelectorAll('.dp-pillar-floater-set'));
  let index = 0;
  let first = true;

  function setPillarLabel() {
    if (!pillarIcon || !pillarTitle) return;
    const panel = panels[index];
    const icon = panel && panel.querySelector('.dp-entry-icon svg');
    const title = panel && panel.querySelector('.dp-entry-titles h3');
    pillarIcon.innerHTML = icon ? icon.outerHTML : '';
    pillarTitle.textContent = title ? title.textContent : '';
  }

  // Effet machine à écrire sur le récit de chaque compétence : chaque caractère
  // est isolé dans un <span> (une seule fois, au chargement) pour pouvoir lui
  // donner un délai d'apparition croissant (--i) ; .is-strong ajoutée/retirée à
  // chaque changement de carte pour rejouer l'effet, dans l'esprit "terminal"
  // du reste du site. <img>/<strong> restent intacts, seul leur texte est éclaté.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function wrapStoryChars(story) {
    if (!story || story.dataset.typingReady) return;
    let i = 0;
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        Array.from(node.textContent).forEach((ch) => {
          const span = document.createElement('span');
          span.className = 'dp-type-ch';
          span.style.setProperty('--i', i++);
          span.textContent = ch;
          frag.appendChild(span);
        });
        node.replaceWith(frag);
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'IMG') {
        Array.from(node.childNodes).forEach(walk);
      }
    }
    Array.from(story.childNodes).forEach(walk);
    story.dataset.typingReady = 'true';
  }
  function playTyping(panel) {
    if (reduceMotion) return;
    const story = panel && panel.querySelector('.dp-entry-story');
    if (!story) return;
    story.classList.remove('is-typing');
    void story.offsetWidth; // force le navigateur à repartir de zéro avant de relancer
    story.classList.add('is-typing');
  }
  if (!reduceMotion) {
    panels.forEach((panel) => wrapStoryChars(panel.querySelector('.dp-entry-story')));
  }

  function apply() {
    panels.forEach((el, i) => {
      el.classList.toggle('is-active', i === index);
      el.setAttribute('aria-hidden', i === index ? 'false' : 'true');
    });
    dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
    floaterSets.forEach((el) => el.classList.toggle('is-active', Number(el.dataset.index) === index));
    playTyping(panels[index]);

    // Icône + titre du pilier actif recopiés depuis la carte elle-même (source
    // unique dans le DOM), plutôt que dupliqués en dur ici. Petit fondu enchaîné
    // à chaque changement (voir .dp-pillar-label.is-switching dans details.css)
    // pour ne pas juste couper l'ancien contenu et coller le nouveau.
    if (!pillarLabel || first) {
      setPillarLabel();
      first = false;
      return;
    }
    pillarLabel.classList.add('is-switching');
    window.setTimeout(() => {
      setPillarLabel();
      pillarLabel.classList.remove('is-switching');
    }, 220);
  }

  function goTo(i) {
    index = (i + panels.length) % panels.length;
    apply();
  }

  dots.forEach((d) => {
    d.addEventListener('click', () => goTo(Number(d.dataset.carouselIndex)));
  });

  const prevBtn = carousel.querySelector('.dp-carousel-arrow--prev');
  const nextBtn = carousel.querySelector('.dp-carousel-arrow--next');
  if (prevBtn) prevBtn.addEventListener('click', () => goTo(index - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => goTo(index + 1));

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const targetId = a.getAttribute('href').slice(1);
    if (!idToIndex.has(targetId)) return;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      goTo(idToIndex.get(targetId));
      carousel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // Arrivée directe depuis un lien externe (ex. les piliers de la page d'accueil)
  // avec un hash déjà présent dans l'URL : ouvrir le bon panneau dès le chargement.
  const initialId = window.location.hash.slice(1);
  if (idToIndex.has(initialId)) index = idToIndex.get(initialId);

  apply();
})();

// Surligne dans le sommaire l'entrée correspondant à la carte actuellement au centre
// du viewport ; un clic sur un lien la marque aussi tout de suite (avant l'arrivée).
(function initSideNavSpy() {
  const nav = document.getElementById('dp-side-nav');
  if (!nav) return;
  const links = Array.from(nav.querySelectorAll('a[data-target]'));
  const entries = links
    .map((a) => ({ link: a, section: document.getElementById(a.dataset.target) }))
    .filter((e) => e.section);
  if (!entries.length) return;

  function setActive(link) {
    links.forEach((a) => a.classList.toggle('is-active', a === link));
  }

  const observer = new IntersectionObserver((obsEntries) => {
    obsEntries.forEach((obsEntry) => {
      if (!obsEntry.isIntersecting) return;
      const match = entries.find((e) => e.section === obsEntry.target);
      if (match) setActive(match.link);
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  entries.forEach((e) => observer.observe(e.section));

  // clic : surlignage immédiat, sans attendre que l'observer rattrape le scroll fluide
  links.forEach((link) => {
    link.addEventListener('click', () => setActive(link));
  });
})();

// Icônes flottantes autour du pilier de compétences : rejoue à chaque passage dans
// le viewport (pas d'unobserve), comme initSkillFloaterObserver sur la page d'accueil.
(function initPillarFloaterObserver() {
  const target = document.querySelector('.dp-blue-block');
  if (!target) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle('icons-live', entry.isIntersecting);
    });
  }, { threshold: 0.15 });
  observer.observe(target);
})();

// Terminal du hero : champ de saisie utilisable pour sauter à un fichier (Entrée),
// et Tab / Shift+Tab pour parcourir les onglets (fichiers) de la page dans l'ordre.
(function initTermInput() {
  const input = document.getElementById('dp-term-input');
  const row = document.getElementById('dp-term-input-row');
  const nav = document.getElementById('dp-side-nav');
  if (!input || !row || !nav) return;

  const links = Array.from(nav.querySelectorAll('a[data-target]'));
  const entries = links
    .map((link) => ({ link, section: document.getElementById(link.dataset.target) }))
    .filter((e) => e.section);
  if (!entries.length) return;

  const normalize = (str) => str
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

  let index = -1;

  function setActive(i) {
    links.forEach((a, j) => a.classList.toggle('is-active', j === i));
  }

  // Tab : sélectionne seulement (remplit le champ), sans quitter la page.
  function select(i) {
    index = ((i % entries.length) + entries.length) % entries.length;
    const entry = entries[index];
    input.value = entry.link.querySelector('span').textContent;
    row.classList.toggle('has-value', input.value.length > 0);
  }

  // Entrée : saute réellement vers le fichier actuellement dans le champ.
  function navigate() {
    const query = normalize(input.value);
    if (!query) return;
    const match = entries.findIndex((entry) => normalize(entry.link.querySelector('span').textContent).includes(query));
    if (match === -1) return;
    index = match;
    entries[match].section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(match);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      select(index + (e.shiftKey ? -1 : 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      navigate();
    }
  });

  input.addEventListener('input', () => {
    row.classList.toggle('has-value', input.value.length > 0);
  });

  // clic sur un fichier du sommaire : synchronise l'index courant du champ
  links.forEach((link, i) => {
    link.addEventListener('click', () => { index = i; });
  });
})();

// Rail de navigation (dupliqué depuis sections/nav.html) : indicateur qui suit la
// section visible. Les liens qui pointent vers index.html#... n'ont pas de cible sur
// cette page et sont simplement ignorés par l'observer, sans erreur.
(function initDotRailSpy() {
  const tabs = document.querySelectorAll('.dot-rail a[href^="#"]');
  const indicator = document.querySelector('.dot-rail-indicator');
  if (!tabs.length) return;
  // Un onglet peut représenter plusieurs sections à la fois (ex. "Compétences détaillées"
  // regroupe les 4 piliers du carrousel) via data-sections, en plus de sa cible href.
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
    // Ignoré tout en bas de page : #contact peut être plus courte que la fenêtre restante
    // et ne jamais traverser la bande -40%/-55% du rootMargin, cf. le correctif juste après.
    if (isAtBottom()) return;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const tab = sectionToTab.get(entry.target);
      if (!tab) return;
      activate(tab);
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sectionToTab.forEach((tab, section) => observer.observe(section));
  moveIndicatorTo(tabs[0]);

  // Filet de sécurité : tout en bas de la page, la dernière section (#contact) n'est pas
  // forcément assez haute pour traverser la bande centrale surveillée par l'observer — on
  // force alors l'activation du dernier onglet plutôt que de laisser le précédent actif.
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

// Bouton "remonter en haut" : visible dès qu'on a quitté l'en-tête de la page.
(function initBackToTop() {
  const btn = document.querySelector('.back-to-top');
  const hero = document.getElementById('dp-hero');
  if (!btn || !hero) return;

  function update() {
    btn.classList.toggle('is-visible', window.scrollY > hero.offsetHeight * 0.5);
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
})();

// Adaptation à la couleur de fond : quand le rail de nav (points + indicateur), le bouton
// "remonter en haut" ou page-tag passent devant un bandeau bleu (#contact, le bloc bleu
// des 4 piliers de compétences, ou les deux rubans inclinés de la section stack), ils
// basculent en teintes claires (classe .is-on-dark, stylée dans styles.css) pour rester lisibles.
(function initOnDarkAdaptation() {
  const contact = document.getElementById('contact');
  const blueBlock = document.querySelector('.dp-blue-block');
  const stackBanners = Array.from(document.querySelectorAll('.dp-stack-banner'));
  const railLinks = document.querySelectorAll('.dot-rail a');
  const indicator = document.querySelector('.dot-rail-indicator');
  const backToTop = document.querySelector('.back-to-top');
  const pageTag = document.querySelector('.page-tag');
  if (!contact && !blueBlock && !stackBanners.length) return;

  // Résout une longueur CSS (clamp(), calc(), var()...) en px réels, en la posant sur une
  // propriété de layout normale (height) d'une sonde hors-écran : contrairement à
  // parseFloat(getComputedStyle(el).getPropertyValue('--xxx')), qui échoue silencieusement
  // dès que la custom property contient autre chose qu'un nombre nu (ex: "clamp(160px,
  // 22vw, 360px)" pour --contact-slope), le moteur de layout résout toujours une hauteur
  // en un nombre de px. La sonde doit être ajoutée DANS l'élément qui définit la custom
  // property (ex: --dp-slope est posée sur .dp-blue-block elle-même, pas sur :root) :
  // les custom properties descendent aux enfants, jamais vers un ancêtre comme document.body.
  function resolveCSSLength(value, container) {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute; visibility:hidden; pointer-events:none; height:${value};`;
    (container || document.body).appendChild(probe);
    const px = probe.getBoundingClientRect().height;
    probe.remove();
    return px;
  }

  let blueSlope = blueBlock ? resolveCSSLength('var(--dp-slope)', blueBlock) : 0;
  let contactSlope = resolveCSSLength('var(--contact-slope)');
  window.addEventListener('resize', () => {
    blueSlope = blueBlock ? resolveCSSLength('var(--dp-slope)', blueBlock) : 0;
    contactSlope = resolveCSSLength('var(--contact-slope)');
  });

  // Un ruban stack est tourné (rotate(±deg)) autour de son propre centre : sa
  // getBoundingClientRect() ne donne que la boîte englobante axis-aligned, plus grande
  // que le rectangle réellement peint. Comme ce centre de rotation ne bouge pas sous
  // transform, il coïncide avec le centre de cette boîte englobante ; et offsetWidth /
  // offsetHeight restent les dimensions du rectangle AVANT rotation (les transforms ne
  // touchent pas le layout box). On peut donc reprojeter le point testé dans le repère
  // local non tourné du ruban et faire un test rectangle classique, précis au pixel près
  // sur l'arête diagonale plutôt que sur la boîte englobante.
  function bannerAngleRad(el) {
    const t = getComputedStyle(el).transform;
    const m = t && t.match(/^matrix\(([^,]+),\s*([^,]+),/);
    if (!m) return 0;
    return Math.atan2(parseFloat(m[2]), parseFloat(m[1]));
  }

  function insideBanner(el, x, y) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const angle = bannerAngleRad(el);
    const dx = x - cx;
    const dy = y - cy;
    const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
    const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
    return Math.abs(localX) <= el.offsetWidth / 2 && Math.abs(localY) <= el.offsetHeight / 2;
  }

  // side: 'right' pour les éléments proches du bord droit (rail, bouton), 'left' pour
  // ceux proches du bord gauche (page-tag) — la pente est inversée entre les deux bords
  // (voir clip-path de .dp-blue-block-fill et .contact-fill dans details.css).
  function overDarkZone(x, y, side) {
    if (contact) {
      const r = contact.getBoundingClientRect();
      if (side === 'left') {
        if (y > r.top + contactSlope && y < r.bottom) return true;
      } else if (y > r.top && y < r.bottom) {
        return true;
      }
    }
    if (blueBlock) {
      const r = blueBlock.getBoundingClientRect();
      if (side === 'left') {
        if (y > r.top + blueSlope && y < r.bottom) return true;
      } else if (y > r.top && y < r.bottom - blueSlope) {
        return true;
      }
    }
    for (const banner of stackBanners) {
      if (insideBanner(banner, x, y)) return true;
    }
    return false;
  }

  function toggle(el, side) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    el.classList.toggle('is-on-dark', overDarkZone(cx, cy, side));
  }

  function update() {
    railLinks.forEach((el) => toggle(el, 'right'));
    toggle(indicator, 'right');
    toggle(backToTop, 'right');
    toggle(pageTag, 'left');
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  // Le bloc bleu et #contact bougent encore quelques frames après l'arrêt du scroll
  // (lissage du parallax, cf. initCompetencesParallax) : on recalcule aussi sur ce tick
  // pour que la teinte claire/foncée reste calée sur leur position réelle jusqu'au repos.
  window.addEventListener('parallax-tick', update);
})();

// Flèche "défiler vers le bas" du header : se cache dès qu'on quitte le haut de page.
(function initScrollDownButton() {
  const btn = document.querySelector('.scroll-down');
  if (!btn) return;

  function update() {
    btn.classList.toggle('is-hidden', window.scrollY > 10);
  }

  update();
  window.addEventListener('scroll', update, { passive: true });
})();

// Ligne décorative de fond : une seule vague sinueuse continue, générée aux dimensions
// réelles de la page (longueur d'onde constante du haut en bas), puis « dessinée » selon
// la progression du scroll (stroke-dashoffset de 1 → 0, longueur normalisée via pathLength="1").
(function initBgLine() {
  const svg = document.querySelector('.dp-bg-line');
  const path = document.querySelector('.dp-bg-line-path');
  if (!svg || !path) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document.documentElement;

  // Ligne dessinée à la main via draw-line.html : points normalisés [x∈0..1, y∈0..1].
  // Laisse le tableau vide pour utiliser le méandre généré automatiquement plus bas.
  const CUSTOM_LINE = [[0.1721,0.0021],[0.1926,0.0032],[0.2074,0.0086],[0.2221,0.0129],[0.2426,0.0172],[0.2603,0.0215],[0.2779,0.0258],[0.2956,0.029],[0.3132,0.0333],[0.3309,0.0376],[0.3515,0.043],[0.3662,0.0473],[0.3809,0.0526],[0.4015,0.058],[0.4162,0.0623],[0.4309,0.0666],[0.4485,0.0709],[0.4662,0.0752],[0.4809,0.0795],[0.4956,0.0859],[0.5074,0.0924],[0.5132,0.101],[0.5279,0.1074],[0.5397,0.1139],[0.5515,0.1225],[0.5544,0.13],[0.5574,0.1386],[0.5662,0.1461],[0.5691,0.1547],[0.5721,0.1622],[0.5779,0.1708],[0.5838,0.1794],[0.5868,0.1869],[0.5868,0.1944],[0.5926,0.203],[0.5956,0.2116],[0.5956,0.2191],[0.5956,0.2267],[0.5956,0.2353],[0.5956,0.2428],[0.5956,0.2514],[0.5926,0.2589],[0.5868,0.2675],[0.5779,0.275],[0.5632,0.2836],[0.5515,0.2922],[0.5368,0.2986],[0.5221,0.3062],[0.5015,0.3115],[0.4838,0.3147],[0.4662,0.319],[0.4485,0.319],[0.4309,0.3223],[0.4132,0.3244],[0.3956,0.3255],[0.375,0.3255],[0.3544,0.3255],[0.3338,0.3244],[0.3162,0.3212],[0.2985,0.319],[0.2838,0.3137],[0.275,0.3051],[0.2662,0.2976],[0.2662,0.29],[0.2632,0.2825],[0.2691,0.275],[0.2868,0.2718],[0.3074,0.2686],[0.3279,0.2675],[0.3456,0.2675],[0.3632,0.2675],[0.3838,0.2686],[0.4015,0.2696],[0.4191,0.2729],[0.4368,0.2771],[0.4515,0.2814],[0.4691,0.2857],[0.4809,0.2922],[0.4926,0.2986],[0.5015,0.3062],[0.5132,0.3126],[0.5279,0.319],[0.5397,0.3255],[0.5515,0.3319],[0.5662,0.3373],[0.5809,0.3438],[0.5985,0.348],[0.6132,0.3523],[0.6279,0.3566],[0.6456,0.3609],[0.6662,0.3642],[0.6868,0.3685],[0.7074,0.3738],[0.725,0.3781],[0.7397,0.3835],[0.7544,0.3889],[0.7662,0.3953],[0.775,0.4028],[0.7838,0.4104],[0.7868,0.4179],[0.7868,0.4254],[0.7897,0.434],[0.7897,0.4415],[0.7926,0.4512],[0.7926,0.4587],[0.7926,0.4662],[0.7838,0.4737],[0.7691,0.4802],[0.7603,0.4877],[0.7485,0.4952],[0.7338,0.5006],[0.7221,0.5092],[0.7132,0.5178],[0.7044,0.5253],[0.6897,0.5328],[0.675,0.5393],[0.6632,0.5457],[0.6485,0.5511],[0.6338,0.5564],[0.6132,0.564],[0.5985,0.5693],[0.5838,0.5747],[0.5691,0.5801],[0.5544,0.5844],[0.5397,0.5887],[0.525,0.593],[0.5044,0.5983],[0.4897,0.6048],[0.475,0.6102],[0.4603,0.6155],[0.4426,0.6209],[0.4221,0.6284],[0.4074,0.6349],[0.3956,0.6413],[0.3838,0.6478],[0.3721,0.6542],[0.3574,0.6617],[0.3426,0.6671],[0.3309,0.6746],[0.3191,0.6821],[0.3074,0.6886],[0.2956,0.6972],[0.2838,0.7068],[0.2779,0.7144],[0.2691,0.7219],[0.2662,0.7294],[0.2632,0.7369],[0.2632,0.7455],[0.2632,0.753],[0.2632,0.7616],[0.2632,0.7691],[0.2632,0.7777],[0.2721,0.7853],[0.2779,0.7928],[0.2868,0.8003],[0.2985,0.8078],[0.3103,0.8164],[0.3279,0.8229],[0.3426,0.8282],[0.3574,0.8336],[0.375,0.8368],[0.3926,0.8411],[0.4132,0.8443],[0.4309,0.8476],[0.4485,0.8497],[0.4662,0.8519],[0.4838,0.854],[0.5015,0.854],[0.5191,0.8551],[0.5397,0.8551],[0.5632,0.8562],[0.5809,0.8562],[0.5985,0.8594],[0.6191,0.8605],[0.6368,0.8626],[0.6544,0.8669],[0.675,0.8712],[0.6897,0.8766],[0.7015,0.883],[0.7103,0.8905],[0.7132,0.898],[0.7162,0.9056],[0.7162,0.9131],[0.7162,0.9228],[0.7162,0.9303],[0.7103,0.9389],[0.7044,0.9464],[0.6926,0.9539],[0.6691,0.9647],[0.6515,0.97],[0.6368,0.9743],[0.625,0.9808],[0.6103,0.9851],[0.5956,0.9904],[0.5779,0.9958]];

  const SEED = 20260706; // graine fixe : le tracé est aléatoire mais stable d'un chargement à l'autre
  const STEP = 26;       // pas d'échantillonnage vertical (px) — plus petit = courbe plus fine
  const TOP_FRAC = 1;   // part du 1er écran déjà tracée au chargement (0 = rien, 1 = tout l'écran)
  const SPEED = 1.5;    // 1 = linéaire (suit le scroll au pixel près) ; > 1 = plus lent

  // Générateur pseudo-aléatoire déterministe (mulberry32) : même graine → même courbe.
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Construit un MÉANDRE organique : x est fonction de y via une somme de sinusoïdes de
  // longueurs d'onde et de phases distinctes (« octaves »). Leur superposition serpente
  // naturellement — tantôt ample, tantôt calme, sans jamais forcer les bords ni se répéter.
  // On échantillonne la courbe puis on la lisse (quadratiques passant par les milieux).
  // Moyenne glissante : lisse les tremblements d'un tracé fait à la main en remplaçant
  // chaque point par la moyenne de ses voisins (fenêtre ±win). Les extrémités sont figées.
  function averagePoints(pts, win) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      let sx = 0, sy = 0, n = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(pts.length - 1, i + win); j++) {
        sx += pts[j].x; sy += pts[j].y; n++;
      }
      out.push({ x: sx / n, y: sy / n });
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Lissage commun : quadratiques dont chaque sommet est un point et chaque fin le milieu
  // du segment suivant → courbe continue et douce (C1), sans angle.
  function smooth(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const mx = ((p.x + pts[i + 1].x) / 2).toFixed(1);
      const my = ((p.y + pts[i + 1].y) / 2).toFixed(1);
      d += ` Q${p.x.toFixed(1)},${p.y.toFixed(1)} ${mx},${my}`;
    }
    const last = pts[pts.length - 1];
    d += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
    return d;
  }

  function buildPath(width, height) {
    // Priorité à la ligne dessinée à la main : on remet les points normalisés à l'échelle
    // de la page (x×largeur, y×hauteur) puis on les lisse.
    if (CUSTOM_LINE.length >= 2) {
      // Deux passes de moyenne glissante à large fenêtre ≈ lissage gaussien : gomme
      // fortement les tremblements du tracé fait à la main sans écraser sa forme.
      let pts = CUSTOM_LINE.map(([nx, ny]) => ({ x: nx * width, y: ny * height }));
      pts = averagePoints(averagePoints(pts, 6), 6);
      // Prolonge les deux extrémités hors du cadre, dans la continuité de la courbe, pour
      // que le ruban entre/sorte franchement par les bords (l'embout arrondi part hors écran,
      // masqué par le SVG) plutôt que de finir sur un bout coupé net en haut et en bas.
      const margin = Math.max(320, height * 0.04);
      const extend = (tip, inner) => {
        const dx = tip.x - inner.x, dy = tip.y - inner.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x: tip.x + (dx / len) * margin, y: tip.y + (dy / len) * margin };
      };
      const head = extend(pts[0], pts[1]);
      const tail = extend(pts[pts.length - 1], pts[pts.length - 2]);
      return smooth([head, ...pts, tail]);
    }

    const rng = makeRng(SEED);
    const rand = (min, max) => min + rng() * (max - min);
    const cx = width / 2;
    const edge = width * 0.08; // la ligne reste toujours à ≥ 8 % des bords

    // 4 octaves : une lente dérive de fond, deux ondulations moyennes qui donnent le
    // caractère, une petite pour un léger frémissement. Amplitudes en fraction de largeur.
    const octaves = [
      { amp: width * 0.20, wave: rand(1100, 1500), phase: rng() * Math.PI * 2 },
      { amp: width * 0.15, wave: rand(560, 760),   phase: rng() * Math.PI * 2 },
      { amp: width * 0.09, wave: rand(300, 420),   phase: rng() * Math.PI * 2 },
      { amp: width * 0.04, wave: rand(150, 210),   phase: rng() * Math.PI * 2 },
    ];

    const xAt = (y) => {
      let x = cx;
      for (const o of octaves) x += o.amp * Math.sin((2 * Math.PI * y) / o.wave + o.phase);
      return Math.min(Math.max(x, edge), width - edge);
    };

    // Points échantillonnés régulièrement, dernier calé pile en bas de page.
    const pts = [];
    for (let y = 0; y < height; y += STEP) pts.push({ x: xAt(y), y });
    pts.push({ x: xAt(height), y: height });

    return smooth(pts);
  }

  function resize() {
    const width = svg.clientWidth || window.innerWidth;
    const height = doc.scrollHeight;
    svg.style.height = height + 'px';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); // 1:1 avec les px → aucune déformation
    path.setAttribute('d', buildPath(width, height));
  }

  function draw() {
    if (reduce) return; // ligne pleine, gérée en CSS
    // Courbe unique en t^SPEED (ease-in) : la progression reste faible sur la majeure
    // partie du scroll et ne rattrape qu'en approchant du bas de page. `base` garde un
    // tout petit bout de trait visible dès le chargement (haut de page).
    const total = doc.scrollHeight;
    const maxScroll = Math.max(total - window.innerHeight, 1);
    const base = total > 0 ? Math.min((window.innerHeight * TOP_FRAC) / total, 1) : 1;
    const t = Math.min(window.scrollY / maxScroll, 1);
    const progress = base + (1 - base) * Math.pow(t, SPEED);
    path.style.strokeDashoffset = String(1 - Math.min(progress, 1));
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { draw(); ticking = false; });
  }

  resize();
  draw();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { resize(); draw(); });
})();

// Parcourt le DOM et remplace le contenu de chaque élément [data-i18n]/[data-i18n-attr]
// par la traduction correspondante — même logique que applyTranslations dans main.js
// (accueil), dupliquée ici car cette page n'a pas de dépendance au SPA de l'accueil.
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

// Sélecteur de langue : bascule FR/EN/ES du bouton drapeau, comme sur l'accueil
// (initLangSwitch dans main.js), mais toujours en français au chargement de la page.
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

  function updateAtTop() {
    btn.classList.toggle('is-at-top', window.scrollY <= 10);
  }
  updateAtTop();
  window.addEventListener('scroll', updateAtTop, { passive: true });

  btn.addEventListener('click', () => {
    const next = LANGS[(LANGS.indexOf(btn.dataset.lang) + 1) % LANGS.length];
    apply(next);
  });
})();
