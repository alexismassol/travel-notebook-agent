import { describe, expect, it } from "vitest";
import { lookupDestination, placeQuery } from "./destination-lookup";

/**
 * Tests unitaires de PARSING : le réseau est simulé par un `fetchImpl` injecté qui rejoue
 * des réponses JSON copiées d'appels réels à l'API MediaWiki (action=query, generator=search),
 * capturées sur fr.wikipedia.org et en.wikipedia.org. Aucun appel réseau ici.
 */

// Réponse réelle : https://fr.wikipedia.org/w/api.php?...&gsrsearch=Congo...
// index 1 = "Congo", page d'homonymie (pageprops.disambiguation) sans photo ni coordonnées.
// index 2 = "République du Congo", résultat exploitable avec photo + coordonnées.
const FR_CONGO_DISAMBIGUATION = {
  batchcomplete: "",
  query: {
    pages: {
      "82732": {
        pageid: 82732,
        ns: 0,
        title: "Congo",
        index: 1,
        fullurl: "https://fr.wikipedia.org/wiki/Congo",
        canonicalurl: "https://fr.wikipedia.org/wiki/Congo",
        pageprops: { disambiguation: "" },
      },
      "784": {
        pageid: 784,
        ns: 0,
        title: "République du Congo",
        index: 2,
        // L'image de page réelle est une carte SVG (orthographic projection). Elle est remplacée
        // ici par une vraie photo bitmap, trouvée par une recherche Commons réelle elle aussi
        // ("Brazzaville Congo filetype:bitmap"). Ce test garde ainsi un seul objet : la page
        // d'homonymie ignorée, sans se recouper avec les tests du repli Commons.
        thumbnail: {
          source:
            "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/61/Congo_Martin%2C_Ngamaba%2C_Brazzaville%2C_Congo_2.jpg/960px-Congo_Martin%2C_Ngamaba%2C_Brazzaville%2C_Congo_2.jpg",
          width: 960,
          height: 625,
        },
        coordinates: [{ lat: -1.44, lon: 15.556, primary: "", globe: "earth" }],
        fullurl: "https://fr.wikipedia.org/wiki/R%C3%A9publique_du_Congo",
        canonicalurl: "https://fr.wikipedia.org/wiki/R%C3%A9publique_du_Congo",
      },
      "2627": {
        pageid: 2627,
        ns: 0,
        title: "République démocratique du Congo",
        index: 3,
        thumbnail: {
          source: "https://thumb.wikimedia.org/.../DRC.svg/960px-DRC.svg.png",
          width: 960,
          height: 960,
        },
        coordinates: [{ lat: -2.33333, lon: 22.8, primary: "", globe: "earth" }],
        fullurl: "https://fr.wikipedia.org/wiki/R%C3%A9publique_d%C3%A9mocratique_du_Congo",
        canonicalurl: "https://fr.wikipedia.org/wiki/R%C3%A9publique_d%C3%A9mocratique_du_Congo",
      },
    },
  },
};

// Réponse réelle pour une recherche sans aucun résultat : pas de clé `query` du tout.
// Le même résultat apparaît côté Commons pour un appel réel (requête absurde, gsrsearch=...
// filetype:bitmap) : `{"batchcomplete":""}`, donc réutilisée telle quelle pour "Commons ne trouve rien".
const NO_RESULTS = { batchcomplete: "" };

// Réponse réelle : https://commons.wikimedia.org/w/api.php?...&gsrsearch=Zanzibar%20Tanzanie%20filetype:bitmap...
// Le premier résultat par `index` est une photo bitmap paysage valide ; le second (index 3,
// non repris ici) est une autre photo qui ne serait de toute façon pas atteinte.
const COMMONS_ZANZIBAR_TANZANIE = {
  batchcomplete: "",
  query: {
    pages: {
      "88498769": {
        pageid: 88498769,
        ns: 6,
        title: "File:Photographie d'une tortue de Zanzibar.jpg",
        index: 1,
        imageinfo: [
          {
            mime: "image/jpeg",
            thumbwidth: 960,
            thumbheight: 655,
            thumburl:
              "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Photographie_d%27une_tortue_de_Zanzibar.jpg/960px-Photographie_d%27une_tortue_de_Zanzibar.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
          },
        ],
      },
      "15854540": {
        pageid: 15854540,
        ns: 6,
        title: "File:Stone Town, Zanzibar (1).jpg",
        index: 3,
        imageinfo: [
          {
            mime: "image/jpeg",
            thumbwidth: 960,
            thumbheight: 720,
            thumburl:
              "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ea/Stone_Town%2C_Zanzibar_%281%29.jpg/960px-Stone_Town%2C_Zanzibar_%281%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
          },
        ],
      },
    },
  },
};

