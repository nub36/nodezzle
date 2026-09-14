/** Форма принимает только JSON-объект: ошибки не превращаются в пустые данные. */
export function parseWebFormJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
  } catch { return null; }
}
