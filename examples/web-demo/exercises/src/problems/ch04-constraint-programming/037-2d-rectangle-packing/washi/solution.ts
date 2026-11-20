import { Model, expr, max, minimize, or } from "@ohtaman/washi";
import "@ohtaman/washi/solvers/pumpkin";

export interface P037Input {
  stripWidth: number;
  widths: number[];
  heights: number[];
}

export interface P037Output {
  x: number[];
  y: number[];
  height: number;
}

export async function solve(input: P037Input): Promise<P037Output> {
  const maxHeight = input.heights.reduce((acc, h) => acc + h, 0);
  const m = new Model("RectangleStripPacking");

  const x = input.widths.map((w, i) =>
    m.integer(`x_${i}`, { lb: 0, ub: input.stripWidth - w })
  );
  const y = input.heights.map((h, i) =>
    m.integer(`y_${i}`, { lb: 0, ub: maxHeight - h })
  );

  m.constraint(
    input.widths.flatMap((_, i) =>
      input.widths.slice(i + 1).map((__, off) => {
        const j = i + 1 + off;
        return or(
          expr`${x[i]} + ${input.widths[i]} <= ${x[j]}`,
          expr`${x[j]} + ${input.widths[j]} <= ${x[i]}`,
          expr`${y[i]} + ${input.heights[i]} <= ${y[j]}`,
          expr`${y[j]} + ${input.heights[j]} <= ${y[i]}`
        );
      })
    )
  );

  m.objective(
    minimize(max(y.map((yi, i) => expr`${yi} + ${input.heights[i]}`)))
  );
  await m.solve({ solver: "pumpkin" });

  return {
    x: x.map((v) => Math.round(v.value!) || 0),
    y: y.map((v) => Math.round(v.value!) || 0),
    height: Math.round(m.objectiveValue!) || 0,
  };
}
