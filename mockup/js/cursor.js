/* ============================================================
   CURSEUR PERSONNALISÉ — le curseur système est remplacé par un simple point
   bleu qui suit le pointeur, et qui passe au blanc dès qu'il survole une zone
   sombre (bandeaux bleus, terminal, cartes foncées) pour rester visible.

   La bascule ne se fait PAS d'un bloc : le point est composé de deux calques
   superposés — un disque bleu, et un disque blanc par-dessus, découpé au
   clip-path sur la géométrie exacte de la zone sombre. Quand le point chevauche
   un bord, l'arête le traverse donc au pixel près, chaque moitié gardant la
   couleur qui la rend lisible sur son fond. Un simple booléen "je suis sur du
   sombre" ne peut pas faire ça : il colore les 12px d'un coup, et le point
   change de couleur avant ou après l'arête selon où tombe son centre.

   Uniquement sur pointeur fin (souris / trackpad) : sur tactile, il n'y a pas
   de pointeur à remplacer, on ne touche à rien.
   ============================================================ */
(function initCustomCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  dot.setAttribute('aria-hidden', 'true');
  // calque clair : posé au-dessus du disque bleu, et découpé à chaque frame sur la
  // portion du point qui recouvre une zone sombre (cf. applyLightClip).
  const light = document.createElement('span');
  light.className = 'cursor-dot-light';
  dot.appendChild(light);
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

  // Transformation inverse de toLocalPoint : du repère local de l'élément vers le viewport.
  // Sert à exprimer la forme peinte d'un calque (son polygone de découpe) dans le même
  // repère que le point du curseur, seul moyen de les découper l'un contre l'autre.
  function toViewportPoint(el, p) {
    const r = el.getBoundingClientRect();
    const a = rotationOf(el);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const lx = p[0] - el.offsetWidth / 2;
    const ly = p[1] - el.offsetHeight / 2;
    return [
      lx * cos - ly * sin + r.left + r.width / 2,
      lx * sin + ly * cos + r.top + r.height / 2,
    ];
  }

  // Résout une longueur CSS ("120px", "37%", mais aussi "clamp(160px, 22vw, 360px)" ou
  // "calc(100% - 140px)") en px locaux. Les bandeaux du site posent leur pente via une custom
  // property à base de clamp()/calc() (--contact-slope, --dp-slope, --wave-h) : une fois
  // substituée dans le clip-path, sa valeur calculée reste ce texte non résolu (les customs
  // properties sont un remplacement littéral, pas une évaluation numérique), donc un simple
  // parseFloat y lit NaN. On pose plutôt le token sur un élément réel, dans un conteneur calé
  // sur la taille de référence voulue, et on laisse le moteur de layout calculer la valeur :
  // ça résout n'importe quelle expression CSS, pas seulement celles qu'on a anticipées.
  // Même principe que resolveCSSLength dans details.js.
  let lengthProbeBox = null;
  let lengthProbeEl = null;
  function resolveLength(token, refSize, axis) {
    if (!lengthProbeBox) {
      lengthProbeBox = document.createElement('div');
      lengthProbeBox.style.cssText = 'position:fixed; top:-9999px; left:-9999px; visibility:hidden; pointer-events:none;';
      lengthProbeEl = document.createElement('div');
      lengthProbeEl.style.position = 'absolute';
      lengthProbeBox.appendChild(lengthProbeEl);
      document.body.appendChild(lengthProbeBox);
    }
    if (axis === 'x') {
      lengthProbeBox.style.width = `${refSize}px`;
      lengthProbeBox.style.height = '0';
      lengthProbeEl.style.top = '0';
      lengthProbeEl.style.left = token;
      return lengthProbeEl.getBoundingClientRect().left - lengthProbeBox.getBoundingClientRect().left;
    }
    lengthProbeBox.style.height = `${refSize}px`;
    lengthProbeBox.style.width = '0';
    lengthProbeEl.style.left = '0';
    lengthProbeEl.style.top = token;
    return lengthProbeEl.getBoundingClientRect().top - lengthProbeBox.getBoundingClientRect().top;
  }

  // Découpe `str` sur `sep` en ignorant les occurrences situées à l'intérieur de
  // parenthèses : indispensable puisque clamp()/calc() contiennent eux-mêmes des
  // virgules et des espaces (ex. "0px clamp(160px, 22vw, 360px)"), qu'un split naïf
  // couperait au mauvais endroit.
  function splitTopLevel(str, sep) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (depth === 0 && (sep === ' ' ? /\s/.test(c) : c === sep)) {
        parts.push(str.slice(start, i));
        start = i + 1;
        if (sep === ' ') break; // une paire "X Y" n'a qu'un seul séparateur de tête
      }
    }
    parts.push(str.slice(start));
    return parts.map((p) => p.trim()).filter((p, i, arr) => p !== '' || i < arr.length - 1);
  }

  // Points du clip-path polygon() de l'élément, en coordonnées locales — null s'il n'a pas
  // de clip (l'élément couvre alors toute sa boîte). Mis en cache par élément tant que sa
  // taille ne change pas : resolveLength force une réorganisation du layout à chaque appel,
  // inutile à répéter à chaque frame alors que la forme d'un bandeau ne bouge qu'au resize.
  const clipCache = new WeakMap();
  function clipPolygon(el, w, h) {
    const clip = getComputedStyle(el).clipPath;
    // Pas de regex à ancres ")$" ici : un calc()/clamp() dans les coordonnées introduit ses
    // propres parenthèses fermantes avant celle qui termine réellement polygon(...), ce
    // qu'un motif comme /^polygon\(([^)]*)\)$/ ne peut pas voir (il s'arrête à la toute
    // première ")"). On se contente de vérifier l'enveloppe et de découper le contenu à la
    // main, en respectant la profondeur de parenthèses.
    if (!clip || !clip.startsWith('polygon(') || !clip.endsWith(')')) return null;
    const raw = clip.slice('polygon('.length, -1);
    const cached = clipCache.get(el);
    if (cached && cached.w === w && cached.h === h && cached.raw === raw) return cached.points;
    const points = splitTopLevel(raw, ',').map((pair) => {
      const [px, py] = splitTopLevel(pair, ' ');
      return [resolveLength(px, w, 'x'), resolveLength(py, h, 'y')];
    });
    clipCache.set(el, { w, h, raw, points });
    return points;
  }

  // Contour peint par l'élément, en coordonnées viewport : son polygone de découpe s'il en a
  // un, sinon les quatre coins de sa boîte — dans les deux cas passés par toViewportPoint,
  // donc rotation comprise (les bandeaux .dp-stack-banner sont inclinés).
  function surfacePolygon(el) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return null;
    const local = clipPolygon(el, w, h) || [[0, 0], [w, 0], [w, h], [0, h]];
    return local.map((p) => toViewportPoint(el, p));
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

  /* ---------- découpe d'un polygone par la boîte du point ---------- */

  // Sutherland–Hodgman : on rabote successivement le polygone par les quatre côtés de la
  // boîte. Le résultat est exactement la portion de zone sombre qui tombe sous le point —
  // c'est elle qu'on donne au clip-path du calque clair. null si l'intersection est vide.
  function clipToBox(poly, box) {
    const lerpX = (a, b, X) => [X, a[1] + ((X - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
    const lerpY = (a, b, Y) => [a[0] + ((Y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), Y];
    const planes = [
      { inside: (p) => p[0] >= box.left, cut: (a, b) => lerpX(a, b, box.left) },
      { inside: (p) => p[0] <= box.right, cut: (a, b) => lerpX(a, b, box.right) },
      { inside: (p) => p[1] >= box.top, cut: (a, b) => lerpY(a, b, box.top) },
      { inside: (p) => p[1] <= box.bottom, cut: (a, b) => lerpY(a, b, box.bottom) },
    ];
    let out = poly;
    for (const plane of planes) {
      const input = out;
      out = [];
      for (let i = 0; i < input.length; i++) {
        const cur = input[i];
        const prev = input[(i + input.length - 1) % input.length];
        const curIn = plane.inside(cur);
        const prevIn = plane.inside(prev);
        if (curIn) {
          if (!prevIn) out.push(plane.cut(prev, cur));
          out.push(cur);
        } else if (prevIn) {
          out.push(plane.cut(prev, cur));
        }
      }
      if (!out.length) return null;
    }
    return out;
  }

  function polygonArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    }
    return Math.abs(a) / 2;
  }

  /* ---------- écran de préchargement ---------- */

  // Écran de préchargement (#preloader, index.html) : une forme bleue organique
  // (.preloader-blob) suit le curseur avec un léger retard "ressort" (voir initPreloaderBlob
  // dans main.js) et le recouvre. Elle est en pointer-events:none (purement décorative), donc
  // absente d'elementsFromPoint comme les autres calques ; mais contrairement aux bandeaux, sa
  // position suit le pointeur en continu plutôt que le scroll, donc on la teste séparément.
  const preloaderBlob = document.querySelector('.preloader-blob');
  const preloaderBlobShape = document.querySelector('.preloader-blob-shape');

  function preloaderBlobRect() {
    if (!preloaderBlob || !preloaderBlobShape || !preloaderBlob.classList.contains('is-active')) {
      return null;
    }
    const r = preloaderBlobShape.getBoundingClientRect();
    return r.width && r.height ? r : null;
  }

  // border-radius donne au blob un contour organique irrégulier plutôt qu'un cercle parfait,
  // mais une ellipse inscrite dans sa boîte réelle (post-transform, donc étirement compris) en
  // est une approximation largement assez fidèle. On l'échantillonne en polygone pour la
  // traiter comme les autres surfaces.
  function preloaderBlobPolygon() {
    const r = preloaderBlobRect();
    if (!r) return null;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const rx = r.width / 2;
    const ry = r.height / 2;
    const pts = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  }

  function insidePreloaderBlob(x, y) {
    const r = preloaderBlobRect();
    if (!r) return false;
    const nx = (x - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (y - (r.top + r.height / 2)) / (r.height / 2);
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

  // Surface sombre qui peint le point (x, y), ou null s'il est sur du clair. On descend la
  // pile d'éléments sous le pointeur, du plus haut au plus bas, et on s'arrête au premier qui
  // répond :
  //   - soit il contient un calque décoratif qui peint ce point (bandeau bleu) ;
  //   - soit il a lui-même un fond opaque (bouton blanc, carte, terminal…).
  // Cet ordre respecte l'empilement : un bouton blanc posé sur le bloc bleu gagne, car il
  // apparaît avant sa section dans la liste ; et à l'intérieur d'une même itération, le
  // calque décoratif est testé d'abord car un descendant se peint toujours au-dessus du
  // fond de son ancêtre (sinon une section au fond clair masquerait son propre bandeau).
  // On renvoie l'élément plutôt qu'un booléen : c'est sa géométrie qui découpera le point.
  function darkSurfaceAt(x, y) {
    if (insidePreloaderBlob(x, y)) return 'blob';
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (el === document.body || el === document.documentElement) break;
      for (const fill of fills) {
        if (el.contains(fill) && surfaceCoversPoint(fill, x, y)) return fill;
      }
      const bg = opaqueBackground(el);
      if (bg) return isDarkColor(bg) ? el : null;
    }
    return null;
  }

  /* ---------- découpe du calque clair ---------- */

  const EMPTY_CLIP = 'polygon(0px 0px, 0px 0px, 0px 0px)';

  // Sonde le centre et les quatre coins de la boîte du point. Toutes les zones sombres du site
  // sont des polygones (bords droits) : une arête droite qui traverse la boîte laisse toujours
  // au moins un coin de chaque côté, donc ces cinq sondes suffisent à repérer la surface qui
  // mord sur le point — même quand son centre, lui, est encore sur du clair.
  function darkSurfacesAround(box) {
    const probes = [
      [(box.left + box.right) / 2, (box.top + box.bottom) / 2],
      [box.left + 0.5, box.top + 0.5],
      [box.right - 0.5, box.top + 0.5],
      [box.left + 0.5, box.bottom - 0.5],
      [box.right - 0.5, box.bottom - 0.5],
    ];
    const found = [];
    for (const [px, py] of probes) {
      const surface = darkSurfaceAt(px, py);
      if (surface && !found.includes(surface)) found.push(surface);
    }
    return found;
  }

  // Pose sur le calque clair la portion du point qui recouvre du sombre, en coordonnées
  // locales au point. C'est ici que se joue la précision : l'arête donnée au clip-path est
  // celle de la zone sombre elle-même, pas une approximation au centre du curseur.
  function applyLightClip(box) {
    let best = null;
    let bestArea = 0;
    for (const surface of darkSurfacesAround(box)) {
      const poly = surface === 'blob' ? preloaderBlobPolygon() : surfacePolygon(surface);
      if (!poly) continue;
      const clipped = clipToBox(poly, box);
      if (!clipped) continue;
      const area = polygonArea(clipped);
      // Plusieurs zones sombres peuvent mordre sur le point (bandeaux qui se chevauchent) ;
      // clip-path ne prend qu'un polygone, on garde donc celle qui en couvre le plus.
      if (area > bestArea) {
        best = clipped;
        bestArea = area;
      }
    }
    if (!best) {
      light.style.clipPath = EMPTY_CLIP;
      return;
    }
    const pts = best
      .map(([px, py]) => `${(px - box.left).toFixed(2)}px ${(py - box.top).toFixed(2)}px`)
      .join(', ');
    light.style.clipPath = `polygon(${pts})`;
  }

  /* ---------- suivi du pointeur ---------- */

  let x = -100;
  let y = -100;
  let frame = 0;

  function render() {
    frame = 0;
    dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    // la boîte est relue après coup plutôt que déduite de x/y : la taille du point s'anime
    // (survol, clic), et c'est sa taille réelle à cette frame qui doit servir de repère.
    const r = dot.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // elementsFromPoint + getComputedStyle coûtent cher : on ne les évalue qu'une fois par
    // frame, jamais à chaque événement pointermove (qui peut tirer plus vite que l'écran).
    applyLightClip({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
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
