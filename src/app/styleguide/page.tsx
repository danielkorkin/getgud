import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { StrobiDemo } from "@/app/styleguide/strobi-demo";
import { Reveal } from "@/components/reveal";

const BENTO_CELLS: { label: string; value: string; className?: string }[] = [
  {
    label: "Question bank",
    value: "Full SAT + PSAT/NMSQT & PSAT 10",
    className: "sm:col-span-2",
  },
  { label: "Auto-converted equations", value: "~97%" },
  { label: "AI calls in the conversion pipeline", value: "0" },
  { label: "Hosting", value: "Local-first, self-hosted" },
];

const COLOR_TOKENS: { label: string; className: string }[] = [
  { label: "background", className: "bg-background" },
  { label: "card", className: "bg-card" },
  { label: "primary", className: "bg-primary" },
  { label: "secondary", className: "bg-secondary" },
  { label: "muted", className: "bg-muted" },
  { label: "accent", className: "bg-accent" },
  { label: "destructive", className: "bg-destructive" },
  { label: "border", className: "bg-border" },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-medium tracking-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <div className="isolate mx-auto flex w-full max-w-4xl flex-col gap-20 px-6 py-24">
      <div
        aria-hidden
        className="ambient-glow pointer-events-none fixed inset-0 -z-10"
      />
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <span className="text-xs tracking-[0.05em] text-muted-foreground uppercase">
            Getgud — Design Language
          </span>
          <h1 className="text-5xl font-medium leading-[1.1] tracking-tight">
            Quiet, editorial, built for focus.
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            A warm monochrome canvas with a single brand accent, reserved for
            the actions that matter — answering a question, checking a
            result, moving to the next one.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Reveal index={0}>
        <Section
          title="Bento"
          description="Asymmetrical grid, crisp 1px borders, generous padding."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {BENTO_CELLS.map((cell, i) => (
              <Reveal index={i + 1} key={cell.label}>
                <div
                  className={`flex h-full flex-col justify-between gap-6 rounded-xl border border-border p-8 ${cell.className ?? ""}`}
                >
                  <span className="text-xs tracking-wide text-muted-foreground uppercase">
                    {cell.label}
                  </span>
                  <span className="text-2xl font-medium leading-[1.1] tracking-tight">
                    {cell.value}
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      </Reveal>

      <Reveal index={0}>
        <Section title="Color" description="Warm neutrals with one spot color.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOR_TOKENS.map((token, i) => (
              <Reveal index={i} key={token.label} className="flex flex-col gap-2">
                <div
                  className={`h-16 rounded-lg ring-1 ring-foreground/10 ${token.className}`}
                />
                <span className="font-mono text-xs text-muted-foreground">
                  {token.label}
                </span>
              </Reveal>
            ))}
          </div>
        </Section>
      </Reveal>

      <Reveal index={0}>
        <Section title="Typography">
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-xs text-muted-foreground">
                Heading — Geist Sans, medium
              </p>
              <p className="text-4xl font-medium leading-[1.1] tracking-tight">
                Question 12 of 27
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Body — Geist Sans, regular
              </p>
              <p className="max-w-lg text-base">
                Which choice completes the text with the most logical
                transition? Read the passage carefully before selecting an
                answer.
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Meta / mono — Geist Mono
              </p>
              <p className="font-mono text-sm text-muted-foreground">
                12:47 remaining · saic-2847
              </p>
            </div>
          </div>
        </Section>
      </Reveal>

      <Reveal index={0}>
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
          </div>
        </Section>
      </Reveal>

      <Reveal index={0}>
        <Section
          title="Tags"
          description="Muted pastels — spot color, never a large surface."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="tag-blue">Reading</Badge>
            <Badge variant="tag-green">Correct</Badge>
            <Badge variant="tag-red">Incorrect</Badge>
            <Badge variant="tag-yellow">Flagged</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Section>
      </Reveal>

      <Reveal index={0}>
        <Section title="Card" description="Interactive cards lift on hover — an ultra-subtle, diffuse shadow, never a default.">
          <Card interactive className="max-w-sm">
            <CardHeader>
              <CardTitle>Practice set: Linear equations</CardTitle>
              <CardDescription>18 questions · Medium difficulty</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Progress value={62} />
              <p className="text-sm text-muted-foreground">
                11 of 18 answered
              </p>
            </CardContent>
          </Card>
        </Section>
      </Reveal>

      <Reveal index={0}>
        <Section title="Tabs">
          <Tabs defaultValue="math" className="max-w-sm">
            <TabsList>
              <TabsTrigger value="math">Math</TabsTrigger>
              <TabsTrigger value="reading">Reading & Writing</TabsTrigger>
            </TabsList>
            <TabsContent value="math">
              <p className="text-sm text-muted-foreground">
                Algebra, advanced math, problem solving, and geometry.
              </p>
            </TabsContent>
            <TabsContent value="reading">
              <p className="text-sm text-muted-foreground">
                Craft and structure, information and ideas, expression of
                ideas.
              </p>
            </TabsContent>
          </Tabs>
        </Section>
      </Reveal>

      <Reveal index={0}>
        <Section title="Avatar & Tooltip">
          <div className="flex items-center gap-4">
            <Avatar>
              <AvatarFallback>DK</AvatarFallback>
            </Avatar>
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" size="sm" />}>
                Hover for detail
              </TooltipTrigger>
              <TooltipContent>Score band: 640–690</TooltipContent>
            </Tooltip>
          </div>
        </Section>
      </Reveal>

      <Reveal index={0}>
        <Section
          title="Mascot"
          description="Procedural, code-driven avatar — expressions and looping animation timelines, no sprite or video assets."
        >
          <StrobiDemo />
        </Section>
      </Reveal>

      <Reveal index={0}>
        <Section title="Form field">
          <FieldGroup className="max-w-sm">
            <Field>
              <FieldLabel htmlFor="styleguide-email">Email</FieldLabel>
              <Input id="styleguide-email" type="email" placeholder="you@school.edu" />
            </Field>
          </FieldGroup>
        </Section>
      </Reveal>

      <Separator />
      <footer className="pb-8 text-xs text-muted-foreground">
        This page is a living reference for the design system — not a
        practice-tool screen.
      </footer>
    </div>
  );
}
