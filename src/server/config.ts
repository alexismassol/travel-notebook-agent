export interface AgentConfig {
  model: string;
  /** Plafond de sortie par appel. Une réponse de chat + une entrée d'outil tiennent largement. */
  maxTokens: number;
  /** Appels au modèle par tour. Le dernier est forcé en texte pour toujours rendre la main. */
  maxModelCalls: number;
  /** Recherches web par appel au modèle. Une recherche coûte ~10 k tokens d'entrée (mesuré). */
  webSearchMaxUses: number;
}

export const DEFAULT_MODEL = "claude-haiku-4-5";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return {
    model: env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    maxTokens: 4096,
    maxModelCalls: 6,
    webSearchMaxUses: 2,
  };
}

export const DEFAULT_API_PORT = 8787;

/**
 * Port de l'API. Une variable vide vaut une variable absente : `.env.example` livre `API_PORT=`
 * prêt à remplir, et `Number("")` vaut zéro, donc un port tiré au hasard par le système. Copié
 * tel quel, le fichier faisait démarrer l'API ailleurs que là où l'interface la cherche.
 */
export function apiPort(env: NodeJS.ProcessEnv = process.env): number {
  const brut = env.API_PORT?.trim();
  const port = brut ? Number(brut) : Number.NaN;
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_API_PORT;
}

export const API_PORT = apiPort();
