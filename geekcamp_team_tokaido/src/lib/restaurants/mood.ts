/** Unknown or negative intent preserves order; mood never excludes a candidate. */
export function orderByMood<T>(items: readonly T[], mood: string, facts: (item: T) => string): T[] {
  if (!mood.trim() || /以外|苦手|嫌い|食べたくない|避け|なしで/.test(mood)) return [...items];
  const groups = [
    { intent: /麺|そば|うどん|ラーメン/, food: /そば|うどん|ラーメン|麺/ },
    { intent: /和食/, food: /和食/ },
    { intent: /カフェ|コーヒー|喫茶/, food: /カフェ|喫茶|コーヒー/ },
    { intent: /郷土料理/, food: /郷土料理/ },
    { intent: /焼肉/, food: /焼肉/ },
  ].filter((group) => group.intent.test(mood));
  return items.map((item, index) => ({ item, index, score: Number(groups.some((g) => g.food.test(facts(item)))) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(({ item }) => item);
}
