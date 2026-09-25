/**
 * Résout la photo, les coordonnées et le lien d'une destination via l'API MediaWiki
 * (fr.wikipedia.org puis repli sur en.wikipedia.org), sans clé et sans jamais lever
 * d'exception : un échec de recherche ne doit pas casser la fiche destination affichée
 * à l'utilisateur, seulement priver la fiche de sa photo.
 *
 * Le modèle ne fournit que le nom du lieu et le pays : une coordonnée ou une URL d'image
 * écrites par un LLM peuvent être fausses, donc le serveur seul les résout.
 *
 * Direction artistique : la fiche doit montrer une PHOTO du lieu, jamais une carte, un drapeau
 * ou une image satellite, et jamais la photo d'un lieu homonyme d'une autre région. Repli en
 * cascade, vrais appels à l'appui (cf. constantes ci-dessous pour le détail mesuré) :
 *   a. l'image de la page Wikipédia (fr puis en), si c'est une photo ;
 *   b. sinon, si la page a des coordonnées : une photo géolocalisée sur Wikimedia Commons près
 *      de ce point. Ça corrige les cas où l'image de page est une carte ou un satellite, comme
 *      "Cap-Vert", "Lanzarote" ou "Oman" ;
 *   a'. pour une fiche qui porte sur un pays entier : la première vraie photo de l'article, dans
 *      l'ordre de lecture. La recherche texte ramenait sinon un sabre de musée pour « Albanie »
 *      et une avenue de Paris pour « Jordanie » ;
 *   c. sinon seulement (pas de coordonnées, ou aucune photo géolocalisée exploitable) : la
 *      recherche texte Commons, en exigeant que le nom de fichier contienne le nom du lieu.
 *      Sans quoi un homonyme d'une autre région peut remonter, comme "Cap-Vert" (le pays) qui
 *      renvoie le tramway du quartier "Cap Vert" à Dijon ;
 *   d. sinon : `imageUrl` reste `null` plutôt que d'afficher une image fausse ou hors sujet.
 */

