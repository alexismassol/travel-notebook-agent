import { NARRATION } from "./reply-metrics";

/**
 * Garde-fou sur le texte VISIBLE par le voyageur.
 *
 * Sur Haiku 4.5 (scénario contradiction), le modèle écrit parfois un appel d'outil sous forme
 * de texte (`<function_calls><invoke ...>`) au lieu d'un vrai bloc tool_use. Sans ce module, ce
 * texte partirait tel quel dans la bulle du voyageur. `findLeakedSyntax` ne protège que les
 * entrées d'outils : ce module protège le flux de texte.
 *
 * En streaming, un `<` peut arriver seul dans un fragment : on retient le texte à partir d'un
 * `<` tant qu'il peut encore devenir une balise interdite, et on coupe tout le reste de l'appel
 * dès qu'elle est confirmée.
 */

const FORBIDDEN_TAGS = [
  "<function_calls",
  "<invoke",
  "<parameter",
  "<antml",
  "</antml",
  "</invoke",
  "</parameter",
  "</function_calls",
];

/**
 * Échappement JSON écrit en toutes lettres par le modèle, au milieu d'un mot français.
 * Sur une vraie conversation, le voyageur lisait « croisi\u00e8re » dans une question de
 * l'agent. On répare plutôt que couper : le reste de la phrase est bon, et l'accent est ce qui
 * manque.
 */
const ESCAPE = /\\u([0-9a-fA-F]{4})/g;
/** Fin de fragment qui pourrait être le début d'un échappement coupé en deux (« croisi\u0 »). */
const PARTIAL_ESCAPE = /\\u?[0-9a-fA-F]{0,3}$/;

export function repairEscapes(text: string): string {
  return text.replace(ESCAPE, (brut, hex) => {
    const code = Number.parseInt(hex, 16);
    // Les caractères de contrôle ne se décodent pas : invisibles, ils cacheraient le défaut.
    const imprimable = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    return imprimable ? brut : String.fromCharCode(code);
  });
}

/**
 * Tiret qui relie deux morceaux de phrase (« Excellent choix — la Martinique est parfaite »).
 * Ça fait écrit par une machine. La consigne est dans le prompt, mais le modèle la perd au fil
 * de la conversation, alors le texte visible passe par ce filtre. Le tiret des mots composés
 * (« week-end »), des puces et des intervalles chiffrés (« 10-15 jours ») n'a pas d'espace
 * avant : il est gardé.
 */
const TIRET_LIAISON = /(\S) *— *(?=\S)|(\S) +[–-] +(?=(\S))/g;
/**
 * Fin de fragment où un tiret de liaison peut encore se former une fois la suite arrivée.
 * Il faut qu'un espace ou un tiret traîne à la fin : « choix », « choix — ». Sans cette
 * condition, le dernier caractère de chaque fragment est retenu, et une phrase finie s'affiche
 * sans son « ? ».
 */
const TIRET_PARTIEL = /\S?[ ]*[—–-]?[ ]*$/;
const PEUT_PORTER_UN_TIRET = /[ —–-]/;

function adoucirTirets(text: string): string {
  return text.replace(TIRET_LIAISON, (tout, avantLong, avantCourt, apres) => {
    const avant: string = avantLong ?? avantCourt;
    // Entre deux chiffres, le tiret sépare une plage : « du 15 - 20 juillet », « 10 - 15 nuits ».
    // Le remplacer par une virgule changerait le sens, pas seulement le style.
    if (/\d/.test(avant) && /\d/.test(apres ?? "")) return tout as string;
    // Après une ponctuation, le tiret disparaît : « Parfait ! » n'a pas besoin d'une virgule.
    return /[.,;:!?…]/.test(avant) ? `${avant} ` : `${avant}, `;
  });
}

/**
 * Le mot « brief » est notre vocabulaire, pas celui du voyageur : il parle de SON projet. La
 * règle est dans le prompt depuis le début, et le modèle la perd quand même, jusqu'à écrire
 * « le brief est complet » à l'écran. Le mot est donc remplacé avant l'affichage.
 */
const MOT_BRIEF = /\bbriefs?\b/gi;

function direProjet(text: string): string {
  return text.replace(MOT_BRIEF, (mot) => {
    const pluriel = mot.toLowerCase().endsWith("s");
    const remplacant = pluriel ? "projets" : "projet";
    return mot[0] === mot[0]?.toUpperCase() ? `P${remplacant.slice(1)}` : remplacant;
  });
}

/**
 * Le modèle écrit parfois du HTML au lieu du markdown : « Je vous propose <strong>mai</strong> ».
 * Le rendu n'accepte pas le HTML brut, pour ne pas ouvrir une porte d'injection, donc la balise
 * s'affichait en toutes lettres. On traduit ce qui a un équivalent, on retire le reste.
 */
