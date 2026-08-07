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
  // "stack" sont tournés). 0 si l'élément n'est pas tourné.
  function rotationOf(el) {
    const t = getComputedStyle(el).transform;
    const m = t && t.match(/^matrix\(([^,]+),\s*([^,]+),/);
    return m ? Math.atan2(parseFloat(m[2]), parseFloat(m[1])) : 0;
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
    // négligeable par image. `ir` vient de sync(), qui a déjà mesuré l'icône.
    function syncBlob(ir) {
      if (!canBlob) return;
      if (!blobCopy) {
        attachBlob();
        if (!blobCopy) return;
      }
      for (const v of BLOB_VARS) {
        const val = blobSrc.style.getPropertyValue(v);
        if (blobCopy.style.getPropertyValue(v) !== val) blobCopy.style.setProperty(v, val);
      }
      // .is-active porte l'apparition en fondu de la forme (opacity) : la copie doit s'allumer
      // et s'éteindre avec elle, sans quoi elle resterait posée sur le bouton après la sortie
      // du curseur de la fenêtre.
      blobCopy.classList.toggle('is-active', blobSrc.classList.contains('is-active'));
      const clip = blobView.style.clipPath;
      if (blobClip.style.clipPath !== clip) blobClip.style.clipPath = clip;

      if (!blobIcon || !ir) return;
      // Coordonnées viewport telles quelles : le calque qui héberge l'icône a vu ses ancêtres
      // annuler déplacement et étirement, son origine est donc exactement celle de l'écran.
      blobIcon.style.width = `${ir.width}px`;
      blobIcon.style.height = `${ir.height}px`;
      blobIcon.style.left = `${ir.left}px`;
      blobIcon.style.top = `${ir.top}px`;
    }

    // Toutes les mesures d'abord, toutes les écritures ensuite : intercaler les deux forcerait
    // le navigateur à recalculer la mise en page à chaque copie, et ce à chaque frame.
    function sync() {
      // --- mesures ---
      const br = btn.getBoundingClientRect();
      const cs = getComputedStyle(btn);
      const ir = icon ? icon.getBoundingClientRect() : null;
      const geom = parts.map(({ src }) => {
        const r = src.getBoundingClientRect();
        const angle = rotationOf(src);
        return {
          angle,
          // Sur un élément tourné, getBoundingClientRect() donne la boîte ENGLOBANTE, plus
          // grande que la boîte réelle : on repasse alors par offsetWidth/Height (dimensions
          // avant transform) et par le centre, que la rotation laisse en place.
          w: angle ? src.offsetWidth : r.width,
          h: angle ? src.offsetHeight : r.height,
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
        };
      });

      // --- écritures ---
      // Ramène le repère local de la couche sur le coin haut-gauche du viewport : les copies
      // peuvent alors être posées à leurs coordonnées viewport telles quelles. Le bloc
      // contenant d'un enfant absolu est la boîte de PADDING, d'où le retrait des bordures.
      layer.style.left = `${-(br.left + (parseFloat(cs.borderLeftWidth) || 0))}px`;
      layer.style.top = `${-(br.top + (parseFloat(cs.borderTopWidth) || 0))}px`;

      parts.forEach(({ fill, iconCopy }, i) => {
        const { angle, w, h, cx, cy } = geom[i];
        fill.style.width = `${w}px`;
        fill.style.height = `${h}px`;
        fill.style.left = `${cx - w / 2}px`;
        fill.style.top = `${cy - h / 2}px`;
        fill.style.transform = angle ? `rotate(${angle}rad)` : 'none';

        if (!iconCopy || !ir) return;
        // Position de l'icône dans le repère NON tourné de l'aplat, puis rotation inverse pour
        // qu'elle reste droite malgré celle de son parent.
        const dx = ir.left + ir.width / 2 - cx;
        const dy = ir.top + ir.height / 2 - cy;
        const lx = angle ? dx * Math.cos(angle) + dy * Math.sin(angle) : dx;
        const ly = angle ? -dx * Math.sin(angle) + dy * Math.cos(angle) : dy;
        iconCopy.style.width = `${ir.width}px`;
        iconCopy.style.height = `${ir.height}px`;
        iconCopy.style.left = `${w / 2 + lx - ir.width / 2}px`;
        iconCopy.style.top = `${h / 2 + ly - ir.height / 2}px`;
        iconCopy.style.transform = angle ? `rotate(${-angle}rad)` : 'none';
      });

      // Après les aplats, donc peinte par-dessus eux : là où la forme chevauche un bandeau, les
      // deux sont blancs de toute façon, mais c'est SON icône accent qui doit gagner (la sienne
      // est rognée sur sa silhouette, celle du bandeau sur la diagonale).
      syncBlob(ir);
    }

    // Replacé à chaque frame, et non au scroll : le bouton rebondit et se déforme en continu
    // (back-to-top-bounce / preloader-blob-morph), donc sa position viewport change entre deux
    // évènements de scroll. Mesurer à chaque frame absorbe ce mouvement sans avoir à
    // contre-animer la couche — deux animations CSS à garder en phase, c'est précisément ce que
    // la découpe de l'écran de chargement s'interdit (cf. .preloader-blob-knockout).
    // La boucle s'arrête dès que le bouton est masqué, et le scroll la relance : c'est aussi
    // le seul évènement qui peut le faire réapparaître.
    let raf = 0;
    // Testé sur l'opacité calculée plutôt que sur une classe : .back-to-top s'affiche via
    // .is-visible, .scroll-down se masque via .is-hidden — l'opacité couvre les deux sans que
    // ce module ait à connaître la convention de chaque bouton.
    const visible = () => parseFloat(getComputedStyle(btn).opacity) > 0;
    function loop() {
      raf = 0;
      if (!visible()) return;
      sync();
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (!raf && visible()) raf = requestAnimationFrame(loop);
    }

    sync();
    start();
    window.addEventListener('scroll', start, { passive: true });
    window.addEventListener('resize', start);
  };
})();