// Politique Wikimedia : un User-Agent identifiable est obligatoire sur l'API REST/action.
const WIKI_USER_AGENT = "travel-notebook-agent/0.1 (demo)";
// Ordre de repli : fr d'abord (langue de l'agent), puis en si fr ne donne rien d'exploitable.
const PRIMARY_HOST = "fr.wikipedia.org";
const FALLBACK_HOST = "en.wikipedia.org";
// Repli photo quand l'image de page (fr ou en) n'est pas une photo exploitable.
const COMMONS_HOST = "commons.wikimedia.org";
// gsrlimit : nombre de candidats de recherche examinés par hôte (les pages d'homonymie
// et les résultats hors sujet passent souvent avant le bon résultat).
const SEARCH_RESULT_LIMIT = 3;
// gsrlimit côté Commons : plus large que côté wiki, car les portraits, blasons et photos
// hors-sujet y sont fréquents avant une bonne photo de paysage/lieu.
const COMMONS_SEARCH_RESULT_LIMIT = 8;
// Espace de noms 6 = fichiers (File:) sur Commons.
const COMMONS_FILE_NAMESPACE = 6;
// Restreint la recherche Commons aux images matricielles : exclut nativement les SVG
// (cartes, drapeaux, blasons vectoriels). Les tests utilisent une réponse capturée sur un
// appel réel. "bitmap" est la valeur reconnue par l'API de recherche MediaWiki (CirrusSearch) ;
// il n'existe pas de filtre "photo" natif.
const COMMONS_FILETYPE_FILTER = "filetype:bitmap";
// Nombre d'images de l'article d'un pays examinées, dans l'ordre de la page.
const ARTICLE_PHOTO_CANDIDATES = 10;
// pithumbsize / iiurlwidth : résolution de la photo demandée à l'API.
const THUMBNAIL_SIZE_PX = 960;
// Sous ce seuil, l'image est une miniature ou un recadrage trop serré pour une fiche destination.
const MIN_PHOTO_WIDTH_PX = 800;
const MIN_PHOTO_HEIGHT_PX = 500;
// PNG exclu volontairement : sur Commons, c'est très souvent une carte, un blason ou une
// infographie plutôt qu'une photo (le JPEG/WebP quasi jamais).
const PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/webp"]);
// Mots-clés (insensibles à la casse, recherchés dans l'URL/le nom de fichier) qui trahissent
// une carte, un drapeau, un blason, un logo ou une vue satellite/aérienne plutôt qu'une photo
// du lieu. "iss0" cible les photos prises depuis la Station spatiale internationale (nommées
// "ISS0nn-E-nnnnn" ou "ISS1nn-E-..." sur Commons). Sur les coordonnées de plusieurs pays, comme
// Cap-Vert ou la Géorgie, c'est souvent le seul type de résultat à moins de 10 km du centroïde
// du pays.
const NON_PHOTO_FILENAME_KEYWORDS = [
  // Sujets qui ne montrent pas le lieu, comme une tortue pour Zanzibar ou des poignards en
  // vitrine pour Oman.
  "tortoise",
  "turtle",
  "tortue",
  "animal",
  "bird",
  "oiseau",
  "insect",
  "butterfly",
  "lizard",
  "museum",
  "musee",
  // Même musée dans d'autres langues. Cas réel : « Amaliy San'at Muzeyi, Museu d'Arts
  // Aplicades » affiché pour l'Ouzbékistan.
  "museu",
  "museo",
  "muzey",
  "muzeum",
  "interior",
  "dagger",
  "khanjar",
  "flag",
  "map",
  "carte",
  "locator",
  "location",
  "projection",
  "blason",
  "coat_of_arms",
  "logo",
  "satellite",
  "aerial",
  "nasa",
  "iss0",
  "drapeau",
  "relief",
  "topographic",
  "orthographic",
  "montage",
  "collage",
];
// Rayon (mètres) de la recherche de photos géolocalisées autour des coordonnées de la page
// Wikipédia. 10 km : assez large pour couvrir une ville ou une petite île, assez restreint pour
// rester pertinent quand la coordonnée est celle d'un pays entier. Dans ce dernier cas, sur des
// pays comme Cap-Vert, Oman, Géorgie ou Sri Lanka, il n'y a souvent rien d'exploitable dans ce
// rayon : repli sur la recherche texte, cf. plus bas.
const COMMONS_GEOSEARCH_RADIUS_M = 10000;
// Nombre de candidats géolocalisés examinés, triés par distance croissante. Sur Wikimedia
// Commons (environ 30 requêtes), 20 tient sous 1,3 à 1,4 s pour les deux requêtes du repli
// géolocalisé (liste et fiches image), largement dans le budget global.
const GEOSEARCH_RESULT_LIMIT = 20;
// Longueur minimale d'un mot du nom du lieu utilisé pour la préférence de photo géolocalisée
// (cf. LANDSCAPE_OR_SCENERY_WORDS) : sous ce seuil, un mot comme "an" (dans "Hội An") ou "le"
// matcherait beaucoup trop de noms de fichiers sans rapport.
const MIN_PLACE_WORD_LENGTH = 3;
// Mots (déjà normalisés : sans accent, minuscules) qui, dans un nom de fichier Commons,
// trahissent une photo de paysage ou de lieu de vie plutôt qu'un sujet quelconque pris au même
// endroit (portrait, événement, objet...). Utilisés uniquement pour PRÉFÉRER un candidat
// géolocalisé parmi ceux déjà jugés exploitables, jamais pour en exclure un.
const LANDSCAPE_OR_SCENERY_WORDS = [
  "view",
  "vue",
  "panorama",
  "beach",
  "plage",
  "town",
  "village",
  "harbour",
  "port",
  "landscape",
  "paysage",
  "coast",
  "cote",
  "bay",
  "baie",
  "old",
  "street",
  "rue",
];
// Budget total du lookup (recherche fr + repli en + repli Commons éventuels), pas par requête
// HTTP. Sur des appels réels : recherche wiki entre 0,15 et 0,45 s, recherche texte Commons
// entre 0,15 et 0,7 s, repli géolocalisé (deux requêtes séquentielles) entre 1,3 et 1,4 s.
// Le budget est porté de 3000 à 4000 ms après un dépassement sur "Canaries" (fr, géolocalisé
// et repli texte séquentiels). La latence mesurée était de 3003 ms : le lookup était abandonné
// par le timeout de 3000 ms alors qu'il aurait probablement abouti. Le repli géolocalisé ajoute
// une requête de plus que l'ancien chemin, et le pire cas (quatre requêtes séquentielles)
// dépasse parfois 3 s.
const DEFAULT_TIMEOUT_MS = 4000;
// Taille max du cache mémoire ; au-delà, l'entrée la plus ancienne est évincée (FIFO).
const CACHE_MAX_ENTRIES = 500;

