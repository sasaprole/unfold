/**
 * Simple keyword-based intent detection for free-form prompts.
 * Maps user prompts to the appropriate command when no explicit /command is used.
 */

const REFINE_PATTERNS = [
  /\bexpand\b/i,
  /\brefine\b/i,
  /\badd\s+detail/i,
  /\belaborate\b/i,
  /\bbreak\s+down\b/i,
  /\bflesh\s+out\b/i,
  /\bimprove\b/i,
  /\bupdate\b/i,
  /\bmodify\b/i,
  /\bchange\b/i,
  /\bmore\s+detail/i,
  /\bsub-?tasks?\b/i,
  /\bdrill\s+down\b/i,
  /\bdeepen\b/i,
  /\benrich\b/i,
];

const CONVERT_PATTERNS = [
  /\bconvert\b/i,
  /\btransform\b/i,
  /\bimport\b/i,
  /\bmigrate\b/i,
];

const CREATE_PATTERNS = [
  /\bcreate\b/i,
  /\bbuild\b.*\bplan\b/i,
  /\bplan\b.*\bfor\b/i,
  /\bdesign\b/i,
  /\bnew\s+plan\b/i,
  /\bstart\b.*\bplan\b/i,
];

export function detectIntent(prompt: string): 'create' | 'refine' | 'convert' | null {
  const refineScore = REFINE_PATTERNS.filter(p => p.test(prompt)).length;
  const convertScore = CONVERT_PATTERNS.filter(p => p.test(prompt)).length;
  const createScore = CREATE_PATTERNS.filter(p => p.test(prompt)).length;

  if (refineScore === 0 && convertScore === 0 && createScore === 0) {
    return null;
  }

  if (convertScore > 0 && convertScore >= refineScore && convertScore >= createScore) {
    return 'convert';
  }

  if (refineScore > createScore) {
    return 'refine';
  }

  if (createScore > 0) {
    return 'create';
  }

  return null;
}
