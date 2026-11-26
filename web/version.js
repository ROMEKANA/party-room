export const VERSION = '2.0.2';
export function newerVersion(candidate, current = VERSION) {
  if (typeof candidate !== 'string' || !/^\d+\.\d+\.\d+$/.test(candidate)) return false;
  const installed = current.split('.').map(Number);
  for (const [index, part] of candidate.split('.').map(Number).entries()) {
    if (part !== installed[index]) return part > installed[index];
  }
  return false;
}