export interface DestinationLookup {
  imageUrl: string | null;
  coordinates: { lat: number; lon: number } | null;
  pageUrl: string | null;
  title: string | null;
}

const NULL_RESULT: DestinationLookup = {
  imageUrl: null,
  coordinates: null,
  pageUrl: null,
  title: null,
};

// Sous-ensemble de la réponse MediaWiki (action=query&generator=search) réellement utilisé.
interface WikiPage {
  index?: number;
  title?: string;
  fullurl?: string;
  canonicalurl?: string;
  thumbnail?: { source?: string };
  coordinates?: { lat: number; lon: number }[];
  pageprops?: { disambiguation?: string };
}

interface WikiQueryResponse {
  query?: { pages?: Record<string, WikiPage> };
}

// Sous-ensemble de la réponse MediaWiki (action=query&generator=search sur Commons,
// prop=imageinfo) réellement utilisé.
interface CommonsImageInfo {
  mime?: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
}

interface CommonsPage {
  index?: number;
  title?: string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsQueryResponse {
  query?: { pages?: Record<string, CommonsPage> };
}

// Sous-ensemble de la réponse MediaWiki (action=query&list=geosearch) réellement utilisé.
// Contrairement à generator=geosearch, dont le champ `index` ne reflète PAS la distance : il
// correspond en fait à l'ordre croissant des pageid, pas à la proximité. Cette forme "liste"
// renvoie déjà les résultats triés par distance croissante, dans `query.geosearch`, sans besoin
// de champ `index`.
interface GeosearchEntry {
  title?: string;
  dist?: number;
}

interface GeosearchListResponse {
  query?: { geosearch?: GeosearchEntry[] };
}

const cache = new Map<string, DestinationLookup>();

function cacheKey(name: string, country: string): string {
  return `${name.trim().toLowerCase()}|${country.trim().toLowerCase()}`;
}

function setCache(key: string, value: DestinationLookup): void {
  if (!cache.has(key) && cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

function buildSearchUrl(host: string, query: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrlimit: String(SEARCH_RESULT_LIMIT),
    prop: "pageimages|coordinates|info|pageprops",
    piprop: "thumbnail",
    pithumbsize: String(THUMBNAIL_SIZE_PX),
    inprop: "url",
    ppprop: "disambiguation",
    redirects: "1",
  });
  return `https://${host}/w/api.php?${params.toString()}`;
}

/** Premier résultat (ordre `index`) qui n'est pas une page d'homonymie, ou null si aucun. */
function pickCandidate(pages: Record<string, WikiPage> | undefined): WikiPage | null {
  if (!pages) return null;
  const sorted = Object.values(pages).sort(
    (a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER),
  );
  return sorted.find((page) => page.pageprops?.disambiguation === undefined) ?? null;
}

/**
 * Une image de carte, de drapeau, de blason ou de logo n'est pas une photo, quel que soit
 * son format de fichier : voir NON_PHOTO_FILENAME_KEYWORDS en tête de fichier. `null`/`undefined`
 * (pas d'image du tout) compte aussi comme "pas une photo", pour déclencher le repli Commons.
 */
function isNonPhotographic(url: string | null | undefined): boolean {
  if (!url) return true;
  // Décodée d'abord : « Musée » s'écrit « Mus%C3%A9e » dans une URL, et le mot « musee » ne
  // trouvait rien. Cas réel : un sabre de musée affiché pour « Albanie ».
  let texte = url;
  try {
    texte = decodeURIComponent(url);
  } catch {
    // URL mal encodée : on garde le texte brut.
  }
  const lower = normalizeForMatch(texte);
  if (lower.includes(".svg")) return true;
  return NON_PHOTO_FILENAME_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * 429 ou 503 : Wikimédia demande de ralentir. On lève une erreur pour que l'échec compte comme
 * passager, donc jamais mis en cache. Traité comme « pas de photo », le lieu restait sans photo
 * pour toute la vie du processus (cas réel, pendant une rafale de fiches).
 */
function verifierLimite(response: Response): void {
  if (response.status === 429 || response.status === 503) {
    throw new Error(`Wikimédia limite les requêtes (${response.status})`);
  }
}

function buildCommonsSearchUrl(query: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: String(COMMONS_FILE_NAMESPACE),
    gsrsearch: `${query} ${COMMONS_FILETYPE_FILTER}`,
    gsrlimit: String(COMMONS_SEARCH_RESULT_LIMIT),
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: String(THUMBNAIL_SIZE_PX),
  });
  return `https://${COMMONS_HOST}/w/api.php?${params.toString()}`;
}