// Réponse réelle : https://fr.wikipedia.org/w/api.php?...&gsrsearch=Açores%20Portugal...
// La page "Açores" a une image de page (drapeau, .svg) mais de vraies coordonnées.
const FR_ACORES_PORTUGAL = {
  batchcomplete: "",
  query: {
    pages: {
      "27447": {
        pageid: 27447,
        ns: 0,
        title: "Açores",
        index: 1,
        thumbnail: {
          source:
            "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6c/Flag_of_the_Azores.svg/960px-Flag_of_the_Azores.svg.png?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
          width: 960,
          height: 639,
        },
        coordinates: [{ lat: 38.624, lon: -28.031, primary: "", globe: "earth" }],
        fullurl: "https://fr.wikipedia.org/wiki/A%C3%A7ores",
        canonicalurl: "https://fr.wikipedia.org/wiki/A%C3%A7ores",
      },
    },
  },
};

// Réponse réelle : https://fr.wikipedia.org/w/api.php?...&gsrsearch=H%E1%BB%99i%20An%20Vietnam...
// La page "Hội An" a déjà une image de page bitmap (pas de repli Commons attendu). Le deuxième
// résultat (un portrait de dirigeant politique, hors sujet) est omis : il n'est jamais atteint
// puisque "Hội An" est le premier résultat par `index` et a déjà une photo.
const FR_HOIAN_VIETNAM = {
  batchcomplete: "",
  query: {
    pages: {
      "972391": {
        pageid: 972391,
        ns: 0,
        title: "Hội An",
        index: 1,
        thumbnail: {
          source:
            "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Hoi_An_%28I%29.jpg/960px-Hoi_An_%28I%29.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
          width: 960,
          height: 640,
        },
        coordinates: [{ lat: 15.87766944, lon: 108.33265, primary: "", globe: "earth" }],
        fullurl: "https://fr.wikipedia.org/wiki/H%E1%BB%99i_An",
        canonicalurl: "https://fr.wikipedia.org/wiki/H%E1%BB%99i_An",
      },
    },
  },
};

// Réel : https://commons.wikimedia.org/w/api.php?...&list=geosearch&gscoord=38.624%7C-28.031&
// gsradius=10000&gsnamespace=6&gslimit=5 (coordonnées d'Açores). Déjà trié par distance
// croissante (champ `dist`), au contraire de generator=geosearch, dont le champ `index` ne
// reflète pas la distance (ordre par pageid), vérifié par un appel réel.
const ACORES_GEOSEARCH_LIST = {
  batchcomplete: "",
  query: {
    geosearch: [
      { title: "File:Biscoitos - panoramio.jpg", dist: 1010.6 },
      { title: "File:Ladeiras - panoramio (4).jpg", dist: 1011.7 },
      { title: "File:Ladeiras - panoramio (5).jpg", dist: 1013 },
      {
        title:
          "File:Igreja Paroquial dos Biscoitos - Ilha de São Jorge - Portugal 🇵🇹 (55107823644).jpg",
        dist: 1017.2,
      },
      {
        title:
          "File:Ermida de Nossa Senhora do Socorro - Biscoitos - Ilha de São Jorge - Portugal 🇵🇹 (54729106978).jpg",
        dist: 1017.2,
      },
    ],
  },
};

// Réel : second appel du repli géolocalisé (prop=imageinfo&titles=<les 5 titres ci-dessus>).
// Aucun des 5 noms ne contient un mot de paysage ni "acores" : le premier (le plus proche,
// "Biscoitos") est donc retenu par défaut.
const ACORES_GEOSEARCH_INFO = {
  batchcomplete: "",
  query: {
    pages: {
      "56669908": {
        title: "File:Biscoitos - panoramio.jpg",
        imageinfo: [
          {
            mime: "image/jpeg",
            thumbwidth: 960,
            thumbheight: 640,
            thumburl:
              "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/63/Biscoitos_-_panoramio.jpg/960px-Biscoitos_-_panoramio.jpg",
          },
        ],
      },
      "56669911": {
        title: "File:Ladeiras - panoramio (4).jpg",
        imageinfo: [
          {
            mime: "image/jpeg",
            thumbwidth: 960,
            thumbheight: 640,
            thumburl:
              "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d3/Ladeiras_-_panoramio_%284%29.jpg/960px-Ladeiras_-_panoramio_%284%29.jpg",
          },
        ],
      },
      "56669912": {
        title: "File:Ladeiras - panoramio (5).jpg",
        imageinfo: [
          {
            mime: "image/jpeg",
            thumbwidth: 960,
            thumbheight: 640,
            thumburl:
              "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/Ladeiras_-_panoramio_%285%29.jpg/960px-Ladeiras_-_panoramio_%285%29.jpg",
          },
        ],
      },
      "185629948": {
        title:
          "File:Igreja Paroquial dos Biscoitos - Ilha de São Jorge - Portugal 🇵🇹 (55107823644).jpg",
        imageinfo: [
          {
            mime: "image/jpeg",
            thumbwidth: 960,
            thumbheight: 640,
            thumburl:
              "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/eb/Igreja_Paroquial_dos_Biscoitos.jpg/960px-Igreja_Paroquial_dos_Biscoitos.jpg",
          },
        ],
      },
      "176038789": {
        title:
          "File:Ermida de Nossa Senhora do Socorro - Biscoitos - Ilha de São Jorge - Portugal 🇵🇹 (54729106978).jpg",
        imageinfo: [
          {
            mime: "image/jpeg",
            thumbwidth: 960,
            thumbheight: 640,
            thumburl:
              "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/Ermida_de_Nossa_Senhora.jpg/960px-Ermida_de_Nossa_Senhora.jpg",
          },
        ],
      },
    },
  },
};

