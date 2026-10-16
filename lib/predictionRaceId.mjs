// Historical snapshots use course slugs; newer snapshots use JRA race numbers.
// Accept both without allowing path traversal or object prototype keys.
export function validPredictionRaceId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(value)
    && !['constructor', 'prototype', '__proto__'].includes(value);
}