// Exemple d'appel : https://commons.wikimedia.org/w/api.php?action=query&format=json&
// list=geosearch&gscoord=38.624|-28.031&gsradius=10000&gsnamespace=6&gslimit=... Il renvoie
// `query.geosearch`, déjà trié par distance croissante (champ `dist`), avec juste le titre.
function buildGeosearchListUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "geosearch",
    gscoord: `${lat}|${lon}`,
    gsradius: String(COMMONS_GEOSEARCH_RADIUS_M),
    gsnamespace: String(COMMONS_FILE_NAMESPACE),
    gslimit: String(GEOSEARCH_RESULT_LIMIT),
  });
  return `https://${COMMONS_HOST}/w/api.php?${params.toString()}`;
}

// Deuxième appel du repli géolocalisé : les fiches image (mime/taille/URL) des titres renvoyés
// par buildGeosearchListUrl, dans une requête `prop=imageinfo` classique par `titles=`.
function buildCommonsImageInfoUrl(titles: string[]): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: String(THUMBNAIL_SIZE_PX),
    titles: titles.join("|"),
  });
  return `https://${COMMONS_HOST}/w/api.php?${params.toString()}`;
}

/** Retire le préfixe d'espace de noms "File:" d'un titre Commons avant toute comparaison. Sans
 * ça, "file" (qui contient "ile") fait matcher n'importe quel titre dès qu'un lieu contient
 * "île" : "Île Test" matche "Biscoitos - panoramio.jpg" via "File:".
 */
function stripCommonsFilePrefix(title: string): string {
  return title.replace(/^file:/i, "");
}

/** Enlève les accents (décomposition NFD) et met en minuscules. Les tirets et espaces sont
 * volontairement laissés tels quels. Les distinguer évite qu'un nom de lieu tel que "Cap-Vert"
 * (pays) matche un fichier "Cap Vert" (quartier de Dijon, espace et non tiret dans son nom).
 * C'est utile lors de la vérification d'homonymie de pickCommonsPhoto.
 */
function normalizeForMatch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Mots du nom du lieu (normalisés, sans les trop courts) utilisés pour préférer une photo
 * géolocalisée qui semble représenter le lieu plutôt qu'un sujet quelconque pris au même endroit. */
function placeNameWords(name: string): string[] {
  return normalizeForMatch(name)
    .split(/[\s-]+/)
    .filter((word) => word.length >= MIN_PLACE_WORD_LENGTH);
}

/**
 * Une fiche image Commons est une photo exploitable : bitmap (jpeg/webp), assez grande, cadrée
 * en paysage, et dont le nom de fichier n'est pas exclu (cf. NON_PHOTO_FILENAME_KEYWORDS).
 */
