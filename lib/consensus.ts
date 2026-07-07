// lib/consensus.ts
// Canonical validator-consensus logic. Mirrored inline (as plain JS) in the workflow.

export interface ValidatorError {
  severity: string;
  message: string;
  evidence?: string;
}

export interface ValidatorResult {
  validator: string;
  approved: boolean;
  errors?: ValidatorError[];
}

export interface Consensus {
  approved: boolean;
  rejections: Array<ValidatorError & { validator: string }>;
}

export function evaluate(results: Array<ValidatorResult | null>): Consensus {
  const responded = results.filter((r): r is ValidatorResult => Boolean(r));
  const approved = responded.length > 0 && responded.every((r) => r.approved === true);
  const rejections = responded
    .filter((r) => r.approved !== true)
    .flatMap((r) => (r.errors || []).map((e) => ({ validator: r.validator, ...e })));
  return { approved, rejections };
}