// Réel : list=geosearch&gscoord=-40%7C-140&gsradius=10000..., un point isolé du Pacifique Sud,
// sans aucune photo géolocalisée à moins de 10 km (tableau vide, forme réelle d'une réponse de
// geosearch sans résultat). Réutilisé dans des tests dont la page a d'autres coordonnées
// réelles : seule la FORME "geosearch vide" compte ici, pas la coïncidence de lieu.
const GEOSEARCH_EMPTY = { batchcomplete: "", query: { geosearch: [] as unknown[] } };

// Réel : https://fr.wikipedia.org/w/api.php?...&gsrsearch=Cap-Vert%20Cap-Vert...
// Image de page = carte orthographique SVG (exclue par ".svg" ET par le mot-clé "orthographic"
// ajouté à NON_PHOTO_FILENAME_KEYWORDS).
const FR_CAPVERT_PAYS = {
  batchcomplete: "",
  query: {
    pages: {
      "793": {
        pageid: 793,
        ns: 0,
        title: "Cap-Vert",
        index: 1,
        thumbnail: {
          source:
            "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/47/Cape_Verde_%28orthographic_projection%29.svg/960px-Cape_Verde_%28orthographic_projection%29.svg.png",
          width: 960,
          height: 960,
        },
        coordinates: [{ lat: 15.8, lon: -24.083, primary: "", globe: "earth" }],
        fullurl: "https://fr.wikipedia.org/wiki/Cap-Vert",
        canonicalurl: "https://fr.wikipedia.org/wiki/Cap-Vert",
      },
    },
  },
};

// Réel : https://commons.wikimedia.org/w/api.php?...&gsrsearch=Cap-Vert%20Cap-Vert%20filetype:
// bitmap... Homonymie réelle : le quartier "Cap Vert" (espace, pas de tiret) du tramway de
// Dijon remonte en tête d'une recherche texte sur le pays "Cap-Vert". Normalisé sans accent,
// "cap-vert" (tiret) n'est substring d'aucun des deux titres ci-dessous (qui ont un espace) :
// les deux sont donc rejetés.
const COMMONS_CAPVERT_HOMONYME = {
  batchcomplete: "",
  query: {
    pages: {
      "1": {
        title: "File:Station Cap Vert Tramway Dijon - Quetigny (FR21) - 2024-01-23 - 3.jpg",
        index: 1,
        imageinfo: [
          {
            mime: "image/jpeg",
            thumbwidth: 960,
            thumbheight: 720,
            thumburl:
              "https://upload.wikimedia.org/wikipedia/commons/x/Station_Cap_Vert_Tramway_Dijon.jpg",
          },
        ],
      },
      "2": {
        title: "File:Admiralty Chart No 1001 Cap Vert to Cap de Naze, Published 1916.jpg",
        index: 2,
        imageinfo: [
          {
            mime: "image/jpeg",
            thumbwidth: 960,
            thumbheight: 542,
            thumburl: "https://upload.wikimedia.org/wikipedia/commons/x/Admiralty_Chart_1001.jpg",
          },
        ],
      },
    },
  },
};

// COMPOSÉ (pas une capture réelle) : la forme (thumbnail bitmap + coordinates) est celle des
// autres fixtures réelles de ce fichier ; seul le nom de fichier est choisi pour isoler ce cas
// précis, une image satellite ni SVG ni nommée "carte/drapeau" (cas réel rencontré sur la page
// Wikipédia de Lanzarote : "Lanzarote's Lunar-Like Landscape.jpg", une image satellite
// NASA/Landsat dont le nom de fichier ne contient aucun mot-clé filtré, une limite connue).
// Coordonnées réutilisées : celles d'Açores, pour pouvoir réutiliser ACORES_GEOSEARCH_LIST/INFO
// comme repli géolocalisé.
const FR_SATELLITE_PAGE_COMPOSE = {
  batchcomplete: "",
  query: {
    pages: {
      "1": {
        pageid: 1,
        ns: 0,
        title: "Île Test (composé)",
        index: 1,
        thumbnail: {
          source: "https://upload.wikimedia.org/wikipedia/commons/x/Test_Island_satellite_view.jpg",
          width: 960,
          height: 640,
        },
        coordinates: [{ lat: 38.624, lon: -28.031, primary: "", globe: "earth" }],
        fullurl: "https://fr.wikipedia.org/wiki/%C3%8Ele_Test",
        canonicalurl: "https://fr.wikipedia.org/wiki/%C3%8Ele_Test",
      },
    },
  },
};

