import { z } from "zod";

/**
 * Modèle du brief de voyage.
 *
 * Chaque information est un "slot" : une valeur typée, un statut et les phrases du voyageur
 * qui la justifient. Le flou, l'inférence et la contradiction sont des états explicites,
 * pas des valeurs nulles. La distinction obligatoire / utile est portée par la forme du type
 * (`mandatory` / `useful`), pas par un drapeau.
 */

export const SLOT_STATUSES = ["unknown", "vague", "inferred", "confirmed", "conflicting"] as const;
export const SlotStatus = z.enum(SLOT_STATUSES);
export type SlotStatus = z.infer<typeof SlotStatus>;

export const Evidence = z.object({
  quote: z.string().min(1),
  turn: z.number().int().nonnegative(),
});
export type Evidence = z.infer<typeof Evidence>;

/** Forme AAAA-MM-JJ ET date du calendrier : "2027-13-45" ou "2027-02-30" sont refusées. */
const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format AAAA-MM-JJ")
  .refine((s) => {
    const time = Date.parse(`${s}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === s;
  }, "cette date n'existe pas dans le calendrier");

export const DestinationValue = z.object({
  mode: z.enum(["open", "shortlist", "fixed"]),
  places: z.array(z.string().min(1).max(80)).max(5),
  zone: z.string().min(1).max(80).nullable(),
  criteria: z.array(z.string().min(1).max(120)).max(8),
});

export const DatesValue = z
  .object({ earliest: IsoDate, latest: IsoDate, label: z.string().min(1) })
  .refine((d) => d.earliest <= d.latest, "earliest doit précéder latest");

export const DurationValue = z
  .object({ minNights: z.number().int().min(1), maxNights: z.number().int().min(1) })
  .refine((d) => d.minNights <= d.maxNights, "minNights doit être <= maxNights");

export const TravellersValue = z
  .object({
    total: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    adults: z.number().int().min(1).nullable(),
    children: z.array(z.object({ age: z.number().int().min(0).max(17).nullable() })),
    label: z.string().min(1),
  })
  .refine((t) => t.total.min <= t.total.max, "total.min doit être <= total.max");

export const BudgetValue = z.object({
  min: z.number().nonnegative().nullable(),
  max: z.number().positive(),
  currency: z.literal("EUR"),
  per: z.enum(["person", "total"]),
});

/** Une étiquette est un mot ou une expression courte ; au-delà, c'est une phrase. */
export const TagsValue = z.array(z.string().min(1).max(120)).min(1).max(10);

/**
 * Ville ou aéroport de départ. Sans elle, le trajet et son prix restent inconnus. Une phrase
 * comme « on part de Paris » ne laisse sinon aucune trace ailleurs dans le brief.
 */
export const DepartureValue = z.string().min(1).max(80);

const slot = <T extends z.ZodType>(value: T) =>
  z.object({
    status: SlotStatus,
    value: value.nullable(),
    /** Valeurs en conflit avec `value`, renseignées seulement si status = conflicting. */
    alternatives: z.array(value),
    evidence: z.array(Evidence),
  });

export const MANDATORY_FIELDS = ["destination", "dates", "duration", "travellers"] as const;
export const USEFUL_FIELDS = ["departure", "budget", "style", "interests", "constraints"] as const;
export type MandatoryField = (typeof MANDATORY_FIELDS)[number];
export type UsefulField = (typeof USEFUL_FIELDS)[number];
export type BriefField = MandatoryField | UsefulField;

export const FIELD_VALUE_SCHEMAS = {
  departure: DepartureValue,
  destination: DestinationValue,
  dates: DatesValue,
  duration: DurationValue,
  travellers: TravellersValue,
  budget: BudgetValue,
  style: TagsValue,
  interests: TagsValue,
  constraints: TagsValue,
} as const satisfies Record<BriefField, z.ZodType>;

export const TravelBrief = z.object({
  version: z.number().int().nonnegative(),
  mandatory: z.object({
    destination: slot(DestinationValue),
    dates: slot(DatesValue),
    duration: slot(DurationValue),
    travellers: slot(TravellersValue),
  }),
  useful: z.object({
    departure: slot(DepartureValue),
    budget: slot(BudgetValue),
    style: slot(TagsValue),
    interests: slot(TagsValue),
    constraints: slot(TagsValue),
  }),
  /** Phrases du voyageur utiles pour son voyage qui n'entrent dans aucun champ. */
  nuances: z.array(Evidence),
  changelog: z.array(
    z.object({
      version: z.number().int(),
      turn: z.number().int(),
      changes: z.array(z.string()),
    }),
  ),
});
export type TravelBrief = z.infer<typeof TravelBrief>;

export type DestinationValue = z.infer<typeof DestinationValue>;
export type DatesValue = z.infer<typeof DatesValue>;
export type DurationValue = z.infer<typeof DurationValue>;
export type TravellersValue = z.infer<typeof TravellersValue>;
export type BudgetValue = z.infer<typeof BudgetValue>;
export type DepartureValue = z.infer<typeof DepartureValue>;

export interface Completeness {
  /** Vrai quand le brief fait un carnet de voyage complet. Calculé en code, jamais par le modèle. */
  ready: boolean;
  /** Nombre de champs obligatoires suffisants, sur 4. */
  mandatoryOk: number;
  missing: { field: MandatoryField; reason: string }[];
}

const emptySlot = () => ({
  status: "unknown" as const,
  value: null,
  alternatives: [],
  evidence: [],
});

export function emptyBrief(): TravelBrief {
  return {
    version: 0,
    mandatory: {
      destination: emptySlot(),
      dates: emptySlot(),
      duration: emptySlot(),
      travellers: emptySlot(),
    },
    useful: {
      departure: emptySlot(),
      budget: emptySlot(),
      style: emptySlot(),
      interests: emptySlot(),
      constraints: emptySlot(),
    },
    nuances: [],
    changelog: [],
  };
}
