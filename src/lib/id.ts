/**
 * Случайный идентификатор. `crypto.randomUUID` есть только в защищённом контексте (HTTPS,
 * localhost). При открытии по http://192.168.x.x с телефона работает запасной вариант.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