function isUsableCommonsPhoto(
  info: CommonsImageInfo | undefined,
): info is CommonsImageInfo & { thumburl: string } {
  if (!info?.thumburl || !info.mime) return false;
  if (!PHOTO_MIME_TYPES.has(info.mime)) return false;
  const width = info.thumbwidth ?? 0;
  const height = info.thumbheight ?? 0;
  if (width < MIN_PHOTO_WIDTH_PX || height < MIN_PHOTO_HEIGHT_PX) return false;
  if (width <= height) return false; // paysage uniquement
  if (isNonPhotographic(info.thumburl)) return false;
  return true;
}

/**
 * Premier résultat Commons (ordre `index`) qui est une vraie photo exploitable (cf.
 * isUsableCommonsPhoto) ET dont le titre (= nom de fichier Commons) contient le nom du lieu,
 * pour écarter un homonyme d'une autre région (cas réel : "Cap-Vert" (pays) -> tramway du
 * quartier "Cap Vert" à Dijon). `null` si aucun candidat ne satisfait tous les critères.
 */
function pickCommonsPhoto(
  pages: Record<string, CommonsPage> | undefined,
  placeNameNormalized: string,
): string | null {
  if (!pages) return null;
  const sorted = Object.values(pages).sort(
    (a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER),
  );
  for (const page of sorted) {
    const info = page.imageinfo?.[0];
    if (!isUsableCommonsPhoto(info)) continue;
    const normalizedTitle = normalizeForMatch(stripCommonsFilePrefix(page.title ?? ""));
    if (!normalizedTitle.includes(placeNameNormalized)) continue;
    return info.thumburl;
  }
  return null;
}

/**
 * Choisit la meilleure photo géolocalisée parmi les candidats exploitables (cf.
 * isUsableCommonsPhoto), déjà triés par distance croissante : le plus proche dont le nom de
 * fichier contient un mot du lieu ou un mot de paysage (cf. LANDSCAPE_OR_SCENERY_WORDS).
 * `null` sinon : pas de photo plutôt qu'une photo hors sujet.
 */
function pickGeosearchPhoto(
  titlesByDistance: string[],
  infoByTitle: Map<string, CommonsImageInfo | undefined>,
  placeName: string,
): string | null {
  const preferenceWords = [...placeNameWords(placeName), ...LANDSCAPE_OR_SCENERY_WORDS];
  for (const title of titlesByDistance) {
    const info = infoByTitle.get(title);
    if (!isUsableCommonsPhoto(info)) continue;
    const normalizedTitle = normalizeForMatch(stripCommonsFilePrefix(title));
    if (preferenceWords.some((word) => normalizedTitle.includes(word))) return info.thumburl;
  }
  // Plus de repli sur « le plus proche » : sans nom de lieu ni mot de paysage dans le fichier,
  // le résultat peut être des œufs de musée au centre du Sénégal. Mieux vaut pas de photo.
  return null;
}

function toResult(page: WikiPage): DestinationLookup {
  const coords = page.coordinates?.[0];
  return {
    imageUrl: page.thumbnail?.source ?? null,
    coordinates: coords ? { lat: coords.lat, lon: coords.lon } : null,
    pageUrl: page.fullurl ?? page.canonicalurl ?? null,
    title: page.title ?? null,
  };
}