// Réponse réelle : https://en.wikipedia.org/w/api.php?...&gsrsearch=Zanzibar%20Tanzania...
const EN_ZANZIBAR_TANZANIA = {
  batchcomplete: "",
  query: {
    pages: {
      "34414": {
        pageid: 34414,
        ns: 0,
        title: "Zanzibar",
        index: 1,
        thumbnail: {
          source:
            "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Flag_of_Zanzibar.svg/960px-Flag_of_Zanzibar.svg.png?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
          width: 960,
          height: 639,
        },
        coordinates: [{ lat: -5.9, lon: 39.3, primary: "", globe: "earth" }],
        fullurl: "https://en.wikipedia.org/wiki/Zanzibar",
        canonicalurl: "https://en.wikipedia.org/wiki/Zanzibar",
      },
      "39092102": {
        pageid: 39092102,
        ns: 0,
        title: "List of heads of state of Tanzania",
        index: 2,
        fullurl: "https://en.wikipedia.org/wiki/List_of_heads_of_state_of_Tanzania",
        canonicalurl: "https://en.wikipedia.org/wiki/List_of_heads_of_state_of_Tanzania",
      },
      "6934693": {
        pageid: 6934693,
        ns: 0,
        title: "Zanzibar City",
        index: 3,
        thumbnail: {
          source: "https://thumb.wikimedia.org/.../Zanzibar_Town.jpg/960px-Zanzibar_Town.jpg",
          width: 960,
          height: 540,
        },
        coordinates: [{ lat: -6.165, lon: 39.199, primary: "", globe: "earth" }],
        fullurl: "https://en.wikipedia.org/wiki/Zanzibar_City",
        canonicalurl: "https://en.wikipedia.org/wiki/Zanzibar_City",
      },
    },
  },
};

/**
 * fetchImpl de test : sert un JSON par hôte, journalise les URLs appelées. Un hôte peut être
 * associé soit à un corps fixe (un seul type d'appel attendu sur cet hôte), soit à une fonction
 * de l'URL (cf. commonsRouter) quand un même hôte reçoit plusieurs appels différents dans un
 * même lookup (page -> geosearch liste -> geosearch fiches image -> recherche texte).
 */