const BALISE_HTML = /<\/?([a-z][a-z0-9]{0,9})\b[^>]{0,80}>/gi;
const FORT = new Set(["strong", "b"]);
const ITALIQUE = new Set(["em", "i"]);

function sansHtml(text: string): string {
  return text.replace(BALISE_HTML, (_tout, nom: string) => {
    const balise = nom.toLowerCase();
    if (FORT.has(balise)) return "**";
    if (ITALIQUE.has(balise)) return "*";
    if (balise === "br") return "\n";
    return "";
  });
}

/**
 * En français, une espace précède « ? ! ; : ». Une espace ordinaire autorise la coupure de
 * ligne, et le point d'interrogation se retrouvait seul en bas d'un message. On met l'espace
 * fine insécable, qui est la bonne typographie et interdit la coupure.
 */
const AVANT_PONCTUATION_DOUBLE = /[ \u00a0]+([?!;:])/g;

function espaceInsecable(text: string): string {
  return text.replace(AVANT_PONCTUATION_DOUBLE, "\u202f$1");
}

/** Tout ce que le voyageur lit passe par là : accents, tirets de liaison, vocabulaire. */
export function nettoyerTexteVisible(text: string): string {
  return espaceInsecable(direProjet(adoucirTirets(sansHtml(repairEscapes(text)))));
}

