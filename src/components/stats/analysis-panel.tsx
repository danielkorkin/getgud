"use client";

import { useState, useTransition } from "react";
import { ChatsCircleIcon, SparkleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { skillLabel } from "@/lib/catalog";
import { analyzeStats } from "@/actions/stats";
import { createSet } from "@/actions/sets";
import type { Analysis, RecommendedSet } from "@/lib/ai/stats-schema";

export function AnalysisPanel() {
  const [isPending, startTransition] = useTransition();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleAnalyze() {
    setError(null);
    startTransition(async () => {
      const result = await analyzeStats();
      if ("error" in result) {
        setError(result.error);
        setAnalysis(null);
      } else {
        setAnalysis(result.analysis);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-medium tracking-tight">AI analysis</h2>
          <p className="text-sm text-muted-foreground">
            A model reviews your practice history and suggests targeted sets to drill.
          </p>
        </div>
        <Button onClick={handleAnalyze} disabled={isPending}>
          {isPending ? <Spinner data-icon="inline-start" /> : <SparkleIcon data-icon="inline-start" />}
          {analysis ? "Re-analyze" : "Analyze my performance"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {analysis && (
        <div className="flex flex-col gap-3">
          <Alert>
            <AlertTitle>Summary</AlertTitle>
            <AlertDescription>{analysis.summary}</AlertDescription>
          </Alert>

          {analysis.troubleSpots.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ChatsCircleIcon className="size-4 text-muted-foreground" />
                  <CardTitle className="text-base">Recurring trouble spots</CardTitle>
                </div>
                <CardDescription>Patterns noticed across your past coach conversations.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {analysis.troubleSpots.map((spot, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>{spot}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {analysis.recommendedSets.map((rec, i) => (
              <RecommendedSetCard key={i} rec={rec} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendedSetCard({ rec }: { rec: RecommendedSet }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await createSet(
        {
          assessment: rec.assessment,
          sectionCodes: [],
          difficulties: rec.difficulties,
          domainCodes: [],
          skillCodes: rec.skillCodes,
          scoreBands: [],
          types: [],
          excludeAttempted: true,
          questionCount: rec.questionCount,
        },
        rec.name,
      );
      // createSet redirects on success — it only returns when there's an error.
      if (result && "error" in result) setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{rec.name}</CardTitle>
        <CardDescription>{rec.rationale}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1.5">
        {rec.skillCodes.map((code) => (
          <Badge key={code} variant="outline">
            {skillLabel(code)}
          </Badge>
        ))}
        <Badge variant="secondary">{rec.questionCount} questions</Badge>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button size="sm" onClick={handleStart} disabled={isPending}>
          {isPending && <Spinner data-icon="inline-start" />}
          Start this set
        </Button>
      </CardFooter>
    </Card>
  );
}