function stubFetch(byHost: Record<string, unknown | ((url: string) => unknown)>): {
  fetchImpl: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push(url);
    const host = new URL(url).host;
    const responder = byHost[host];
    if (responder === undefined) throw new Error(`hôte inattendu dans le test : ${host}`);
    const body =
      typeof responder === "function" ? (responder as (u: string) => unknown)(url) : responder;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/**
 * Distingue les 3 formes d'appel à commons.wikimedia.org par leur signature dans l'URL (le
 * stub ne peut pas router par host seul dès qu'un lookup fait plusieurs appels Commons) :
 * `list=geosearch` (liste triée par distance), `titles=` (fiches image de ces titres, sans
 * `list=`/`generator=`), `generator=search` (recherche texte, chemin (c) en dernier recours).
 */
function commonsRouter(responses: {
  geosearchList?: unknown;
  geosearchInfo?: unknown;
  textSearch?: unknown;
}): (url: string) => unknown {
  return (url: string) => {
    if (url.includes("list=geosearch")) return responses.geosearchList ?? { batchcomplete: "" };
    if (url.includes("titles=")) return responses.geosearchInfo ?? { batchcomplete: "" };
    if (url.includes("generator=search")) return responses.textSearch ?? { batchcomplete: "" };
    throw new Error(`URL Commons inattendue dans le test : ${url}`);
  };
}

describe("lookupDestination", () => {
  // Test (a) du plan : image de page avec coordonnées, non photographique (drapeau SVG) ->
  // repli géolocalisé retenu, recherche texte JAMAIS appelée (elle aurait pu remonter un
  // homonyme, cf. test (b)). Coordonnées/lien/titre restent ceux de fr.
  it("page avec coordonnées, image non photo -> photo géolocalisée retenue, texte non appelé (a)", async () => {
    const { fetchImpl, calls } = stubFetch({
      "fr.wikipedia.org": FR_ACORES_PORTUGAL,
      "commons.wikimedia.org": commonsRouter({
        geosearchList: ACORES_GEOSEARCH_LIST,
        geosearchInfo: ACORES_GEOSEARCH_INFO,
      }),
    });

    const result = await lookupDestination("Açores", "Portugal (test a)", { fetchImpl });

    // Le mot de préférence "port" (LANDSCAPE_OR_SCENERY_WORDS) matche aussi "Portugal" - ici le
    // 4e candidat par distance ("Igreja Paroquial... Portugal") est donc préféré au plus proche
    // ("Biscoitos", qui ne matche aucun mot de préférence). Comportement réel, vérifié : les deux
    // sont de vraies photos des Açores (aucun faux lieu), seul le déclencheur est fortuit.
    expect(result).toEqual({
      imageUrl:
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/eb/Igreja_Paroquial_dos_Biscoitos.jpg/960px-Igreja_Paroquial_dos_Biscoitos.jpg",
      coordinates: { lat: 38.624, lon: -28.031 },
      pageUrl: "https://fr.wikipedia.org/wiki/A%C3%A7ores",
      title: "Açores",
    });
    // 3 appels : fr, puis les deux appels du repli géolocalisé (liste puis fiches image) -
    // jamais de recherche texte (generator=search) sur Commons.
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("fr.wikipedia.org");
    expect(calls[1]).toContain("list=geosearch");
    expect(calls[2]).toContain("titles=");
    // Aucune recherche texte SUR COMMONS (le premier appel, vers fr.wikipedia.org, utilise lui
    // aussi generator=search pour la résolution de page, ce n'est pas ce qu'on exclut ici).
    expect(
      calls.some((u) => u.includes("commons.wikimedia.org") && u.includes("generator=search")),
    ).toBe(false);
  });

  it("géosearch sans nom pertinent -> pas de photo plutôt qu'une photo hors sujet (cas réel : œufs au centre du Sénégal)", async () => {
    // Composé : même forme que les réponses réelles ci-dessus ; seul le nom de fichier change,
    // calqué sur une image vue à l'écran (œufs de musée au centroïde du pays).
    const { fetchImpl } = stubFetch({
      "fr.wikipedia.org": FR_ACORES_PORTUGAL,
      "commons.wikimedia.org": commonsRouter({
        geosearchList: {
          batchcomplete: "",
          query: { geosearch: [{ title: "File:Numida meleagris eggs MHNT.jpg", dist: 850.2 }] },
        },
        geosearchInfo: {
          batchcomplete: "",
          query: {
            pages: {
              "1": {
                title: "File:Numida meleagris eggs MHNT.jpg",
                imageinfo: [
                  {
                    mime: "image/jpeg",
                    thumbwidth: 960,
                    thumbheight: 640,
                    thumburl: "https://thumb.wikimedia.org/eggs.jpg",
                  },
                ],
              },
            },
          },
        },
      }),
    });
    const result = await lookupDestination("Sénégal composé", "Sénégal", { fetchImpl });
    expect(result.imageUrl).toBeNull();
  });

  // Test (c) du plan : une image satellite de page (bitmap, ni SVG ni nommée "carte/drapeau")
  // est rejetée par le mot-clé "satellite" -> repli géolocalisé retenu (même mécanique que (a)).
  it("image satellite de page rejetée -> repli géolocalisé retenu (c)", async () => {
    const { fetchImpl } = stubFetch({
      "fr.wikipedia.org": FR_SATELLITE_PAGE_COMPOSE,
      "commons.wikimedia.org": commonsRouter({
        geosearchList: ACORES_GEOSEARCH_LIST,
        geosearchInfo: ACORES_GEOSEARCH_INFO,
      }),
    });

    const result = await lookupDestination("Île Test", "Composé (test c)", { fetchImpl });

    // Même candidat retenu que le test (a) (mot de préférence "port", cf. commentaire là-bas) :
    // ce qui compte ici, c'est que ce ne soit PAS l'image satellite de la page.
    expect(result.imageUrl).toBe(
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/eb/Igreja_Paroquial_dos_Biscoitos.jpg/960px-Igreja_Paroquial_dos_Biscoitos.jpg",
    );
    expect(result.imageUrl).not.toContain("satellite");
  });

  // Test (b) du plan : geosearch vide -> recherche texte -> l'unique candidat ne contient pas
  // le nom du lieu (homonyme "Cap Vert" / Dijon) -> rejeté -> imageUrl reste null, mais
  // coordonnées/lien/titre sont gardés.
  it("géosearch vide -> recherche texte -> résultat sans le nom du lieu rejeté -> imageUrl null (b)", async () => {
    const { fetchImpl, calls } = stubFetch({
      "fr.wikipedia.org": FR_CAPVERT_PAYS,
      "commons.wikimedia.org": commonsRouter({
        geosearchList: GEOSEARCH_EMPTY,
        textSearch: COMMONS_CAPVERT_HOMONYME,
      }),
    });

    const result = await lookupDestination("Cap-Vert", "Cap-Vert (test b)", { fetchImpl });

    expect(result).toEqual({
      imageUrl: null,
      coordinates: { lat: 15.8, lon: -24.083 },
      pageUrl: "https://fr.wikipedia.org/wiki/Cap-Vert",
      title: "Cap-Vert",
    });
    // 3 appels : fr, geosearch (vide, donc un seul appel, pas de second appel "fiches image" sur
    // une liste vide), puis la recherche texte dont l'unique candidat homonyme est rejeté.
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain("list=geosearch");
    expect(calls[2]).toContain("generator=search");
  });

  // Variante de (b) : geosearch vide ET recherche texte sans aucun résultat (pas seulement un
  // homonyme rejeté) -> imageUrl null, coordonnées/lien/titre gardés.
  it("géosearch vide et recherche texte sans résultat -> imageUrl null mais coordonnées gardées", async () => {
    const { fetchImpl, calls } = stubFetch({
      "fr.wikipedia.org": FR_ACORES_PORTUGAL,
      "commons.wikimedia.org": commonsRouter({
        geosearchList: GEOSEARCH_EMPTY,
        textSearch: NO_RESULTS,
      }),
    });

    const result = await lookupDestination("Açores", "Portugal (test c bis)", { fetchImpl });

    expect(result).toEqual({
      imageUrl: null,
      coordinates: { lat: 38.624, lon: -28.031 },
      pageUrl: "https://fr.wikipedia.org/wiki/A%C3%A7ores",
      title: "Açores",
    });
    expect(calls).toHaveLength(3);
  });

  // Test (d) : l'image de page est déjà une photo bitmap -> aucun appel Commons.
  it("photo de page déjà bitmap -> pas d'appel Commons", async () => {
    const { fetchImpl, calls } = stubFetch({ "fr.wikipedia.org": FR_HOIAN_VIETNAM });

    const result = await lookupDestination("Hội An", "Vietnam (test d)", { fetchImpl });

    expect(result).toEqual({
      imageUrl:
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Hoi_An_%28I%29.jpg/960px-Hoi_An_%28I%29.jpg?utm_source=fr.wikipedia.org&utm_campaign=api&utm_content=thumbnail",
      coordinates: { lat: 15.87766944, lon: 108.33265 },
      pageUrl: "https://fr.wikipedia.org/wiki/H%E1%BB%99i_An",
      title: "Hội An",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("fr.wikipedia.org");
  });

  it("premier résultat homonymie ignoré, second retenu", async () => {
    const { fetchImpl, calls } = stubFetch({ "fr.wikipedia.org": FR_CONGO_DISAMBIGUATION });

    const result = await lookupDestination("Congo", "Congo (test 2)", { fetchImpl });

    expect(result.title).toBe("République du Congo");
    expect(result.imageUrl).not.toBeNull();
    expect(result.coordinates).toEqual({ lat: -1.44, lon: 15.556 });
    // Un seul appel : la page d'homonymie index 1 est écartée sans repli sur en.wikipedia.
    expect(calls).toHaveLength(1);
  });

  it("fr sans résultat -> repli en.wikipedia (drapeau aussi) -> geosearch vide -> texte retenu, tortue exclue au profit de Stone Town", async () => {
    // en.wikipedia.org sert aussi un drapeau SVG pour "Zanzibar" (capture réelle) ; le repli
    // géolocalisé puis texte doivent donc aussi jouer leur rôle après fr -> en.
    const { fetchImpl, calls } = stubFetch({
      "fr.wikipedia.org": NO_RESULTS,
      "en.wikipedia.org": EN_ZANZIBAR_TANZANIA,
      "commons.wikimedia.org": commonsRouter({
        geosearchList: GEOSEARCH_EMPTY,
        textSearch: COMMONS_ZANZIBAR_TANZANIE,
      }),
    });

    const result = await lookupDestination("Zanzibar", "Tanzania (test 3)", { fetchImpl });

    expect(result.title).toBe("Zanzibar");
    expect(result.pageUrl).toBe("https://en.wikipedia.org/wiki/Zanzibar");
    expect(result.coordinates).toEqual({ lat: -5.9, lon: 39.3 });
    expect(result.imageUrl).toBe(
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ea/Stone_Town%2C_Zanzibar_%281%29.jpg/960px-Stone_Town%2C_Zanzibar_%281%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail",
    );
    expect(calls).toHaveLength(4);
    expect(calls[0]).toContain("fr.wikipedia.org");
    expect(calls[1]).toContain("en.wikipedia.org");
    expect(calls[2]).toContain("list=geosearch");
    expect(calls[3]).toContain("generator=search");
  });

  it("fetch qui rejette -> tous les champs null, pas d'exception", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const result = await lookupDestination("Atlantide", "Nulle part (test 4a)", { fetchImpl });

    expect(result).toEqual({ imageUrl: null, coordinates: null, pageUrl: null, title: null });
  });

  it("timeout (AbortController) -> tous les champs null, pas d'exception", async () => {
    // fetch qui ne résout jamais tant que le signal n'est pas abandonné, comme un vrai fetch
    // qui respecte AbortSignal : on vérifie que le timeoutMs déclenche bien l'abandon.
    const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      })) as typeof fetch;

    const result = await lookupDestination("Trollholm", "Norvège (test 4b)", {
      fetchImpl,
      timeoutMs: 20,
    });

    expect(result).toEqual({ imageUrl: null, coordinates: null, pageUrl: null, title: null });
  });

  it("cache : second appel identique ne refait pas de fetch", async () => {
    const { fetchImpl, calls } = stubFetch({ "fr.wikipedia.org": FR_CONGO_DISAMBIGUATION });

    const first = await lookupDestination("Bordeaux", "France (test 5)", { fetchImpl });
    expect(calls).toHaveLength(1);

    const second = await lookupDestination("Bordeaux", "France (test 5)", { fetchImpl });
    expect(calls).toHaveLength(1); // pas de second appel réseau
    expect(second).toEqual(first);

    // Insensible à la casse / aux espaces, la clé de cache est normalisée.
    const third = await lookupDestination("  BORDEAUX  ", "france (test 5)", { fetchImpl });
    expect(calls).toHaveLength(1);
    expect(third).toEqual(first);
  });
});