async function fetchCandidate(
  host: string,
  query: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<WikiPage | null> {
  const response = await fetchImpl(buildSearchUrl(host, query), {
    signal,
    headers: { "User-Agent": WIKI_USER_AGENT },
  });
  // Un hôte en erreur (5xx, 4xx) est traité comme "pas de résultat exploitable" plutôt que
  // comme une panne totale du lookup : le repli fr -> en doit pouvoir jouer son rôle.
  verifierLimite(response);
  if (!response.ok) return null;
  const data = (await response.json()) as WikiQueryResponse;
  return pickCandidate(data.query?.pages);
}

/** Repli (b) : photo géolocalisée près des coordonnées de la page (deux requêtes séquentielles
 * - liste triée par distance, puis fiches image des titres renvoyés). `null` sans lever
 * d'exception si l'un ou l'autre appel échoue, ou si rien n'est exploitable dans le rayon. */
async function fetchGeosearchPhoto(
  lat: number,
  lon: number,
  placeName: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<string | null> {
  const listResponse = await fetchImpl(buildGeosearchListUrl(lat, lon), {
    signal,
    headers: { "User-Agent": WIKI_USER_AGENT },
  });
  verifierLimite(listResponse);
  if (!listResponse.ok) return null;
  const listData = (await listResponse.json()) as GeosearchListResponse;
  const titles = (listData.query?.geosearch ?? [])
    .map((entry) => entry.title)
    .filter((title): title is string => Boolean(title));
  if (titles.length === 0) return null;

  const infoResponse = await fetchImpl(buildCommonsImageInfoUrl(titles), {
    signal,
    headers: { "User-Agent": WIKI_USER_AGENT },
  });
  verifierLimite(infoResponse);
  if (!infoResponse.ok) return null;
  const infoData = (await infoResponse.json()) as CommonsQueryResponse;
  const infoByTitle = new Map<string, CommonsImageInfo | undefined>();
  for (const page of Object.values(infoData.query?.pages ?? {})) {
    if (page.title) infoByTitle.set(page.title, page.imageinfo?.[0]);
  }

  return pickGeosearchPhoto(titles, infoByTitle, placeName);
}

/** Repli (c), en dernier recours seulement : recherche texte Commons, en exigeant que le nom
 * du lieu figure dans le nom de fichier (cf. pickCommonsPhoto). */
async function fetchCommonsTextSearchPhoto(
  query: string,
  placeName: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetchImpl(buildCommonsSearchUrl(query), {
    signal,
    headers: { "User-Agent": WIKI_USER_AGENT },
  });
  // Même politique que fetchCandidate : un hôte en erreur (ou une réponse vide) est traité
  // comme "pas de photo trouvée" plutôt que comme une panne du lookup entier.
  verifierLimite(response);
  if (!response.ok) return null;
  const data = (await response.json()) as CommonsQueryResponse;
  return pickCommonsPhoto(data.query?.pages, normalizeForMatch(placeName));
}

function buildArticleImagesUrl(host: string, title: string): string {
  const params = new URLSearchParams({
    action: "parse",
    format: "json",
    prop: "images",
    redirects: "1",
    page: title,
  });
  return `https://${host}/w/api.php?${params.toString()}`;
}

/** Même titre, que l'API l'écrive avec des espaces ou des soulignés. */
function titreDeFichier(title: string): string {
  return normalizeForMatch(stripCommonsFilePrefix(title)).replace(/_/g, " ");
}

/**
 * Repli (a') pour un pays entier : la première vraie photo de son article, dans l'ordre de la
 * page. Les premières images sont un drapeau, une carte ou une vue satellite, écartées par nom ;
 * vient ensuite un site ou un paysage (Byllis pour l'Albanie, Ajloun pour la Jordanie, une
 * rizière pour le Viêt Nam, mesuré sur les vrais articles). `null` si rien n'est exploitable.
 */
async function fetchArticlePhoto(
  host: string,
  title: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetchImpl(buildArticleImagesUrl(host, title), {
    signal,
    headers: { "User-Agent": WIKI_USER_AGENT },
  });
  verifierLimite(response);
  if (!response.ok) return null;
  const data = (await response.json()) as { parse?: { images?: string[] } };
  const candidats = (data.parse?.images ?? [])
    .filter((nom) => /\.(jpe?g|webp)$/i.test(nom) && !isNonPhotographic(nom))
    .slice(0, ARTICLE_PHOTO_CANDIDATES)
    .map((nom) => `File:${nom}`);
  if (candidats.length === 0) return null;

  const infoResponse = await fetchImpl(buildCommonsImageInfoUrl(candidats), {
    signal,
    headers: { "User-Agent": WIKI_USER_AGENT },
  });
  verifierLimite(infoResponse);
  if (!infoResponse.ok) return null;
  const infoData = (await infoResponse.json()) as CommonsQueryResponse;
  const parTitre = new Map<string, CommonsImageInfo | undefined>();
  for (const page of Object.values(infoData.query?.pages ?? {})) {
    if (page.title) parTitre.set(titreDeFichier(page.title), page.imageinfo?.[0]);
  }
  for (const candidat of candidats) {
    const info = parTitre.get(titreDeFichier(candidat));
    if (isUsableCommonsPhoto(info)) return info.thumburl;
  }
  return null;
}

/** La fiche porte-t-elle sur le pays lui-même (« Albanie », pays « Albanie ») ? */
function estLePays(name: string, country: string): boolean {
  return normalizeForMatch(placeQuery(name, country)) === normalizeForMatch(country.trim());
}

/**
 * Nom à chercher sur Wikipédia. Le modèle écrit parfois « Maroc (région d'Agadir) » ou
 * « Zanzibar (Tanzanie) ». Ces libellés composés sont la cause : une fiche sur deux n'a pas de
 * photo à cause d'eux. On garde le lieu, pas la parenthèse.
 */
export function placeQuery(name: string, country: string): string {
  const parenthese = name.trim().match(/^(.+?)\s*\(([^)]+)\)$/);
  if (!parenthese) return name.trim();
  const [, avant, dedans] = parenthese;
  if (!avant || !dedans) return name.trim();
  // « Maroc (région d'Agadir) » : le lieu utile est dans la parenthèse, pas devant.
  return avant.trim().toLowerCase() === country.trim().toLowerCase() ? dedans.trim() : avant.trim();
}

export async function lookupDestination(
  name: string,
  country: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<DestinationLookup> {
  const key = cacheKey(name, country);
  const cached = cache.get(key);
  if (cached) return cached;

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let result = NULL_RESULT;
  let transientFailure = false;
  try {
    // « Maroc Maroc » cherchait deux fois le même mot : pour un pays, son nom suffit.
    const pays = estLePays(name, country);
    const query = pays ? country.trim() : `${placeQuery(name, country)} ${country}`;
    let hote = PRIMARY_HOST;
    const primary = await fetchCandidate(PRIMARY_HOST, query, fetchImpl, controller.signal);
    if (primary?.thumbnail?.source) {
      result = toResult(primary);
    } else {
      const secondary = await fetchCandidate(FALLBACK_HOST, query, fetchImpl, controller.signal);
      // Priorité : repli en avec photo > primaire fr sans photo (coordonnées/lien restent
      // utiles) > repli en sans photo > rien.
      const best = secondary?.thumbnail?.source ? secondary : (primary ?? secondary);
      if (best === secondary && secondary) hote = FALLBACK_HOST;
      result = best ? toResult(best) : NULL_RESULT;
    }

    // Direction artistique : l'image de page (fr ou en) est souvent une carte, un drapeau ou
    // une image satellite plutôt qu'une photo (cf. en-tête de fichier). Repli en cascade (b)
    // géolocalisé puis (c) recherche texte, jamais l'inverse : la recherche texte seule est
    // celle qui a produit l'homonyme "Cap-Vert" -> tramway de Dijon.
    if (isNonPhotographic(result.imageUrl)) {
      let photo: string | null = null;
      if (pays && result.title) {
        photo = await fetchArticlePhoto(hote, result.title, fetchImpl, controller.signal);
      }
      if (!photo && result.coordinates) {
        photo = await fetchGeosearchPhoto(
          result.coordinates.lat,
          result.coordinates.lon,
          name,
          fetchImpl,
          controller.signal,
        );
      }
      if (!photo) {
        photo = await fetchCommonsTextSearchPhoto(query, name, fetchImpl, controller.signal);
      }
      result = { ...result, imageUrl: photo };
    }
  } catch {
    // Timeout (abort) ou fetch qui rejette : jamais d'exception, la fiche perd juste sa photo.
    result = NULL_RESULT;
    transientFailure = true;
  } finally {
    clearTimeout(timer);
  }

  // Un "pas de résultat" est gardé en cache ; une panne passagère ne l'est pas : sinon la
  // destination perdrait sa photo pour toute la vie du processus.
  if (!transientFailure) setCache(key, result);
  return result;
}
