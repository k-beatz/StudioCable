export function newId(prefix = ''): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + random;
}

export function formatCableLabel(n: number): string {
  return 'C-' + String(n).padStart(3, '0');
}
