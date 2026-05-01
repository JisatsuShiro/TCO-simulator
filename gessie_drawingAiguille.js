/**
 * ============================================================================
 *  CODE GESSIE — drawingAiguille
 * ============================================================================
 *
 *  Extrait du bundle Vue de Gessie (renderer.js, app.asar décompressé).
 *  Reformaté pour la lisibilité — le bundle est minifié sur une seule ligne.
 *
 *  Pipeline complet pour rendre un item de type "aiguille" sur le TCO :
 *
 *    station.items[i] (toolId="aiguille", variationId="e-nw")
 *         │
 *         ▼  La factory ci-dessous (#1) crée dynamiquement un composant Vue
 *             "drawingAiguille" enregistré globalement.
 *         │
 *         ▼  Son template (depuis items/aiguille-0.0.0/settings.json) =
 *             <tco-aiguille :x="x" :y="y" :shape="ui" :name="item.name" />
 *         │
 *         ▼  Le composant <tco-aiguille> (#2) parse "shape" en tronc/branche,
 *             calcule vMod/hMod/trunk, etc.
 *         │
 *         ▼  Sa render function (#3) génère un <svg width=130 height=100>
 *             avec les paths/cercles selon hMod/vMod/trunk.
 *
 *  IMPORTANT : les paths SVG sont GÉNÉRÉS par code Vue, PAS depuis icons.svg.
 *  Le fichier items/aiguille-0.0.0/icons.svg n'est utilisé que pour l'icône
 *  de la palette d'outils dans l'éditeur.
 *
 * ============================================================================
 */


// =============================================================================
//  #1. FACTORY — crée le composant "drawingAiguille" à partir du tool
//      (renderer.js @313241)
// =============================================================================
//
// Pour chaque tool chargé (e = items/aiguille-0.0.0/settings.json),
// la factory enregistre un composant Vue global :
//
//   t  = "aiguille"
//   n  = "drawing"  (e.category)
//   a  = "drawingAiguille" (= category + capitalize(toolId))
//
// Le composant utilise le `template` du JSON de l'item :
//   "<tco-aiguille :x=\"x\" :y=\"y\" :shape=\"ui\" :name=\"item.name\" />"

T["drawingAiguille"] = {
  template: e.template, // string venant de aiguille-0.0.0/settings.json
  props: ["item"],
  components: {
    tcoControle: l.a,
    tcoVoie:     v.a,
    tcoAiguille: c.a,  // ← le vrai composant qui dessine — voir #2
    tcoZone:     g.a,
    tcoRail:     A.a,
    tcoJoint:    y.a,
    tcoSignal:   k.a,
    tcoTaquet:   u.a,
    tcoTraverse: I.a,
  },
  computed: {
    x: function() { return this.item.xPos; },
    y: function() { return this.item.yPos; },
  },
  data: function() {
    return {
      ix:       this.item.xPos,
      iy:       this.item.yPos,
      ui:       e.variations[this.item.variationId] && e.variations[this.item.variationId].ui,       // ex: "e-nw"
      jonction: e.variations[this.item.variationId] && e.variations[this.item.variationId].jonction,
      mode:     "play",
    };
  },
  methods: {
    updateItem: function() {},
  },
};


// =============================================================================
//  #2. COMPOSANT TCO-AIGUILLE — logique métier (data + computed + methods)
//      (renderer.js @276023)
// =============================================================================

