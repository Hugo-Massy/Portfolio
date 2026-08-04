/* ============================================================
   CURSEUR PERSONNALISÉ — le curseur système est remplacé par un simple point
   bleu qui suit le pointeur, et qui passe au blanc dès qu'il survole une zone
   sombre (bandeaux bleus, terminal, cartes foncées) pour rester visible.

   Uniquement sur pointeur fin (souris / trackpad) : sur tactile, il n'y a pas
   de pointeur à remplacer, on ne touche à rien.
   ============================================================ */
(function initCustomCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  dot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(dot);
  document.documentElement.classList.add('has-custom-cursor');

  // Calques décoratifs des zones sombres : ils sont en pointer-events:none (ils ne doivent
  // pas intercepter les clics), donc elementsFromPoint ne les voit JAMAIS. On les teste
  // séparément, à la géométrie (cf. surfaceCoversPoint plus bas).
  const FILL_SELECTOR = '.contact-fill, .section-divider-bar, .dp-blue-block-fill, .dp-stack-banner';
  const fills = Array.from(document.querySelectorAll(FILL_SELECTOR));

  // Champs de saisie : on y rend la main au curseur système (le I-beam et le caret sont
  // des repères qu'un point ne remplace pas).
  const TEXT_FIELD_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  const INTERACTIVE_SELECTOR = 'a, button, [role="button"], summary, label, .btn, [data-cursor="hover"]';

  /* ---------- géométrie des calques décoratifs ---------- */

  // Angle de rotation appliqué à l'élément, en radians (0 si aucune rotation) : lu sur la
  // matrice calculée, dont les deux premiers coefficients sont (cos θ, sin θ).
  function rotationOf(el) {
    const t = getComputedStyle(el).transform;
    const m = t && t.match(/^matrix\(([^,]+),\s*([^,]+),/);
    return m ? Math.atan2(parseFloat(m[2]), parseFloat(m[1])) : 0;
  }

  // Reprojette un point viewport dans le repère local NON tourné de l'élément (origine en
  // haut à gauche de sa boîte de bordure). Le centre de rotation ne bouge pas sous
  // transform : il coïncide avec le centre de la boîte englobante renvoyée par
  // getBoundingClientRect(), tandis que offsetWidth/offsetHeight restent les dimensions
  // d'avant rotation (les transforms ne touchent pas la boîte de layout). D'où un test
  // précis sur l'arête réelle, et pas sur la boîte englobante axis-aligned.
  function toLocalPoint(el, x, y) {
    const r = el.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    const a = rotationOf(el);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      x: dx * cos + dy * sin + el.offsetWidth / 2,
      y: -dx * sin + dy * cos + el.offsetHeight / 2,
    };
  }

  // Résout une coordonnée de polygone clip-path ("120px" ou "37%") en px locaux.
  function resolveCoord(token, size) {
    if (token.endsWith('%')) return (parseFloat(token) / 100) * size;
    return parseFloat(token);
  }

  // Points du clip-path polygon() de l'élément, en coordonnées locales — null s'il n'a pas
  // de clip (l'élément couvre alors toute sa boîte). La valeur calculée a déjà résolu les
  // calc()/var(), il ne reste que des px et des %.
  function clipPolygon(el, w, h) {
    const clip = getComputedStyle(el).clipPath;
    const m = clip && clip.match(/^polygon\(([^)]*)\)$/);
    if (!m) return null;
    return m[1].split(',').map((pair) => {
      const [px, py] = pair.trim().split(/\s+/);
      return [resolveCoord(px, w), resolveCoord(py, h)];
    });
  }

  // Lancer de rayon horizontal classique : impair = dedans.
  function pointInPolygon(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Vrai si le calque décoratif `el` peint réellement le point (x, y) : dans sa boîte une
  // fois la rotation défaite, ET dans son polygone de découpe s'il en a un (les bandeaux
  // bleus ont tous une diagonale — sans ce test, le point virerait au blanc dès la boîte
  // englobante, donc bien avant le bleu).
  function surfaceCoversPoint(el, x, y) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return false;
    const p = toLocalPoint(el, x, y);
    if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return false;
    const poly = clipPolygon(el, w, h);
    return poly ? pointInPolygon(poly, p.x, p.y) : true;
  }

  // Écran de préchargement (#preloader, index.html) : une forme bleue organique
  // (.preloader-blob) suit le curseur avec un léger retard "ressort" (voir initPreloaderBlob
  // dans main.js) et le recouvre — le point doit donc y devenir blanc lui aussi. Elle est en
  // pointer-events:none (purement décorative), donc absente d'elementsFromPoint comme les
  // autres calques ; mais contrairement aux bandeaux, sa position suit le pointeur en continu
  // plutôt que le scroll, donc on la teste séparément, à chaque frame, plutôt que via `fills`.
  const preloaderBlob = document.querySelector('.preloader-blob');
  const preloaderBlobShape = document.querySelector('.preloader-blob-shape');

  // Vrai si (x, y) tombe dans l'ellipse peinte par le blob. border-radius lui donne un
  // contour organique irrégulier plutôt qu'un cercle parfait, mais une ellipse inscrite dans
  // sa boîte réelle (post-transform, donc étirement compris) en est une approximation large-
  // ment assez fidèle pour ce qui n'est qu'un indice de contraste.
  function insidePreloaderBlob(x, y) {
    if (!preloaderBlob || !preloaderBlobShape || !preloaderBlob.classList.contains('is-active')) {
      return false;
    }
    const r = preloaderBlobShape.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const nx = (x - cx) / (r.width / 2);
    const ny = (y - cy) / (r.height / 2);
    return nx * nx + ny * ny <= 1;
  }

  /* ---------- luminance du fond sous le pointeur ---------- */

  // Couleur de fond opaque de l'élément, ou null s'il est (quasi) transparent : dans ce cas
  // c'est le fond de ce qu'il y a derrière qui compte, on continue à descendre la pile.
  function opaqueBackground(el) {
    const c = getComputedStyle(el).backgroundColor;
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(parseFloat);
    if (parts.length > 3 && parts[3] < 0.6) return null;
    return parts;
  }

  // Luminance relative (WCAG) : en dessous de 0.45, on considère le fond sombre.
  function isDarkColor([r, g, b]) {
    const lin = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.45;
  }

  // Détermine si le point (x, y) est posé sur un fond sombre. On descend la pile d'éléments
  // sous le pointeur, du plus haut au plus bas, et on s'arrête au premier qui répond :
  //   - soit il contient un calque décoratif qui peint ce point (bandeau bleu) ;
  //   - soit il a lui-même un fond opaque (bouton blanc, carte, terminal…).
  // Cet ordre respecte l'empilement : un bouton blanc posé sur le bloc bleu gagne, car il
  // apparaît avant sa section dans la liste ; et à l'intérieur d'une même itération, le
  // calque décoratif est testé d'abord car un descendant se peint toujours au-dessus du
  // fond de son ancêtre (sinon une section au fond clair masquerait son propre bandeau).
  function isOverDark(x, y) {
    if (insidePreloaderBlob(x, y)) return true;
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (el === document.body || el === document.documentElement) break;
      for (const fill of fills) {
        if (el.contains(fill) && surfaceCoversPoint(fill, x, y)) return true;
      }
      const bg = opaqueBackground(el);
      if (bg) return isDarkColor(bg);
    }
    return false;
  }

  /* ---------- suivi du pointeur ---------- */

  let x = -100;
  let y = -100;
  let frame = 0;

  function render() {
    frame = 0;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    // elementsFromPoint + getComputedStyle coûtent cher : on ne les évalue qu'une fois par
    // frame, jamais à chaque événement pointermove (qui peut tirer plus vite que l'écran).
    dot.classList.toggle('is-on-dark', isOverDark(x, y));
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    dot.classList.add('is-visible');
    const target = e.target instanceof Element ? e.target : null;
    dot.classList.toggle('is-hidden-field', !!(target && target.closest(TEXT_FIELD_SELECTOR)));
    dot.classList.toggle('is-hover', !!(target && target.closest(INTERACTIVE_SELECTOR)));
    schedule();
  }, { passive: true });

  document.addEventListener('pointerdown', () => dot.classList.add('is-down'));
  document.addEventListener('pointerup', () => dot.classList.remove('is-down'));

  // Sortie de la fenêtre (ou passage sur un iframe / la barre d'onglets) : on efface le point
  // plutôt que de le laisser figé sur le bord.
  document.addEventListener('mouseleave', () => dot.classList.remove('is-visible'));
  document.addEventListener('mouseenter', () => dot.classList.add('is-visible'));
  window.addEventListener('blur', () => dot.classList.remove('is-visible'));

  // Le fond sous un point fixe change aussi quand la page bouge sous lui.
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('parallax-tick', schedule);
})();
