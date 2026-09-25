import Anthropic from "@anthropic-ai/sdk";

/**
 * Ce qu'on dit au voyageur quand un tour échoue, et ce qu'on garde pour nous.
 *
 * Trois règles. Le message ne répète jamais les mots de l'API : un problème de compte ou de
 * facturation ne regarde pas le voyageur. Il ne promet pas qu'un nouvel essai marchera si c'est
 * faux. Et il dit toujours que le carnet est gardé, parce que c'est ce qui inquiète.
 */
export interface TurnErrorView {
  /** Lu par le voyageur, dans le fil de conversation. */
  message: string;
  /** Un nouvel essai immédiat a-t-il une chance de marcher ? Décide du bouton « Réessayer ». */
  retry: boolean;
  /** Pour le panneau technique et les traces : code et type, jamais le texte de l'API. */
  cause: string;
}

const PROJET_GARDE = "Votre projet est gardé.";

const TEMPORAIRE: TurnErrorView = {
  message: `Le service met plus de temps que prévu. Réessayez dans un instant. ${PROJET_GARDE}`,
  retry: true,
  cause: "",
};

const INDISPONIBLE: TurnErrorView = {
  message: `Le service est indisponible pour le moment. Revenez dans quelques minutes. ${PROJET_GARDE}`,
  retry: false,
  cause: "",
};

const MESSAGE_REFUSE: TurnErrorView = {
  message: `Je n'arrive pas à traiter ce message. Reformulez-le autrement. ${PROJET_GARDE}`,
  retry: false,
  cause: "",
};

/** Type d'erreur renvoyé par l'API, quand il est présent. Sert de trace, pas d'affichage. */
function apiType(error: InstanceType<typeof Anthropic.APIError>): string {
  const corps = error.error as { type?: string; error?: { type?: string } } | undefined;
  return corps?.error?.type ?? corps?.type ?? "api_error";
}

export function classifyTurnError(error: unknown): TurnErrorView {
  if (error instanceof Anthropic.APIError) {
    const cause = `${error.status ?? "?"} ${apiType(error)}`;
    // 429 trop d'appels, 408 trop long, 5xx panne côté service : un nouvel essai peut marcher.
    if (error.status === 429 || error.status === 408 || (error.status ?? 0) >= 500) {
      return { ...TEMPORAIRE, cause };
    }
    // Clé refusée, droits manquants, crédit épuisé : le voyageur n'y peut rien, et réessayer
    // tout de suite ne changera rien. On ne lui fait pas croire le contraire.
    if (error.status === 401 || error.status === 403 || error.status === 400) {
      const corps = `${error.message} ${JSON.stringify(error.error ?? {})}`.toLowerCase();
      const compte = error.status !== 400 || corps.includes("credit") || corps.includes("billing");
      return compte ? { ...INDISPONIBLE, cause } : { ...MESSAGE_REFUSE, cause };
    }
    return { ...TEMPORAIRE, cause };
  }
  // Coupure réseau, temps dépassé, défaut de notre côté : rien ne dit qu'un second essai échouera.
  const nom = error instanceof Error ? error.name : typeof error;
  return { ...TEMPORAIRE, cause: nom };
}