const tcoAiguilleComponent = {
  props: ["name", "shape", "controle", "dynId"],

  /**
   * data() : parse shape (ex: "ne-nw") et calcule les modificateurs.
   *
   * shape format : "{tronc}-{branche}" où tronc/branche ∈ {e, w, n, s, ne, nw, se, sw}
   * (ex: "e-nw", "ne-se", "nw-sw")
   *
   * Sortie :
   *   tronc, branche : strings
   *   trunk : "e" | "nw" | "ne"  (canonique pour la render fn)
   *   vMod  : ±1  (sens vertical)
   *   hMod  : ±1  (sens horizontal)
   *   mode  : "play" | "edit"
   *   id    : "Ag" + name
   */
  data: function() {
    const e = this;
    const t = this.shape.split("-");
    let n = t[0];     // tronc
    let a = t[1];     // branche
    const i = a.split("");
    const r = "station" === this.$route.name ? "edit" : "play";
    let l, d, c;

    // Remap spécifique
    if ("e-ne" === this.shape) a = "nw";
    else if ("e-nw" === this.shape) a = "ne";

    // Détermination de trunk + modifiers selon le tronc
    if ("w" === n || "e" === n) {
      c = "e";
      l = "n" === i[0] ? -1 : 1;
      d = "e" === i[1] ? 1 : -1;
    } else if ("nw" === n || "se" === n) {
      c = "nw";
      l = 1;
      d = "e" === a ? -1 : 1;
    } else if ("ne" === n || "sw" === n) {
      c = "ne";
      l = -1;
      d = "e" === a ? -1 : 1;
    }

    // Menu contextuel (clic droit) avec checkboxes pour les dérangements
    const p = {
      ABSENCE_CONTROLE_GAUCHE:  /* MenuItem... */ undefined,
      ABSENCE_CONTROLE_DROITE:  /* MenuItem... */ undefined,
      ABSENCE_CONTROLE_COMPLET: /* MenuItem... */ undefined,
    };
    const u = /* new Menu() avec les items ci-dessus */ undefined;

    return {
      branche:   a,
      tronc:     n,
      trunk:     c,
      vMod:      l,
      hMod:      d,
      mode:      r,
      id:        "Ag" + this.name,
      menu:      u,
      menuItems: p,
    };
  },

  computed: {
    affectation: function() {
      if ("play" === this.mode) return this.$store.state.Player.affectations[this.id];
    },
    etat: function() {
      if ("play" === this.mode) return this.affectation.position;
    },
    controles: function() {
      if ("play" === this.mode) return this.affectation.controles;
    },
    disturbances: function() {
      if ("play" === this.mode) return this.affectation.disturbances;
    },
    branchName: function() {
      // "G" (gauche) ou "D" (droite)
      let e;
      if ("nw" === this.trunk) e = "G";
      else if ("ne" === this.trunk) e = "D";
      else if ("nw" === this.branche || "se" === this.branche) e = "D";
      else e = "G";
      return e;
    },
    trunkName: function() {
      return "G" === this.branchName ? "D" : "G";
    },
    trunkControle: function() {
      const e = this.affectation;
      return "D" === this.branchName ? e.controle.gauche : e.controle.droite;
    },
    branchControle: function() {
      const e = this.affectation;
      return "G" === this.branchName ? e.controle.gauche : e.controle.droite;
    },
    /** Couleur du contrôle de la branche : jaune si l'aiguille est sur cette voie. */
    branchColor: function() {
      return this.etat === this.branchName ? "#FFCC00" : "transparent";
    },
    /** Couleur du contrôle du tronc : jaune si l'aiguille est sur cette voie. */
    trunkColor: function() {
      return this.etat === this.trunkName ? "#FFCC00" : "transparent";
    },
  },

  watch: {
    disturbances: function() {
      // Met à jour les checkboxes du menu contextuel selon les dérangements actifs
      for (const e in this.menuItems) {
        const t = this.menuItems[e];
        t.checked = -1 !== this.disturbances.indexOf(e);
      }
    },
  },

  methods: {
    click: function() {
      // Ouvre le menu contextuel Electron
      if ("play" === this.mode) this.menu.popup(/* getCurrentWindow() */);
    },
  },
};


// =============================================================================
//  #3. RENDER FUNCTION — compilée depuis le template Vue (.vue)
//      (renderer.js @569560)
// =============================================================================
//
//  SVG container : width=130, height=100  ← la VRAIE taille d'une aiguille !
//
//  Deux branches principales selon `e.trunk` :
//    - "e"  : aiguilles à tronc horizontal (e-se, e-sw, e-ne, e-nw)
//    - else : aiguilles à tronc oblique (ne-nw, ne-se, nw-sw, nw-ne)
//
//  Conventions de la render function Vue :
//    e   = this  (le composant)
//    n   = createElement (createElement Vue)
//    e._v = textNode
//    e._e = empty placeholder
//    e._s = string conversion

