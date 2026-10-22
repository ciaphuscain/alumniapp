/** Skills are stored lowercase with collapsed whitespace so filters match regardless of input casing. */
export function normalizeSkills(skills: string[]): string[] {
  return [
    ...new Set(skills.map((s) => s.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean)),
  ];
}