describe("cache et échecs transitoires", () => {
  it("un échec réseau n'est pas mis en cache : l'appel suivant réessaie", async () => {
    let calls = 0;
    const failing = (async () => {
      calls += 1;
      throw new Error("réseau coupé");
    }) as unknown as typeof fetch;
    const name = `Lieu-transitoire-${Date.now()}`;
    await lookupDestination(name, "Pays", { fetchImpl: failing, timeoutMs: 200 });
    const afterFirst = calls;
    await lookupDestination(name, "Pays", { fetchImpl: failing, timeoutMs: 200 });
    expect(afterFirst).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(afterFirst);
  });
});

/**
 * Sur 10 fiches réelles, 5 restent sans photo. Les libellés composés écrits par le modèle
 * (« Maroc (région d'Agadir) », « Zanzibar (Tanzanie) ») cherchent un titre qui n'existe pas
 * sur Wikipédia.
 */
describe("placeQuery : le lieu, pas la parenthèse", () => {
  it("garde ce qui est dans la parenthèse quand le début répète le pays", () => {
    expect(placeQuery("Maroc (région d'Agadir)", "Maroc")).toBe("région d'Agadir");
  });

  it("garde le lieu quand la parenthèse répète le pays", () => {
    expect(placeQuery("Zanzibar (Tanzanie)", "Tanzanie")).toBe("Zanzibar");
    expect(placeQuery("Agadir (Maroc)", "Maroc")).toBe("Agadir");
  });

  it("un nom simple n'est pas touché", () => {
    expect(placeQuery("Vietnam", "Vietnam")).toBe("Vietnam");
    expect(placeQuery("  Sénégal  ", "Sénégal")).toBe("Sénégal");
  });

  it("la recherche part bien du lieu nettoyé", async () => {
    const { fetchImpl, calls } = stubFetch({
      "fr.wikipedia.org": { type: "standard", title: "Agadir" },
      "en.wikipedia.org": { type: "standard", title: "Agadir" },
      "commons.wikimedia.org": commonsRouter({}),
    });
    await lookupDestination("Maroc (région d'Agadir)", "Maroc", { fetchImpl });
    // Les espaces d'une requête sont encodés en `+` dans l'URL.
    expect(decodeURIComponent(calls[0] ?? "").replace(/\+/g, " ")).toContain(
      "région d'Agadir Maroc",
    );
  });
});