const aiguilleRender = function() {
  const e = this;
  const t = e.$createElement;
  const n = e._self._c || t;

  return n("svg",
    {
      attrs: { width: "130", height: "100" },
      on: { contextmenu: e.click },
    },
    [
      // ----- Mode "edit" : petit cercle rouge à l'origine pour le drag -----
      "edit" === e.mode
        ? [n("circle", { attrs: { cx: "0", cy: "0", r: "3", stroke: "black", "stroke-width": "2", fill: "red" } })]
        : e._e(),

      e._v(" "),

      // =========================================================================
      // BRANCHE 1 : tronc horizontal ("e")  -- aiguilles e-se, e-sw, e-ne, e-nw
      // =========================================================================
      "e" == e.trunk
        ? [
            n("path", {
              attrs: {
                fill: "transparent",
                stroke: "#000000",
                "stroke-width": "2",
                "stroke-miterlimit": "10",
                d:
                  "M0," + 8 * e.vMod + "\n" +
                  "h" + (42 + 8 * e.vMod * e.hMod) + "\n" +
                  "l" + 60 * e.vMod * e.hMod + "," + 60 * e.vMod + "\n" +
                  "m22,0\n" +
                  "l" + (-60 * e.vMod * e.hMod) + "," + (-60 * e.vMod) + "\n" +
                  "h" + (36 - 8 * e.vMod * e.hMod) + "\n" +
                  "m0," + (-16 * e.vMod) + "\n" +
                  "h-100",
              },
            }),

            e._v(" "),

            // Cercle d'édition (mode "edit" uniquement)
            "edit" === e.mode
              ? [n("circle", { attrs: { cx: "100", cy: "0", r: "6", stroke: "grey", "stroke-width": "2", fill: "transparent" } })]
              : e._e(),

            e._v(" "),

            // Le nom (étiquette "1", "2", "D"...)
            n("text",
              {
                staticClass: "noscale",
                style: "transform-origin: " + ("down" === e.etat ? "top" : "bottom") + ";",
                attrs: { x: "40", y: 1 == e.vMod ? -15 : 30, "font-size": "16" },
              },
              [e._v(e._s(e.name))]
            ),

            e._v(" "),

            // Cercles de contrôle (mode "play" uniquement, 4 cas selon hMod/vMod)
            "play" === e.mode
              ? [
                  // Cas 1: hMod=+1, vMod=+1
                  1 == e.hMod && 1 == e.vMod
                    ? [
                        e.trunkControle
                          ? n("circle", { attrs: { cx: 48 + 20 * e.vMod * e.hMod, cy: 0, r: 6, fill: e.trunkColor, stroke: "#000000", "stroke-width": "1" } })
                          : e._e(),
                        e._v(" "),
                        e.branchControle
                          ? n("circle", { attrs: { cx: "73", cy: 20 * e.vMod, r: 6, fill: "none", stroke: "#000000", "stroke-width": "1", fill: e.branchColor } })
                          : e._e(),
                      ]
                    : e._e(),
                  e._v(" "),
                  // Cas 2: hMod=-1, vMod=+1
                  -1 == e.hMod && 1 == e.vMod
                    ? [
                        e.trunkControle
                          ? n("circle", { attrs: { cx: 48 + 20 * e.vMod * e.hMod, cy: 0, r: 6, fill: e.trunkColor, stroke: "#000000", "stroke-width": "1" } })
                          : e._e(),
                        e._v(" "),
                        e.branchControle
                          ? n("circle", { attrs: { cx: "33", cy: 20 * e.vMod, r: 6, fill: "none", stroke: "#000000", "stroke-width": "1", fill: e.branchColor } })
                          : e._e(),
                      ]
                    : e._e(),
                  e._v(" "),
                  // Cas 3: hMod=+1, vMod=-1
                  1 == e.hMod && -1 == e.vMod
                    ? [
                        e.trunkControle
                          ? n("circle", { attrs: { cx: 48 + 20 * e.vMod * e.hMod, cy: 0, r: 6, fill: e.trunkColor, stroke: "#000000", "stroke-width": "1" } })
                          : e._e(),
                        e._v(" "),
                        e.branchControle
                          ? n("circle", { attrs: { cx: "33", cy: 20 * e.vMod, r: 6, fill: "none", stroke: "#000000", "stroke-width": "1", fill: e.branchColor } })
                          : e._e(),
                      ]
                    : e._e(),
                  e._v(" "),
                  // Cas 4: hMod=-1, vMod=-1
                  -1 == e.hMod && -1 == e.vMod
                    ? [
                        e.trunkControle
                          ? n("circle", { attrs: { cx: 48 + 20 * e.vMod * e.hMod, cy: 0, r: 6, fill: e.trunkColor, stroke: "#000000", "stroke-width": "1" } })
                          : e._e(),
                        e._v(" "),
                        e.branchControle
                          ? n("circle", { attrs: { cx: "73", cy: 20 * e.vMod, r: 6, fill: "none", stroke: "#000000", "stroke-width": "1", fill: e.branchColor } })
                          : e._e(),
                      ]
                    : e._e(),
                ]
              : e._e(),
          ]
        : // =========================================================================
          // BRANCHE 2 : tronc oblique  -- aiguilles ne-nw, ne-se, nw-sw, nw-ne
          // =========================================================================
          [
            n("path", {
              attrs: {
                fill: "transparent",
                stroke: "#000000",
                "stroke-width": "2",
                "stroke-miterlimit": "10",
                d:
                  "M" + (50 - 50 * e.vMod) + "," + (-(50 + 3 * e.vMod) - 11 * (e.vMod * e.hMod)) + "\n" +
                  "l" + (100 * e.vMod) + ",100\n" +
                  "M" + (50 - 50 * e.vMod) + "," + (-(50 + 3 * e.vMod) + 11 * (e.vMod * e.hMod)) + "\n" +
                  "l" + (42 + 3 * e.vMod - 11 * e.vMod * e.hMod) * e.vMod + "," + (42 + 3 * e.vMod - 11 * e.hMod * e.vMod) + "\n" +
                  "H" + (53 + 2 * e.vMod - 17 * e.hMod - 40 * e.hMod) + "\n" +
                  "m0,16\n" +
                  "h" + e.hMod * (46 + 6 * (e.vMod * e.hMod)) + "\n" +
                  "l" + (40 * e.vMod) + ",40",
              },
            }),

            e._v(" "),

            // Cercles de contrôle (mode "play"). Note : ici tous les cas utilisent
            // les MÊMES coordonnées (ce qui est suspect mais c'est ce qui est dans
            // le bundle — peut-être un bug Gessie ou une normalisation par le path).
            "play" === e.mode
              ? [
                  1 == e.hMod && 1 == e.vMod
                    ? [
                        e.trunkControle
                          ? n("circle", { attrs: { cx: 50 - 10 * e.hMod, cy: 0, r: 6, fill: e.trunkColor, stroke: "#000000", "stroke-width": "1" } })
                          : e._e(),
                        e._v(" "),
                        e.branchControle
                          ? n("circle", { attrs: { cx: "73", cy: 20 * e.vMod, r: 6, fill: "none", stroke: "#000000", "stroke-width": "1", fill: e.branchColor } })
                          : e._e(),
                      ]
                    : e._e(),
                  e._v(" "),
                  -1 == e.hMod && 1 == e.vMod
                    ? [
                        e.trunkControle
                          ? n("circle", { attrs: { cx: 50 - 10 * e.hMod, cy: 0, r: 6, fill: e.trunkColor, stroke: "#000000", "stroke-width": "1" } })
                          : e._e(),
                        e._v(" "),
                        e.branchControle
                          ? n("circle", { attrs: { cx: "73", cy: 20 * e.vMod, r: 6, fill: "none", stroke: "#000000", "stroke-width": "1", fill: e.branchColor } })
                          : e._e(),
                      ]
                    : e._e(),
                  e._v(" "),
                  1 == e.hMod && -1 == e.vMod
                    ? [
                        e.trunkControle
                          ? n("circle", { attrs: { cx: 50 - 10 * e.hMod, cy: 0, r: 6, fill: e.trunkColor, stroke: "#000000", "stroke-width": "1" } })
                          : e._e(),
                        e._v(" "),
                        e.branchControle
                          ? n("circle", { attrs: { cx: "73", cy: 20 * e.vMod, r: 6, fill: "none", stroke: "#000000", "stroke-width": "1", fill: e.branchColor } })
                          : e._e(),
                      ]
                    : e._e(),
                  e._v(" "),
                  -1 == e.hMod && -1 == e.vMod
                    ? [
                        e.trunkControle
                          ? n("circle", { attrs: { cx: 50 - 10 * e.hMod, cy: 0, r: 6, fill: e.trunkColor, stroke: "#000000", "stroke-width": "1" } })
                          : e._e(),
                        e._v(" "),
                        e.branchControle
                          ? n("circle", { attrs: { cx: "73", cy: 20 * e.vMod, r: 6, fill: "none", stroke: "#000000", "stroke-width": "1", fill: e.branchColor } })
                          : e._e(),
                      ]
                    : e._e(),
                ]
              : e._e(),

            e._v(" "),

            // Le nom
            n("text",
              {
                staticClass: "noscale",
                style: "transform-origin: " + ("down" === e.etat ? "top" : "bottom") + ";",
                attrs: { x: 45 + 45 * e.hMod, y: -1 == e.vMod ? 42 : 60, "font-size": "16" },
              },
              [e._v(e._s(e.name))]
            ),
          ],
    ],
    2
  );
};

