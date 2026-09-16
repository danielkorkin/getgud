// Static facet catalog for the practice-set builder and runner. Every value
// here is the exact string/code the College Board loader wrote into
// `question_assessment` — verified against the live database, not the raw
// API docs. Three `skillDesc` values in the DB carry a trailing space
// (P.B., Q.F., Q.G.); this file's labels are the trimmed, canonical form.
//
// This is the single source of truth for filter UI + validation — the set
// generator (`src/lib/query/generate-set.ts`) validates incoming filters
// against these lists rather than trusting client input verbatim.

export const ASSESSMENTS = [
  { value: 'SAT', label: 'SAT' },
  { value: 'PSAT/NMSQT & PSAT 10', label: 'PSAT/NMSQT & PSAT 10' },
] as const;

export type Assessment = (typeof ASSESSMENTS)[number]['value'];

export const SECTIONS = [
  { code: 'RW', label: 'Reading and Writing', section: 1 },
  { code: 'MATH', label: 'Math', section: 2 },
] as const;

export type SectionCode = (typeof SECTIONS)[number]['code'];

export const DIFFICULTIES = [
  { code: 'E', label: 'Easy' },
  { code: 'M', label: 'Medium' },
  { code: 'H', label: 'Hard' },
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number]['code'];

export const QUESTION_TYPES = [
  { code: 'mcq', label: 'Multiple choice' },
  { code: 'spr', label: 'Fill-in (student-produced response)' },
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number]['code'];

export const SCORE_BANDS = [1, 2, 3, 4, 5, 6, 7] as const;

export interface Skill {
  code: string;
  label: string;
}

export interface Domain {
  code: string;
  label: string;
  sectionCode: SectionCode;
  skills: Skill[];
}

export const DOMAINS: Domain[] = [
  {
    code: 'INI',
    label: 'Information and Ideas',
    sectionCode: 'RW',
    skills: [
      { code: 'CID', label: 'Central Ideas and Details' },
      { code: 'COE', label: 'Command of Evidence' },
      { code: 'INF', label: 'Inferences' },
    ],
  },
  {
    code: 'CAS',
    label: 'Craft and Structure',
    sectionCode: 'RW',
    skills: [
      { code: 'CTC', label: 'Cross-Text Connections' },
      { code: 'TSP', label: 'Text Structure and Purpose' },
      { code: 'WIC', label: 'Words in Context' },
    ],
  },
  {
    code: 'EOI',
    label: 'Expression of Ideas',
    sectionCode: 'RW',
    skills: [
      { code: 'SYN', label: 'Rhetorical Synthesis' },
      { code: 'TRA', label: 'Transitions' },
    ],
  },
  {
    code: 'SEC',
    label: 'Standard English Conventions',
    sectionCode: 'RW',
    skills: [
      { code: 'BOU', label: 'Boundaries' },
      { code: 'FSS', label: 'Form, Structure, and Sense' },
    ],
  },
  {
    code: 'H',
    label: 'Algebra',
    sectionCode: 'MATH',
    skills: [
      { code: 'H.A.', label: 'Linear equations in one variable' },
      { code: 'H.B.', label: 'Linear functions' },
      { code: 'H.C.', label: 'Linear equations in two variables' },
      { code: 'H.D.', label: 'Systems of two linear equations in two variables' },
      { code: 'H.E.', label: 'Linear inequalities in one or two variables' },
    ],
  },
  {
    code: 'P',
    label: 'Advanced Math',
    sectionCode: 'MATH',
    skills: [
      { code: 'P.A.', label: 'Equivalent expressions' },
      { code: 'P.B.', label: 'Nonlinear equations in one variable and systems of equations in two variables' },
      { code: 'P.C.', label: 'Nonlinear functions' },
    ],
  },
  {
    code: 'Q',
    label: 'Problem-Solving and Data Analysis',
    sectionCode: 'MATH',
    skills: [
      { code: 'Q.A.', label: 'Ratios, rates, proportional relationships, and units' },
      { code: 'Q.B.', label: 'Percentages' },
      { code: 'Q.C.', label: 'One-variable data: Distributions and measures of center and spread' },
      { code: 'Q.D.', label: 'Two-variable data: Models and scatterplots' },
      { code: 'Q.E.', label: 'Probability and conditional probability' },
      { code: 'Q.F.', label: 'Inference from sample statistics and margin of error' },
      { code: 'Q.G.', label: 'Evaluating statistical claims: Observational studies and experiments' },
    ],
  },
  {
    code: 'S',
    label: 'Geometry and Trigonometry',
    sectionCode: 'MATH',
    skills: [
      { code: 'S.A.', label: 'Area and volume' },
      { code: 'S.B.', label: 'Lines, angles, and triangles' },
      { code: 'S.C.', label: 'Right triangles and trigonometry' },
      { code: 'S.D.', label: 'Circles' },
    ],
  },
];

const DOMAIN_BY_CODE = new Map(DOMAINS.map((d) => [d.code, d]));
const SKILL_BY_CODE = new Map(DOMAINS.flatMap((d) => d.skills.map((s) => [s.code, { ...s, domain: d }])));
const VALID_SKILL_CODES = new Set(SKILL_BY_CODE.keys());
const VALID_DOMAIN_CODES = new Set(DOMAIN_BY_CODE.keys());
const VALID_SECTION_CODES = new Set(SECTIONS.map((s) => s.code));
const VALID_DIFFICULTIES = new Set(DIFFICULTIES.map((d) => d.code));
const VALID_ASSESSMENTS = new Set(ASSESSMENTS.map((a) => a.value));
const VALID_TYPES = new Set(QUESTION_TYPES.map((t) => t.code));

export function domainLabel(code: string): string {
  return DOMAIN_BY_CODE.get(code)?.label ?? code;
}

export function skillLabel(code: string): string {
  return SKILL_BY_CODE.get(code)?.label ?? code;
}

export function domainsForSection(sectionCode: SectionCode): Domain[] {
  return DOMAINS.filter((d) => d.sectionCode === sectionCode);
}

export function isValidAssessment(value: string): value is Assessment {
  return VALID_ASSESSMENTS.has(value as Assessment);
}

export function isValidSectionCode(value: string): value is SectionCode {
  return VALID_SECTION_CODES.has(value as SectionCode);
}

export function isValidDifficulty(value: string): value is Difficulty {
  return VALID_DIFFICULTIES.has(value as Difficulty);
}

export function isValidDomainCode(value: string): boolean {
  return VALID_DOMAIN_CODES.has(value);
}

export function isValidSkillCode(value: string): boolean {
  return VALID_SKILL_CODES.has(value);
}

export function isValidQuestionType(value: string): value is QuestionType {
  return VALID_TYPES.has(value as QuestionType);
}

export function isValidScoreBand(value: number): boolean {
  return (SCORE_BANDS as readonly number[]).includes(value);
}
