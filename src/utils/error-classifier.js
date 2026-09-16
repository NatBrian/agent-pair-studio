export function classifyError(exitCode, errorText = '') {
  if (exitCode === 124) return 'transient';

  const text = String(errorText).toLowerCase();

  // Transient patterns
  if (/429|rate[\s_-]?limit|too many requests|overloaded|capacity|temporarily/i.test(text)) {
    return 'transient';
  }
  if (/500|502|503|504|bad gateway|service unavailable|gateway timeout/i.test(text)) {
    return 'transient';
  }
  if (/econnreset|econnrefused|etimedout|connection refused|network error|timed?\s?out/i.test(text)) {
    return 'transient';
  }

  // Permanent patterns
  if (/401|403|unauthorized|forbidden|invalid[\s_-]?api[\s_-]?key|authentication/i.test(text)) {
    return 'permanent';
  }
  if (/billing|quota exceeded|insufficient funds|payment/i.test(text)) {
    return 'permanent';
  }
  if (/404|not found|invalid model|model.*not.*available/i.test(text)) {
    return 'permanent';
  }

  return 'transient'; // Default safe assumption for retry
}