/**
 * Cas réels du 2026-09-25 : pour une fiche qui porte sur un pays entier, « Albanie » montrait
 * un sabre de musée et « Jordanie » une avenue de Paris. La page d'un pays a pour image un
 * drapeau ou une carte ; l'article, lui, contient des photos du pays, dans l'ordre de lecture.
 */
describe("fiche d'un pays entier", () => {
  const PAGE_ALBANIE = {
    batchcomplete: "",
    query: {
      pages: {
        "1": {
          pageid: 1,
          ns: 0,
          title: "Albanie",
          index: 1,
          thumbnail: {
            source:
              "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Flag_of_Albania.svg/960px-Flag_of_Albania.svg.png",
            width: 960,
            height: 686,
          },
          coordinates: [{ lat: 41, lon: 20, primary: "", globe: "earth" }],
          fullurl: "https://fr.wikipedia.org/wiki/Albanie",
        },
      },
    },
  };
  // Ordre réel de l'article fr « Albanie » (action=parse&prop=images), raccourci.
  const IMAGES_ALBANIE = {
    parse: {
      title: "Albanie",
      images: [
        "Flag_of_Albania.svg",
        "Albania_location_map.png",
        "Satellite_image_of_Albania_in_May_2003.jpg",
        "Byllis-01-Alb.jpg",
        "Apollonia,_Albania_-_panorama_(by_Pudelek).JPG",
      ],
    },
  };
  const INFO_BYLLIS = {
    query: {
      pages: {
        "-1": {
          title: "File:Byllis-01-Alb.jpg",
          imageinfo: [
            {
              thumburl:
                "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Byllis-01-Alb.jpg/960px-Byllis-01-Alb.jpg",
              thumbwidth: 960,
              thumbheight: 640,
              mime: "image/jpeg",
            },
          ],
        },
      },
    },
  };

  it("prend la première vraie photo de l'article, dans l'ordre de la page", async () => {
    const { fetchImpl, calls } = stubFetch({
      "fr.wikipedia.org": (url: string) =>
        url.includes("action=parse") ? IMAGES_ALBANIE : PAGE_ALBANIE,
      "commons.wikimedia.org": commonsRouter({ geosearchInfo: INFO_BYLLIS }),
    });
    const r = await lookupDestination("Albanie", "Albanie", { fetchImpl });
    expect(r.imageUrl).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Byllis-01-Alb.jpg/960px-Byllis-01-Alb.jpg",
    );
    // Ni géolocalisation ni recherche texte : c'est la recherche texte qui ramenait le sabre.
    expect(calls.some((u) => u.includes("list=geosearch"))).toBe(false);
    expect(calls.some((u) => u.includes("commons") && u.includes("generator=search"))).toBe(false);
  });

  it("ne répète pas le nom du pays dans la recherche", async () => {
    const { fetchImpl, calls } = stubFetch({
      "fr.wikipedia.org": (url: string) =>
        url.includes("action=parse") ? IMAGES_ALBANIE : PAGE_ALBANIE,
      "commons.wikimedia.org": commonsRouter({ geosearchInfo: INFO_BYLLIS }),
    });
    await lookupDestination("Maroc", "Maroc", { fetchImpl });
    const recherche = decodeURIComponent(calls[0] ?? "").replace(/\+/g, " ");
    expect(recherche).toContain("gsrsearch=Maroc&");
    expect(recherche).not.toContain("Maroc Maroc");
  });

  it("écarte une photo de musée même quand « Musée » est encodé dans l'URL", async () => {
    const PAGE_SABRE = structuredClone(PAGE_ALBANIE);
    const page = PAGE_SABRE.query.pages["1"];
    page.title = "Test sabre";
    page.thumbnail.source =
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9f/Sabre_yatagan-Albanie-Mus%C3%A9e_barrois_%28d%C3%A9tail%29.jpg/960px-Sabre_yatagan-Albanie-Mus%C3%A9e_barrois_%28d%C3%A9tail%29.jpg";
    const { fetchImpl } = stubFetch({
      "fr.wikipedia.org": (url: string) =>
        url.includes("action=parse") ? { parse: { images: [] } } : PAGE_SABRE,
      "commons.wikimedia.org": commonsRouter({}),
    });
    const r = await lookupDestination("Test sabre", "Pays du sabre", { fetchImpl });
    expect(r.imageUrl).toBeNull();
  });
});

