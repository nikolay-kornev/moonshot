// lib/consensus.js
// Canonical validator-consensus logic. Mirrored inline in the workflow.

function evaluate(results) {
  const responded = results.filter(Boolean);
  const approved = responded.length > 0 && responded.every((r) => r.approved === true);
  const rejections = responded
    .filter((r) => r.approved !== true)
    .flatMap((r) => (r.errors || []).map((e) => ({ validator: r.validator, ...e })));
  return { approved, rejections };
}

module.exports = { evaluate };