/** Index du début de la première balise interdite, ou -1. */
export function findForbiddenTag(text: string): number {
  let first = -1;
  for (const tag of FORBIDDEN_TAGS) {
    const i = text.indexOf(tag);
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  return first;
}

/** Vrai si `tail` (qui commence par `<`) peut encore devenir une balise interdite. */
function couldBecomeForbidden(tail: string): boolean {
  return FORBIDDEN_TAGS.some((tag) => tag.startsWith(tail) || tail.startsWith(tag));
}

/**
 * Vrai si `tail` peut encore devenir une balise HTML ordinaire. Sans cette retenue, un
 * « <strong> » coupé entre deux fragments du flux arriverait à moitié nettoyé.
 */
const DEBUT_DE_BALISE = /^<\/?[a-z][a-z0-9]{0,9}$/i;

export function createVisibleTextFilter() {
  let pending = "";
  let leaked = false;
  /**
   * Dernier caractère déjà montré. Il sert de contexte au remplacement du tiret quand le
   * fragment suivant commence par « — » : sans lui, le tiret n'a rien devant et passerait.
   */
  let contexte = "";

  /** Nettoie avec le caractère de contexte devant, puis rend seulement la part nouvelle. */
  const rendre = (brut: string): string => {
    const sortie = nettoyerTexteVisible(contexte + brut).slice(contexte.length);
    if (brut.length > 0) contexte = brut.slice(-1);
    return sortie;
  };

  return {
    get leaked() {
      return leaked;
    },
    /** Reçoit un fragment du modèle, renvoie ce qui peut être montré maintenant. */
    push(delta: string): string {
      if (leaked) return "";
      pending += delta;
      const cut = findForbiddenTag(pending);
      if (cut !== -1) {
        leaked = true;
        const safe = pending.slice(0, cut);
        pending = "";
        return rendre(safe);
      }
      let hold = pending.length;
      const lastOpen = pending.lastIndexOf("<");
      const tail = lastOpen === -1 ? "" : pending.slice(lastOpen);
      if (lastOpen !== -1 && (couldBecomeForbidden(tail) || DEBUT_DE_BALISE.test(tail))) {
        hold = lastOpen;
      }
      const partial = pending.match(PARTIAL_ESCAPE);
      if (partial?.index !== undefined && partial.index < hold) hold = partial.index;
      const tiret = pending.match(TIRET_PARTIEL);
      if (tiret?.index !== undefined && PEUT_PORTER_UN_TIRET.test(tiret[0]) && tiret.index < hold) {
        hold = tiret.index;
      }
      const safe = pending.slice(0, hold);
      pending = pending.slice(hold);
      return rendre(safe);
    },
    /** Fin de l'appel : ce qui était retenu sans devenir une balise interdite est rendu. */
    flush(): string {
      if (leaked) return "";
      const rest = pending;
      pending = "";
      return rendre(rest);
    },
  };
}

/** Même règle appliquée au texte stocké dans l'historique, pour ne pas le réapprendre au modèle. */
export function stripForbiddenText(text: string): string {
  const cut = findForbiddenTag(text);
  return nettoyerTexteVisible(cut === -1 ? text : text.slice(0, cut).trimEnd());
}

/**
 * Phrases de coulisses : « Je vais noter votre projet et charger les instructions ». Mesuré sur
 * la campagne du 2026-09-25 : 19 passages sur 48 en contenaient une, malgré le prompt. Une phrase
 * courte, sans question, qui ne fait que raconter le travail de l'agent est retirée.
 *
 * Pour garder l'affichage mot à mot, seule une phrase qui COMMENCE comme des coulisses est
 * retenue jusqu'à son point. Les autres passent dès leurs premiers mots : au bout de 12 lettres
 * si elles ne peuvent pas en être, de 30 lettres au plus sinon. Une interjection (« Parfait, ») ou
 * un tiret de liste devant ne change rien : le flux et l'historique suivent la même règle.
 */
const DEVANT =
  "^\\s*(?:[-*•]\\s+)?(?:(?:parfait|très bien|d['’]accord|entendu|super|ok|bien|merci)\\s*[,!.]?\\s*)?";
const DEBUT_POSSIBLE = new RegExp(
  `${DEVANT}(?:parfait|très|d['’]|entendu|super|ok|bien|merci|je\\b|j['’]|laissez|permettez|c['’]est|not|enregistr|une dernière|cherchons|[-*•])`,
  "i",
);
const OUVERTURE_COULISSES = new RegExp(
  `${DEVANT}(?:je (?:vais (?:enregistrer|noter|mettre|corriger|charger)|note|mets|charge|corrige|viens|dois|enregistre)\\b|j['’]enregistre|j['’]ai (?:noté|enregistré)|laissez|permettez|c['’]est not|bien not|not[ée]|enregistr|une dernière|cherchons)`,
  "i",
);
const FIN_DE_PHRASE = /[.!?…](?=\s|$)|\n/;
const MOTS_MAX_COULISSES = 20;
/** Au-delà, on sait si la phrase PEUT commencer comme des coulisses. */
const LETTRES_POUR_DECIDER = 12;
/** Au-delà, on sait si elle commence VRAIMENT comme des coulisses. */
const LETTRES_POUR_TRANCHER = 30;
const NARRATION_UNE = new RegExp(NARRATION.source, "iu");
/** « Je note que vous partez à quatre » rapporte un fait du voyageur : la phrase reste. */
const FAIT_RAPPORTE = /\b(?:not\w*|enregistr\w*|retiens)\s+qu(?:e\b|['’])/i;

export function estPhraseDeCoulisses(phrase: string): boolean {
  const texte = phrase.trim();
  if (!texte || texte.includes("?")) return false;
  if (texte.split(/\s+/).length > MOTS_MAX_COULISSES) return false;
  if (FAIT_RAPPORTE.test(texte)) return false;
  return NARRATION_UNE.test(texte);
}

export function createCoulissesFilter() {
  let phrase = "";
  let mode: "debut" | "retenue" | "libre" = "debut";
  let retirees = 0;
  let dejaMontre = false;

  const trancher = (complete: string): string => {
    if (!estPhraseDeCoulisses(complete)) return complete;
    retirees += 1;
    return "";
  };
  // Une réponse ne commence pas par l'espace qui suivait une phrase retirée.
  const sortir = (texte: string): string => {
    const net = dejaMontre ? texte : texte.replace(/^\s+/, "");
    if (net) dejaMontre = true;
    return net;
  };

  return {
    get retirees() {
      return retirees;
    },
    push(delta: string): string {
      let sortie = "";
      let reste = delta;
      while (reste) {
        const fin = FIN_DE_PHRASE.exec(reste);
        const bout = fin ? fin.index + fin[0].length : reste.length;
        if (mode === "libre") {
          sortie += reste.slice(0, bout);
          reste = reste.slice(bout);
          if (fin) mode = "debut";
          continue;
        }
        phrase += reste.slice(0, bout);
        reste = reste.slice(bout);
        if (fin) {
          sortie += trancher(phrase);
          phrase = "";
          mode = "debut";
        } else if (mode === "debut") {
          const lettres = phrase.replace(/\s/g, "").length;
          const libre =
            (lettres >= LETTRES_POUR_DECIDER && !DEBUT_POSSIBLE.test(phrase)) ||
            (lettres >= LETTRES_POUR_TRANCHER && !OUVERTURE_COULISSES.test(phrase));
          if (libre) {
            sortie += phrase;
            phrase = "";
            mode = "libre";
          } else if (lettres >= LETTRES_POUR_TRANCHER) {
            mode = "retenue";
          }
        }
      }
      return sortir(sortie);
    },
    flush(): string {
      const reste = phrase ? trancher(phrase) : "";
      phrase = "";
      mode = "debut";
      return sortir(reste);
    },
  };
}

/** Même règle sur un texte entier, pour l'historique : le modèle ne réapprend pas la tournure. */
export function retirerCoulisses(texte: string): string {
  const filtre = createCoulissesFilter();
  return filtre.push(texte) + filtre.flush();
}