// staticRenderFns: []  (vide)


// =============================================================================
//  #4. SETTINGS.JSON DE L'ITEM AIGUILLE  (référence)
//  (items/aiguille-0.0.0/settings.json)
// =============================================================================

const aiguilleSettings = {
  label: "Aiguille",
  id: "aiguille",
  version: "0.0.0",
  icon: "./icons.svg#ne-se",
  variations: {
    "e-se":  { label: "e-se",  id: "e-se",  icon: "./icons.svg#e-se",  ui: "e-se"  },
    "e-sw":  { label: "e-sw",  id: "e-sw",  icon: "./icons.svg#e-sw",  ui: "e-sw"  },
    "e-ne":  { label: "e-ne",  id: "e-ne",  icon: "./icons.svg#e-ne",  ui: "e-ne"  },
    "e-nw":  { label: "e-nw",  id: "e-nw",  icon: "./icons.svg#e-nw",  ui: "e-nw"  },
    "ne-nw": { label: "ne-nw", id: "ne-nw", icon: "./icons.svg#ne-nw", ui: "ne-w"  },
    "ne-se": { label: "ne-se", id: "ne-se", icon: "./icons.svg#ne-se", ui: "ne-e"  },
    "nw-sw": { label: "nw-sw", id: "nw-sw", icon: "./icons.svg#nw-sw", ui: "nw-w"  },
    "nw-ne": { label: "nw-ne", id: "nw-ne", icon: "./icons.svg#nw-ne", ui: "nw-e"  },
  },
  options: [
    { label: "Nom", id: "name", type: "textfield", placeholder: "" },
  ],
  template: '<tco-aiguille :x="x" :y="y" :shape="ui" :name="item.name" />',
  files: [{ name: "icons.svg", type: "svg" }],
  category: "drawing",
};


// =============================================================================
//  RÉSUMÉ — pour reporter en React
// =============================================================================
//
//  Pour une aiguille `e-nw` (la plus fréquente à Clelles) :
//    shape    = "e-nw"
//    parsing  : tronc="e", branche initialement="nw" → remap "ne"
//    trunk    = "e", vMod = -1, hMod = 1 (à vérifier selon parse)
//    SVG      : 130 × 100 px
//    Path     : tracé avec deux mouvements diagonaux de 60px + horizontaux
//
//  Pour traduire fidèlement en React :
//    1. Supprimer TcoSvgIcon pour aiguille (ne pas utiliser icons.svg)
//    2. Faire un composant TcoAiguille qui :
//       - Parse shape exactement comme data() ci-dessus
//       - Calcule vMod/hMod/trunk
//       - Génère le path "d=..." avec les mêmes formules
//       - Rend dans un <g transform="translate(xPos, yPos)"> de 130×100
//    3. Le centre logique est à (0,0) du SVG interne, mais le path commence
//       à M0,8*vMod ou M(50-50*vMod), ce qui décale visuellement
//
// =============================================================================
