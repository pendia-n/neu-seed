type SeedPosition = { id: string; x: number; y: number };
type Point = { x: number; y: number };

const regionDistance = 185;
const palette = ["sage", "blue", "violet", "rose", "amber", "teal"];

function hull(points: Point[]) {
  const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y);
  function half(ordered: Point[]) {
    const result: Point[] = [];
    for (const point of ordered) {
      while (result.length >= 2) {
        const a = result[result.length - 2];
        const b = result[result.length - 1];
        if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) > 0) break;
        result.pop();
      }
      result.push(point);
    }
    return result.slice(0, -1);
  }
  return [...half(sorted), ...half(sorted.reverse())];
}

export function boardRegions(seeds: SeedPosition[]) {
  const parents = seeds.map((_, index) => index);
  function root(index: number) {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  }

  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const a = seeds[i];
      const b = seeds[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < regionDistance * regionDistance) {
        parents[root(j)] = root(i);
      }
    }
  }

  const groups = new Map<number, SeedPosition[]>();
  seeds.forEach((seed, index) => {
    const group = root(index);
    const members = groups.get(group) ?? [];
    members.push(seed);
    groups.set(group, members);
  });

  return [...groups.values()].filter((group) => group.length > 1).map((group) => {
    const id = group[0].id;
    // Use the seed ID for a stable palette draw. Different groups may share a color.
    let hash = 0;
    for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
    const points = hull(group.flatMap(({ x, y }) => [
      { x: x - 6, y: y - 6 }, { x: x + 166, y: y - 6 },
      { x: x + 166, y: y + 96 }, { x: x - 6, y: y + 96 },
    ]));
    return { id, color: palette[hash % palette.length], points: points.map(({ x, y }) => `${x},${y}`).join(" ") };
  });
}
