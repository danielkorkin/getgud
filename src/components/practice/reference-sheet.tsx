// The standard SAT Math reference sheet — published formulas every SAT
// test-taker already sees on the real exam, not scraped College Board
// content. Plain markup (sup/sub) is plenty for this fixed, small set of
// formulas — no need to route it through the KaTeX pipeline.

const CIRCLE_FACTS = ["The number of degrees of arc in a circle is 360.", "The number of radians of arc in a circle is 2π."];

export function ReferenceSheet() {
  return (
    <div className="flex flex-col gap-6 p-4 text-sm">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Shape label="Circle" formula={<>A = πr²</>} note="r = radius" />
        <Shape label="Rectangle" formula={<>A = ℓw</>} note="ℓ = length, w = width" />
        <Shape label="Triangle" formula={<>A = ½bh</>} note="b = base, h = height" />
        <Shape label="Right triangle" formula={<>c² = a² + b²</>} note="Pythagorean theorem" />
        <Shape label="Rectangular box" formula={<>V = ℓwh</>} />
        <Shape label="Cylinder" formula={<>V = πr²h</>} />
        <Shape label="Sphere" formula={<>V = (4/3)πr³</>} />
        <Shape label="Cone" formula={<>V = (1/3)πr²h</>} />
        <Shape label="Pyramid" formula={<>V = (1/3)ℓwh</>} />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
        <p className="font-heading text-sm font-medium">Special right triangles</p>
        <p className="text-muted-foreground">
          30°–60°–90°: sides in ratio <span className="font-mono">x : x√3 : 2x</span>
        </p>
        <p className="text-muted-foreground">
          45°–45°–90°: sides in ratio <span className="font-mono">x : x : x√2</span>
        </p>
      </div>

      <ul className="flex flex-col gap-1 text-muted-foreground">
        {CIRCLE_FACTS.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
        <li>The sum of the measures in degrees of the angles of a triangle is 180.</li>
      </ul>
    </div>
  );
}

function Shape({ label, formula, note }: { label: string; formula: React.ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-mono text-base">{formula}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
