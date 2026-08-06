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
    const sources = Array.from(document.querySelectorAll(selector));
    if (!sources.length) return;

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
