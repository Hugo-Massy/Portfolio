// ORDONNANCEUR D'IMAGES PARTAGÉ + CACHE DE MESURES
//
// Trois modules décoratifs animent en permanence et travaillent tous sur la MÊME géométrie :
// la forme du hero (js/page-blob.js), la découpe des boutons flottants (js/knockout.js, une
// instance par pastille du rail + le bouton « remonter » + la pastille de défilement) et le
// point du curseur (js/cursor.js). Chacun avait sa propre boucle requestAnimationFrame, et
// chacune de ces boucles alternait lectures et écritures de style.
//
// Deux coûts s'additionnaient alors, tous les deux invisibles dans le code mais bien réels :
//
//   1. LE MARTELAGE DE LA MISE EN PAGE. Une lecture de getBoundingClientRect() n'est gratuite
//      que si rien n'a été écrit depuis la dernière : sinon le navigateur DOIT recalculer toute
//      la mise en page avant de répondre. Avec ~9 boucles indépendantes qui écrivent puis
//      laissent la suivante lire, on payait une dizaine de recalculs complets par image, sur
//      des pages qui portent en plus une copie intégrale d'elles-mêmes (.page-blob-clone).
//
//   2. LES MESURES EN DOUBLE. Les mêmes aplats bleus (.contact-fill, .section-divider-bar,
//      .dp-stack-banner…) sont mesurés par la forme du hero, par le curseur, ET par chacune
//      des neuf découpes de bouton — soit le même getBoundingClientRect() répété des dizaines
//      de fois par image pour un résultat rigoureusement identique. Pire, la géométrie d'un
//      aplat était relue POINT PAR POINT de son polygone de découpe (cf. toViewportPoint dans
//      js/cursor.js), donc quatre à six fois de plus à chaque passage.
//
// Ce module répond aux deux d'un coup :
//
//   - UNE SEULE boucle rAF, dans laquelle les modules s'inscrivent avec une priorité (ORDER).
//     L'ordre devient explicite et non plus dépendant de qui a démarré en premier : la forme
//     pose ses variables --pgblob-*, PUIS les découpes de bouton les recopient, PUIS le curseur
//     mesure ce que tout ça a produit. Un module réveillé en cours d'image par un autre (le
//     curseur l'est par « blob-tick ») est donc servi dans la MÊME image s'il vient après.
//
//   - un CACHE DE MESURES vidé au début de chaque image : le premier qui mesure un élément
//     paie, les suivants lisent la valeur. Il n'est actif QUE pendant une image (inFrame) —
//     hors boucle, chaque appel retombe sur une vraie mesure, sans quoi une valeur d'il y a
//     plusieurs secondes serait servie à un code appelé depuis un évènement.
//
// SÛRETÉ DU CACHE — il ne serait faux que si un module écrivait quelque chose qui déplace un
// élément DÉJÀ mesuré plus tôt dans la même image. Ce n'est le cas nulle part ici : les
// modules n'écrivent que dans leurs propres calques décoratifs (copies, fenêtres en
// position:fixed, variables CSS de la forme), jamais dans le flux de la page qu'ils mesurent.
// Un futur module qui déplacerait du vrai contenu devrait s'inscrire AVANT ceux qui le
// mesurent, comme le fait déjà l'ordre ci-dessous.
(function () {
  'use strict';

  // Priorités d'exécution. Les valeurs sont espacées pour laisser de la place entre deux.
  const ORDER = {
    SCROLL: 5,    // recalage de la copie de page sur le défilement (js/page-blob.js)
    BLOB: 10,     // ressort + bulles de la forme du hero, qui pose les variables --pgblob-*
    KNOCKOUT: 20, // découpes de bouton, qui recopient ces variables
    CURSOR: 30,   // point du curseur, qui mesure la forme telle qu'elle vient d'être posée
  };

  const tasks = [];
  let raf = 0;
  let inFrame = false;

  const rects = new Map();
  const rotations = new Map();
  const memos = new Map();

  function request() {
    if (!raf) raf = requestAnimationFrame(runFrame);
  }

  function runFrame(now) {
    raf = 0;
    inFrame = true;
    rects.clear();
    rotations.clear();
    memos.clear();
    let more = false;
    // Parcours par index et relecture de `on` à chaque tour : une tâche peut en réveiller une
    // autre pendant l'image (la forme émet « blob-tick », que le curseur écoute), et celle-ci
    // doit alors être servie tout de suite si sa priorité la place plus loin.
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (!t.on) continue;
      t.on = !!t.fn(now);
      if (t.on) more = true;
    }
    inFrame = false;
    // `raf` a pu être repositionné par un wake() déclenché pendant l'image : ne pas en
    // programmer une seconde par-dessus.
    if (more && !raf) request();
  }

  // Mesure de la boîte écran d'un élément, mise en cache le temps de l'image courante.
  function rect(el) {
    if (!inFrame) return el.getBoundingClientRect();
    let r = rects.get(el);
    if (r === undefined) {
      r = el.getBoundingClientRect();
      rects.set(el, r);
    }
    return r;
  }

  // Angle de rotation appliqué à l'élément, en radians (0 si aucune rotation) : lu sur la
  // matrice calculée, dont les deux premiers coefficients sont (cos θ, sin θ). Mis en cache
  // comme les boîtes — les bandeaux inclinés du site tiennent leur rotation d'une règle CSS
  // statique, mais getComputedStyle reste un accès coûteux à répéter des dizaines de fois.
  function readRotation(el) {
    const t = getComputedStyle(el).transform;
    const m = t && t.match(/^matrix\(([^,]+),\s*([^,]+),/);
    return m ? Math.atan2(parseFloat(m[2]), parseFloat(m[1])) : 0;
  }
  function rotation(el) {
    if (!inFrame) return readRotation(el);
    let a = rotations.get(el);
    if (a === undefined) {
      a = readRotation(el);
      rotations.set(el, a);
    }
    return a;
  }

  // Mémoïsation générique par élément, valable le temps d'une image. `ns` sépare les usages
  // (un même aplat a un contour ET une frontière, qui n'ont rien à voir). Sert notamment aux
  // contours de découpe, dont le calcul enchaîne une mesure et une poignée de projections.
  function memo(ns, el, compute) {
    if (!inFrame) return compute(el);
    let m = memos.get(ns);
    if (!m) {
      m = new Map();
      memos.set(ns, m);
    }
    if (m.has(el)) return m.get(el);
    const v = compute(el);
    m.set(el, v);
    return v;
  }

  // Écritures gardées : une propriété réécrite à l'identique invalide quand même le style de
  // l'élément dans certains moteurs, et ces trois modules réécrivent l'essentiel de leurs
  // styles à chaque image alors que la plupart ne bougent pas (les pastilles du rail ne se
  // déplacent qu'au défilement, la forme ne bouge que si la souris bouge…). Renvoie vrai si
  // la valeur a réellement changé — c'est aussi ce qui permet aux boucles de savoir qu'il ne
  // se passe plus rien et de se mettre en veille.
  //
  // La comparaison porte sur la DERNIÈRE VALEUR ÉCRITE, mémorisée ici, et surtout pas sur ce
  // que renvoie el.style : le CSSOM RE-SÉRIALISE ce qu'on lui donne, et sa sérialisation ne
  // coïncide pas avec la nôtre. On écrit "−347.00px" (toFixed(2)), il relit "-347px" — jamais
  // égaux, donc la garde ne gardait rien et les boucles se croyaient éternellement occupées.
  // Écrire dans une propriété raccourcie brouille encore plus la relecture (top/left partent
  // dans `inset`). Corollaire : ces propriétés doivent n'avoir qu'un seul auteur, ce qui est
  // le cas — chaque calque décoratif n'est piloté que par le module qui l'a créé.
  const written = new WeakMap();
  function lastOf(el) {
    let m = written.get(el);
    if (!m) {
      m = Object.create(null);
      written.set(el, m);
    }
    return m;
  }
  function setStyle(el, prop, value) {
    const last = lastOf(el);
    if (last[prop] === value) return false;
    last[prop] = value;
    el.style[prop] = value;
    return true;
  }
  function setVar(el, name, value) {
    const last = lastOf(el);
    if (last[name] === value) return false;
    last[name] = value;
    el.style.setProperty(name, value);
    return true;
  }

  window.FrameLoop = {
    ORDER,
    // fn(now) renvoie vrai pour être rappelée à l'image suivante, faux pour s'arrêter (elle
    // sera relancée par wake()). Une tâche naît à l'arrêt : rien ne tourne tant que personne
    // ne l'a réveillée.
    add(order, fn) {
      const task = { order, fn, on: false };
      // Insertion en gardant le tableau trié, après les tâches de même priorité (ordre
      // d'inscription conservé entre égales — c'est ce qui garde les neuf découpes de bouton
      // dans leur ordre du document).
      let i = tasks.length;
      while (i > 0 && tasks[i - 1].order > order) i--;
      tasks.splice(i, 0, task);
      return task;
    },
    wake(task) {
      task.on = true;
      request();
    },
    stop(task) {
      task.on = false;
    },
    // Emballe une fonction appelée sur évènement (scroll, resize, parallax-tick) pour qu'elle ne
    // s'exécute qu'UNE FOIS par image, et à l'intérieur de la boucle — donc avec le cache de
    // mesures actif. Deux gains cumulés : un défilement à l'inertie peut émettre « scroll »
    // plusieurs fois par image, et « parallax-tick » s'y ajoute ; et ces fonctions mesurent
    // presque toutes les mêmes aplats bleus que les modules ci-dessus, qui n'ont donc plus à être
    // remesurés une fois de plus.
    throttle(order, fn) {
      const task = this.add(order, () => {
        fn();
        return false;
      });
      return () => {
        task.on = true;
        request();
      };
    },
    rect,
    rotation,
    memo,
    setStyle,
    setVar,
  };
})();
