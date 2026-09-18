// Problem-Solving and Data Analysis (Q) — the statistics half.
//
// Covers Q.C through Q.G, which the formula cheat sheet deliberately
// doesn't: these four skills are conceptual rather than formula-driven, and
// the questions test whether you know what a statistic licenses you to
// conclude, not whether you can compute it. The margin-of-error and
// study-design questions in particular are answerable from a handful of
// principles and are almost never arithmetic.
//
// Without this guide the four Q.C–Q.G skill codes would have no in-app
// content at all, which would show up as an empty state on the results
// page for anyone whose weakest skill is one of them.

import type { Guide } from "../spec";

export const DATA_AND_STATISTICS: Guide = {
  id: "data-and-statistics",
  title: "Data, statistics, and what you're allowed to conclude",
  kind: "cheatsheet",
  summary:
    "Center and spread, probability, margin of error, and study design — mostly about what a statistic does and doesn't license you to say.",
  minutes: 10,
  tests: ["SAT", "PSAT"],
  sectionCode: "MATH",
  domainCodes: ["Q"],
  skillCodes: ["Q.C.", "Q.D.", "Q.E.", "Q.F.", "Q.G."],
  sections: [
    {
      heading: "Center and spread",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Mean moves with outliers, median doesn't",
              detail:
                "This is the most-tested idea in the whole domain. Add one extreme value to a data set and the mean shifts toward it while the median barely moves. Questions phrased 'which measure would change more' are asking exactly this.",
              example: "For 2, 3, 4, 5, 100 — the median is 4, but the mean is 22.8.",
            },
            {
              rule: "Skew tells you where the mean sits relative to the median",
              detail:
                "In a right-skewed (long tail to the right) distribution, the mean is greater than the median. Left-skewed, the mean is less. Symmetric, they're about equal.",
            },
            {
              rule: "Standard deviation measures spread, not size",
              detail:
                "Two data sets can share a mean and have completely different standard deviations. A question asking which set has the larger standard deviation is asking which is more spread out from its own mean — you almost never have to compute it.",
            },
            {
              rule: "Range is only the two endpoints",
              detail: "It ignores everything in between, so it can be identical for two very differently shaped data sets.",
            },
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          content:
            "For a frequency table or histogram, remember each value is repeated by its frequency. The median is the middle of all the data points, not the middle row of the table.",
        },
      ],
    },
    {
      heading: "Two-variable data and models",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Read the axis labels and units before anything else",
              detail:
                "A large share of missed scatterplot questions are unit errors, not reasoning errors — thousands read as units, or a per-month rate read as a total.",
            },
            {
              rule: "The line of best fit answers 'predict' questions",
              detail:
                "Asked to predict a value, use the model. Asked for an actual observed value, read the data point. Questions often include both a point and the line near the same x, and the wrong one is an available answer.",
            },
            {
              rule: "Interpret slope in the question's own words",
              detail:
                "The slope of a best-fit line is 'change in the y-quantity per one unit of the x-quantity'. Phrase it with the real units and the correct choice usually becomes obvious.",
            },
            {
              rule: "Linear adds, exponential multiplies",
              detail:
                "A linear model grows by a constant amount per step; an exponential model grows by a constant percentage or factor. If a table shows values that double at a fixed interval, that's exponential, not linear.",
            },
          ],
        },
      ],
    },
    {
      heading: "Probability",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Almost every probability question here is a two-way table",
              detail:
                "The whole task is picking the right denominator. Read the question to find which group it restricts you to, and use that group's total — not the grand total.",
              example:
                "'The probability that a randomly selected student who plays a sport also takes band' means the denominator is students who play a sport, not all students.",
            },
            {
              rule: "\"Given that\" means the condition becomes the denominator",
              detail: "Conditional probability on this test is just a table lookup with a restricted denominator. There's no formula to memorize.",
            },
          ],
        },
      ],
    },
    {
      heading: "Margin of error and inference",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "A margin of error is a range around the sample estimate",
              detail:
                "An estimate of 45% with a margin of error of 3% means the plausible interval is 42% to 48%. Correct answers are phrased as intervals or as plausible values inside one.",
            },
            {
              rule: "A larger sample shrinks the margin of error",
              detail:
                "This is the most commonly tested relationship in the skill. Nothing else in the setup — not the population size — shrinks it the way sample size does.",
            },
            {
              rule: "Lower confidence also narrows the interval",
              detail: "A 90% confidence interval is narrower than a 95% one from the same sample. More confidence requires a wider net.",
            },
            {
              rule: "Conclusions apply only to the population you sampled",
              detail:
                "If the sample was drawn from one school's students, the conclusion is about that school — not about all students in the state. Choices that generalize beyond the sampled population are wrong.",
            },
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          content:
            "A margin of error says nothing about whether the sample was collected well. A biased sample with a tiny margin of error is still biased — and that's usually the trap in these questions.",
        },
      ],
    },
    {
      heading: "Study design: what the design lets you claim",
      blocks: [
        {
          kind: "rules",
          items: [
            {
              rule: "Only a randomized experiment supports a causal claim",
              detail:
                "If subjects were randomly assigned to treatments, a cause-and-effect conclusion is available. If the study merely observed what people already did, it isn't — however strong the association.",
            },
            {
              rule: "Random selection and random assignment do different jobs",
              detail:
                "Random selection from a population is what lets you generalize to that population. Random assignment to groups is what lets you infer causation. A question can hinge on which one the study actually did.",
            },
            {
              rule: "Self-selected and convenience samples don't generalize",
              detail:
                "Volunteers, online poll respondents, and whoever happened to be nearby are not representative. The correct answer will be the appropriately cautious one.",
            },
          ],
        },
        {
          kind: "table",
          columns: ["The study did this", "So you may conclude"],
          rows: [
            ["Randomly assigned subjects to groups", "The treatment caused the difference"],
            ["Randomly sampled, but only observed", "An association exists in that population — not causation"],
            ["Used volunteers or a convenience sample", "Very little; the sample isn't representative"],
            ["Sampled one narrow group", "Something about that group only"],
          ],
        },
      ],
    },
  ],
  related: ["khan-sat-math", "yt-organic-chemistry-tutor", "desmos-collegeboard-graphing", "college-panda"],
};
