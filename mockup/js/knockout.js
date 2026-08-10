// Découpe pixel-exacte du fond derrière un bouton flottant (.back-to-top, .scroll-down).
//
// Le bouton est peint en aplat accent, icône blanche. Ce module lui superpose une COPIE des
// aplats bleus de la page (vague de #about, bloc #contact, bandeaux de details.html), repeinte
// en blanc et posée exactement à la position viewport des originaux. Là où le vrai fond est
// bleu, la copie est présente et le bouton apparaît blanc ; ailleurs elle est absente et
// l'aplat accent du bouton reste visible. Le bouton s'inverse donc pixel par pixel le long de
// la VRAIE frontière — c'est le même principe que la découpe blanche du halo de l'écran de
// chargement (.preloader-blob-clone), appliqué ici aux boutons de défilement.
//
// L'intérêt par rapport à un test "clair ou sombre ?" sur le centre du bouton : un bouton à
// cheval sur la diagonale n'est plus peint d'un seul aplat (faux sur la moitié qui n'est pas
// censée l'être), il est réellement coupé. Et parce que la frontière vient du clone et non
// d'un calcul, elle suit d'office le clip-path réel, le parallax et les changements de taille,
// sans qu'aucune géométrie ne soit redécrite ici.
(function () {
  // Angle de rotation d'un élément, lu sur sa matrice calculée (les bandeaux de la section
  // "stack" sont tournés). 0 si l'élément n'est pas tourné. Mis en cache par image dans
  // js/frame.js : le même bandeau est mesuré par les neuf boutons découpés de la page.
  const rotationOf = (el) => window.FrameLoop.rotation(el);
  const rectOf = (el) => window.FrameLoop.rect(el);
  const setStyle = (el, prop, value) => window.FrameLoop.setStyle(el, prop, value);

  /* ---------- boucle unique, partagée par tous les boutons découpés ---------- */

  // Une page en compte jusqu'à neuf (les pastilles du rail, son indicateur, le bouton
  // « remonter », la pastille de défilement), et chacun avait sa propre boucle rAF qui
  // mesurait puis écrivait. Or une écriture de style oblige le navigateur à recalculer toute
  // la mise en page avant la lecture suivante : neuf boucles qui s'alternent, c'est neuf
  // recalculs complets par image au lieu d'un. On les regroupe donc en une seule passe, en
  // deux temps stricts — TOUTES les mesures, PUIS toutes les écritures — de sorte qu'une
  // seule mise en page soit calculée pour l'ensemble des boutons.
  // S'y ajoute le cache de js/frame.js : les aplats bleus sources sont communs à tous ces
  // boutons, ils ne sont donc mesurés qu'une fois pour les neuf.
  const instances = [];
  let loopTask = null;

  // MISE EN VEILLE — la découpe ne doit être refaite que si quelque chose a bougé, et la plupart
  // du temps rien ne bouge : les pastilles du rail ne se déplacent qu'au défilement. Deux d'entre
  // elles font exception et animent en continu tant qu'elles sont affichées (.back-to-top rebondit,
  // .scroll-down se déforme) — mais elles produisent alors une écriture à chaque image, ce qui
  // suffit à retenir la boucle sans avoir à les distinguer ici. On ne s'endort donc qu'après
  // quelques images strictement sans changement, marge qui absorbe une frame isolée où tout
  // retombe pile sur les mêmes valeurs arrondies.
  const IDLE_FRAMES = 12;
  let idle = 0;

  function loop() {
    let any = false;
    for (const inst of instances) {
      inst.visible = inst.isVisible();
      if (!inst.visible) continue;
      inst.measure();
      any = true;
    }
    let changed = false;
    for (const inst of instances) {
      if (inst.visible && inst.paint()) changed = true;
    }
    // La boucle s'arrête aussi dès que plus aucun bouton n'est affiché, et le défilement la
    // relance : c'est aussi le seul évènement qui peut les faire réapparaître.
    if (!any) return false;
    idle = changed ? 0 : idle + 1;
    return idle < IDLE_FRAMES;
  }

  function startLoop() {
    idle = 0;
    if (loopTask) window.FrameLoop.wake(loopTask);
  }

  // btn      : le bouton à découper (doit être en overflow:hidden, cf. styles.css)
  // selector : les aplats bleus de la page à recopier
  window.initButtonKnockout = function initButtonKnockout(btn, selector) {
    if (!btn) return;
    // Pas de sortie anticipée si la page n'a aucun de ces aplats : la forme du hero, elle, est
    // toujours là (cf. la copie plus bas), et c'est elle qui découpe le bouton dans ce cas.
    // .closest('.btn-knockout') exclut les clones posés par un appel précédent (initDotRailKnockout
    // en boucle plusieurs boutons sur le même selecteur) : le clone GARDE la classe de sa source
    // (voir plus bas, nécessaire au clip-path), donc sans ce filtre il se re-qualifierait lui-même
    // comme source au tour suivant — duplication qui double à chaque bouton traité et finit par
    // empiler des dizaines d'aplats légèrement désalignés dans une boîte de quelques px.
    const sources = Array.from(document.querySelectorAll(selector)).filter(
      (el) => !el.closest('.btn-knockout')
    );

    const layer = document.createElement('span');
    layer.className = 'btn-knockout';
    layer.setAttribute('aria-hidden', 'true');
    // Ajouté EN DERNIER : la découpe doit repeindre l'icône du bouton, donc passer au-dessus.
    btn.appendChild(layer);

    const icon = btn.querySelector(':scope > svg');

    const parts = sources.map((src) => {
      // cloneNode(false) : seul l'aplat nous intéresse, son contenu éventuel n'a pas à être
      // dupliqué. Les classes suivent le clone — c'est ce qui lui donne le MÊME clip-path que
      // l'original, sans que ce clip-path soit réécrit nulle part. Seules la position et la
      // couleur sont forcées en ligne (l'inline prime sur la feuille de style).
      const fill = src.cloneNode(false);
      fill.removeAttribute('id');
      // filter:none — l'original porte une ombre portée ; recopiée telle quelle sur une forme
      // blanche, elle deviendrait un halo blanc flou par-dessus l'aplat accent du bouton.
      fill.style.cssText += ';position:absolute; inset:auto; margin:0; background:#fff; filter:none;';
      layer.appendChild(fill);

      // L'icône est recopiée DANS l'aplat, et non à côté : clip-path rogne aussi les
      // descendants, donc cette copie accent n'apparaît qu'à l'intérieur de la zone blanche —
      // exactement là où l'icône blanche du dessous deviendrait illisible.
      let iconCopy = null;
      if (icon) {
        iconCopy = icon.cloneNode(true);
        iconCopy.removeAttribute('id');
        iconCopy.style.cssText += ';position:absolute; color:var(--accent);';
        fill.appendChild(iconCopy);
      }
      return { src, fill, iconCopy };
    });

    /* ---------- copie de la forme du hero (js/page-blob.js) ---------- */

    // La forme bleue qui suit le curseur est un aplat comme les autres du point de vue du
    // bouton : elle passe SOUS lui (z-index 40 contre 50), donc sans rien de plus le bouton
    // reste accent par-dessus elle et la frontière disparaît — un rond bleu sur du bleu, alors
    // que tout le reste du site s'inverse au contact de l'accent. Elle mérite donc la même
    // découpe que les bandeaux ci-dessus, mais elle ne peut pas passer par le même chemin :
    //   - elle n'existe pas encore quand ce module s'initialise (page-blob.js est chargé APRÈS
    //     main/veille/details.js), d'où l'accrochage paresseux dans sync() ;
    //   - sa géométrie change à chaque image (ressort, étirement, morphing) : la mesurer au
    //     getBoundingClientRect() comme les bandeaux ne donnerait que sa boîte englobante, donc
    //     un rectangle là où c'est justement son contour organique qu'on veut suivre.
    // On recopie donc sa STRUCTURE et non sa mesure : mêmes classes (donc mêmes transforms,
    // même silhouette, même morphing), pilotées par les mêmes variables --pgblob-* recopiées à
    // chaque image. Le résultat est exact par construction, comme la découpe que la forme
    // transporte elle-même.
    const BLOB_VARS = ['--pgblob-x', '--pgblob-y', '--pgblob-angle', '--pgblob-stretch', '--pgblob-squash'];
    // page-blob.js ne s'installe que sur pointeur fin : ailleurs, inutile de le chercher à
    // chaque image pour ne jamais le trouver.
    const canBlob = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let blobSrc = null;      // la vraie forme
    let blobView = null;     // sa fenêtre, qui porte le rognage sur le bord haut du bleu
    let blobCopy = null;     // la copie posée dans le bouton
    let blobClip = null;     // calque NON transformé qui rejoue ce rognage sur la copie
    let blobIcon = null;

    function attachBlob() {
      blobView = document.getElementById('page-blob-viewport');
      blobSrc = blobView && blobView.querySelector(':scope > .page-blob');
      if (!blobSrc) return;

      // Le rognage de la forme (clip-path posé par updateScroll, en coordonnées écran) doit être
      // rejoué ici, sinon le bouton s'inverserait là où la forme est en réalité coupée — c'est-à-
      // dire dès qu'elle arrive sur le bleu de #contact, juste sous le bouton. Il est posé sur un
      // calque à part et NON transformé : un clip-path s'applique dans le repère de l'élément
      // avant sa propre transform, le mettre sur la copie elle-même le ferait voyager avec elle.
      // Boîte de taille nulle comme .btn-knockout : les coordonnées du polygone sont en px depuis
      // son coin haut-gauche, que la couche a déjà calé sur celui du viewport.
      blobClip = document.createElement('span');
      blobClip.className = 'btn-knockout-blob-clip';
      layer.appendChild(blobClip);

      // Même arborescence que la vraie forme (cf. page-blob.js) : déplacement, étirement,
      // déformation, puis les deux calques qui annulent les deux premiers — c'est ce qui ramène
      // l'origine de leur contenu sur le coin haut-gauche de l'écran, et permet d'y poser l'icône
      // à ses coordonnées viewport telles quelles. La découpe de page (.page-blob-clone) n'a en
      // revanche rien à faire ici : dans le bouton, la forme ne doit apporter qu'un aplat blanc.
      blobCopy = document.createElement('span');
      blobCopy.className = 'page-blob';
      blobCopy.innerHTML =
        '<span class="page-blob-stretch"><span class="page-blob-shape">' +
        '<span class="page-blob-knockout"><span class="page-blob-origin"></span></span>' +
        '</span></span>';
      blobClip.appendChild(blobCopy);

      if (icon) {
        blobIcon = icon.cloneNode(true);
        blobIcon.removeAttribute('id');
        blobIcon.style.cssText += ';position:absolute; color:var(--accent);';
        blobCopy.querySelector('.page-blob-origin').appendChild(blobIcon);
      }

      // Le morphing (preloader-blob-morph, 9s) DESSINE la silhouette : une copie insérée
      // maintenant démarrerait son cycle à cet instant et serait donc déphasée par rapport à
      // l'originale — deux contours différents au même moment, et la découpe déborderait. On
      // aligne son startTime sur celui de l'original, qui partage la même horloge : les deux
      // restent alors en phase indéfiniment. Même procédé que syncCloneAnimations (page-blob.js).
      requestAnimationFrame(() => {
        const srcShape = blobSrc.querySelector('.page-blob-shape');
        const copyShape = blobCopy.querySelector('.page-blob-shape');
        if (!srcShape || !copyShape || !srcShape.getAnimations) return;
        const morph = (el) => el.getAnimations().find((a) => a.animationName === 'preloader-blob-morph');
        const s = morph(srcShape);
        const c = morph(copyShape);
        if (s && c && s.startTime !== null) c.startTime = s.startTime;
      });
    }

    // Uniquement des lectures et écritures de chaînes, sans aucune mesure de mise en page :
    // négligeable par image. `ir` vient de measure(), qui a déjà mesuré l'icône.
    function syncBlob(ir) {
      if (!canBlob) return false;
      if (!blobCopy) {
        attachBlob();
        if (!blobCopy) return false;
      }
      let changed = false;
      for (const v of BLOB_VARS) {
        if (window.FrameLoop.setVar(blobCopy, v, blobSrc.style.getPropertyValue(v))) changed = true;
      }
      // .is-active porte l'apparition en fondu de la forme (opacity) : la copie doit s'allumer
      // et s'éteindre avec elle, sans quoi elle resterait posée sur le bouton après la sortie
      // du curseur de la fenêtre.
      const active = blobSrc.classList.contains('is-active');
      if (blobCopy.classList.contains('is-active') !== active) {
        blobCopy.classList.toggle('is-active', active);
        changed = true;
      }
      if (setStyle(blobClip, 'clipPath', blobView.style.clipPath)) changed = true;

      if (!blobIcon || !ir) return changed;
      // Coordonnées viewport telles quelles : le calque qui héberge l'icône a vu ses ancêtres
      // annuler déplacement et étirement, son origine est donc exactement celle de l'écran.
      if (setStyle(blobIcon, 'width', `${ir.width.toFixed(2)}px`)) changed = true;
      if (setStyle(blobIcon, 'height', `${ir.height.toFixed(2)}px`)) changed = true;
      if (setStyle(blobIcon, 'left', `${ir.left.toFixed(2)}px`)) changed = true;
      if (setStyle(blobIcon, 'top', `${ir.top.toFixed(2)}px`)) changed = true;
      return changed;
    }

    // Largeurs de bordure du bouton : elles viennent d'une règle CSS statique et ne changent
    // donc jamais en cours de route. Un getComputedStyle par bouton et par image (neuf par
    // page) pour relire deux constantes, c'était du travail pur perdu — relu au
    // redimensionnement seulement, où une unité relative pourrait les faire varier.
    let borders = null;
    function readBorders() {
      const cs = getComputedStyle(btn);
      borders = {
        left: parseFloat(cs.borderLeftWidth) || 0,
        top: parseFloat(cs.borderTopWidth) || 0,
      };
    }

    // Toutes les mesures d'abord, toutes les écritures ensuite : intercaler les deux forcerait
    // le navigateur à recalculer la mise en page à chaque copie, et ce à chaque frame. Les deux
    // temps sont ici SÉPARÉS EN DEUX FONCTIONS, appelées par la boucle commune (cf. loop() en
    // tête de fichier) : la séparation ne vaut que si elle tient aussi entre les boutons, pas
    // seulement à l'intérieur de chacun.
    const m = { br: null, ir: null, geom: [] };

    function measure() {
      m.br = rectOf(btn);
      m.ir = icon ? rectOf(icon) : null;
      if (!borders) readBorders();
      for (let i = 0; i < parts.length; i++) {
        const src = parts[i].src;
        const r = rectOf(src);
        const angle = rotationOf(src);
        m.geom[i] = {
          angle,
          // Sur un élément tourné, getBoundingClientRect() donne la boîte ENGLOBANTE, plus
          // grande que la boîte réelle : on repasse alors par offsetWidth/Height (dimensions
          // avant transform) et par le centre, que la rotation laisse en place.
          w: angle ? src.offsetWidth : r.width,
          h: angle ? src.offsetHeight : r.height,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
        };
      }
    }

    // Renvoie vrai si au moins une propriété a réellement changé : c'est ce qui dit à la boucle
    // commune que ce bouton bouge encore et qu'elle ne peut pas s'endormir.
    function paint() {
      const { br, ir, geom } = m;
      if (!br) return false;
      let changed = false;
      // Ramène le repère local de la couche sur le coin haut-gauche du viewport : les copies
      // peuvent alors être posées à leurs coordonnées viewport telles quelles. Le bloc
      // contenant d'un enfant absolu est la boîte de PADDING, d'où le retrait des bordures.
      if (setStyle(layer, 'left', `${(-(br.left + borders.left)).toFixed(2)}px`)) changed = true;
      if (setStyle(layer, 'top', `${(-(br.top + borders.top)).toFixed(2)}px`)) changed = true;

      parts.forEach(({ fill, iconCopy }, i) => {
        const { angle, w, h, cx, cy } = geom[i];
        if (setStyle(fill, 'width', `${w.toFixed(2)}px`)) changed = true;
        if (setStyle(fill, 'height', `${h.toFixed(2)}px`)) changed = true;
        if (setStyle(fill, 'left', `${(cx - w / 2).toFixed(2)}px`)) changed = true;
        if (setStyle(fill, 'top', `${(cy - h / 2).toFixed(2)}px`)) changed = true;
        if (setStyle(fill, 'transform', angle ? `rotate(${angle}rad)` : 'none')) changed = true;

        if (!iconCopy || !ir) return;
        // Position de l'icône dans le repère NON tourné de l'aplat, puis rotation inverse pour
        // qu'elle reste droite malgré celle de son parent.
        const dx = ir.left + ir.width / 2 - cx;
        const dy = ir.top + ir.height / 2 - cy;
        const lx = angle ? dx * Math.cos(angle) + dy * Math.sin(angle) : dx;
        const ly = angle ? -dx * Math.sin(angle) + dy * Math.cos(angle) : dy;
        if (setStyle(iconCopy, 'width', `${ir.width.toFixed(2)}px`)) changed = true;
        if (setStyle(iconCopy, 'height', `${ir.height.toFixed(2)}px`)) changed = true;
        if (setStyle(iconCopy, 'left', `${(w / 2 + lx - ir.width / 2).toFixed(2)}px`)) changed = true;
        if (setStyle(iconCopy, 'top', `${(h / 2 + ly - ir.height / 2).toFixed(2)}px`)) changed = true;
        if (setStyle(iconCopy, 'transform', angle ? `rotate(${-angle}rad)` : 'none')) changed = true;
      });

      // Après les aplats, donc peinte par-dessus eux : là où la forme chevauche un bandeau, les
      // deux sont blancs de toute façon, mais c'est SON icône accent qui doit gagner (la sienne
      // est rognée sur sa silhouette, celle du bandeau sur la diagonale).
      if (syncBlob(ir)) changed = true;
      return changed;
    }

    // Replacé à chaque frame, et non au scroll : le bouton rebondit et se déforme en continu
    // (back-to-top-bounce / preloader-blob-morph), donc sa position viewport change entre deux
    // évènements de scroll. Mesurer à chaque frame absorbe ce mouvement sans avoir à
    // contre-animer la couche — deux animations CSS à garder en phase, c'est précisément ce que
    // la découpe de l'écran de chargement s'interdit (cf. .preloader-blob-knockout).
    // Testé sur l'opacité calculée plutôt que sur une classe : .back-to-top s'affiche via
    // .is-visible, .scroll-down se masque via .is-hidden — l'opacité couvre les deux sans que
    // ce module ait à connaître la convention de chaque bouton.
    const isVisible = () => parseFloat(getComputedStyle(btn).opacity) > 0;

    instances.push({ isVisible, measure, paint, visible: false });
    // Une seule tâche et un seul jeu d'écouteurs pour tous les boutons : les inscrire par
    // bouton reviendrait à réveiller neuf fois la même boucle à chaque évènement de défilement.
    if (!loopTask) {
      loopTask = window.FrameLoop.add(window.FrameLoop.ORDER.KNOCKOUT, loop);
      window.addEventListener('scroll', startLoop, { passive: true });
      window.addEventListener('resize', startLoop);
      // Le parallax continue de déplacer les aplats bleus pendant plusieurs images après le
      // dernier évènement de défilement (lissage, cf. initAboutParallax dans js/main.js).
      window.addEventListener('parallax-tick', startLoop);
      // La forme du hero, dont chaque bouton porte une copie, se déplace sur mouvement de souris
      // puis continue quelques images (ressort) : « blob-tick » couvre les deux, et il est émis
      // par js/page-blob.js AVANT nous dans l'image (cf. ORDER), donc sans tour de retard.
      window.addEventListener('pointermove', startLoop, { passive: true });
      window.addEventListener('blob-tick', startLoop);
    }
    window.addEventListener('resize', () => { borders = null; });

    measure();
    paint();
    startLoop();
  };
})();