describe("limite de requêtes et musées en d'autres langues", () => {
  const page = (titre: string) => ({
    batchcomplete: "",
    query: {
      pages: {
        "1": {
          pageid: 1,
          ns: 0,
          title: titre,
          index: 1,
          thumbnail: {
            source: `https://upload.wikimedia.org/x/Flag_of_${titre}.svg/960px-Flag.svg.png`,
            width: 960,
            height: 640,
          },
          fullurl: `https://fr.wikipedia.org/wiki/${titre}`,
        },
      },
    },
  });
  const info = (titre: string, url: string) => ({
    title: titre,
    imageinfo: [{ thumburl: url, thumbwidth: 960, thumbheight: 640, mime: "image/jpeg" }],
  });

  it("une réponse 429 de Wikimédia n'est pas mise en cache : l'appel suivant réessaie", async () => {
    // Cas réel : pendant une rafale de fiches, Commons répond 429. Le lieu restait sans photo
    // pour toute la vie du processus.
    let appels = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = input.toString();
      appels += 1;
      if (url.includes("commons.wikimedia.org"))
        return new Response("Too many requests", { status: 429 });
      if (url.includes("action=parse")) {
        return Response.json({ parse: { images: ["Paysage_de_Testlande.jpg"] } });
      }
      return Response.json(page("Testlande"));
    }) as typeof fetch;
    const premier = await lookupDestination("Testlande", "Testlande", { fetchImpl });
    const avant = appels;
    await lookupDestination("Testlande", "Testlande", { fetchImpl });
    expect(premier.imageUrl).toBeNull();
    expect(appels).toBeGreaterThan(avant);
  });

  it("écarte un musée nommé en catalan ou en ouzbek, et garde la photo suivante", async () => {
    // Cas réel : « Ouzbékistan » affichait « Amaliy San'at Muzeyi, Museu d'Arts Aplicades ».
    const musee = "124_Amaliy_San'at_Muzeyi,_Museu_d'Arts_Aplicades.jpg";
    const { fetchImpl } = stubFetch({
      "fr.wikipedia.org": (url: string) =>
        url.includes("action=parse")
          ? { parse: { images: [musee, "Registan_Samarkand.jpg"] } }
          : page("Ouzbékistan"),
      "commons.wikimedia.org": commonsRouter({
        geosearchInfo: {
          query: {
            pages: {
              "-1": info(
                `File:${musee.replace(/_/g, " ")}`,
                "https://upload.wikimedia.org/muzeyi.jpg",
              ),
              "-2": info(
                "File:Registan Samarkand.jpg",
                "https://upload.wikimedia.org/registan.jpg",
              ),
            },
          },
        },
      }),
    });
    const r = await lookupDestination("Ouzbékistan", "Ouzbékistan", { fetchImpl });
    expect(r.imageUrl).toBe("https://upload.wikimedia.org/registan.jpg");
  });
});
