import { z } from 'zod';

export const CURRENCIES = ['XOF', 'XAF', 'USD', 'NGN', 'GBP', 'EUR', 'CHF'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const ROLES = ['admin', 'manager', 'member', 'readonly'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Code d'invitation : 8 caractères de l'alphabet sans ambiguïté
 * (pas de I/L/O ni de 0/1), normalisé en majuscules côté serveur.
 */
export const INVITATION_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const invitationCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-HJKMNP-Z2-9]{8}$/));

/**
 * Phrase de secours : une phrase personnelle de 16 à 128 caractères.
 * Définie dans les réglages, elle permet de réinitialiser le mot de passe
 * sans e-mail ni administrateur, et de reprendre un foyer dont le compte
 * a été supprimé. Seul son bcrypt vit côté serveur.
 */
export const recoveryPhraseSchema = z.string().min(16).max(128);

/**
 * Inscription : l'invitation optionnelle fait ignorer le nom du foyer — vide,
 * il devient « Invité » (le foyer partagé est celui du code).
 */
export const registerSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== 'object' || raw === null) return raw;
    const body = raw as Record<string, unknown>;
    const hasCode = typeof body.invitationCode === 'string' && body.invitationCode.trim().length > 0;
    const nameIsEmpty = typeof body.familyName !== 'string' || body.familyName.trim().length === 0;
    if (hasCode && nameIsEmpty) return { ...body, familyName: 'Invité' };
    return body;
  },
  z.object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
    familyName: z.string().min(1).max(80),
    primaryCurrency: z.enum(CURRENCIES).default('XOF'),
    invitationCode: invitationCodeSchema.optional(),
    /**
     * Phrase de secours : si un foyer attend la reprise de cette adresse
     * e-mail, sa fourniture (exacte) réactive ce foyer au lieu d'en créer
     * un neuf. Aucun effet sinon.
     */
    recoveryPhrase: recoveryPhraseSchema.optional(),
  }),
);

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const syncEntitySchema = z.enum([
  'account',
  'transaction',
  'budget',
  'goal',
  'debt',
  'category',
  'recurring',
  'wealth',
  'business',
  'product',
  'sale',
  'purchase',
  'party',
  'advance',
  'settlement',
  'quote',
]);

export const pushOpSchema = z.object({
  opId: z.string().uuid(),
  entity: syncEntitySchema,
  entityId: z.string().min(1).max(128),
  op: z.enum(['upsert', 'delete']),
  payload: z.unknown().nullable(),
  /** Révision sur laquelle le client a construit l'opération (0 = inconnue). */
  baseRev: z.number().int().min(0).optional().default(0),
  changedFields: z.array(z.string()).optional(),
  baseSnapshot: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const pushSchema = z.object({
  ops: z.array(pushOpSchema).min(1).max(200),
});

export type PushOpInput = z.infer<typeof pushOpSchema>;

/** POST /auth/join : un utilisateur connecté rejoint un foyer par code. */
export const joinSchema = z.object({
  invitationCode: invitationCodeSchema,
});

/** Réinitialisation de mot de passe : code admin + identité + nouveau mot de passe. */
export const resetRequestSchema = z.object({
  email: z.string().email().max(254),
});

export const resetConfirmSchema = z.object({
  email: z.string().email().max(254),
  resetCode: invitationCodeSchema,
  newPassword: z.string().min(8).max(128),
});

/** Réinitialisation sans e-mail par phrase de secours : la phrase remplace le code admin. */
export const recoveryResetSchema = z.object({
  email: z.string().email().max(254),
  recoveryPhrase: recoveryPhraseSchema,
  newPassword: z.string().min(8).max(128),
});

/** Définition de la phrase de secours (compte connecté). */
export const recoveryPhraseSetSchema = z.object({
  recoveryPhrase: recoveryPhraseSchema,
});

/** Payload applicatif : un enregistrement JSON par entité. */
export const recordPayloadSchema = z.record(z.string(), z.unknown()).nullable();
