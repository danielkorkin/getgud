// Parse College Board's "spoken math" alt-text descriptions (the prose
// screen-reader text attached to disclosed/IBN equation images, e.g. "the
// fraction with numerator x plus 1 and denominator x minus 1") into LaTeX.
//
// This is a real recursive-descent parser over a real grammar, not a regex
// substitution: fractions, roots, exponents, and subscripts are recursive
// constructs and the earlier MathSpeak-style regex idea was abandoned
// specifically because naive substitution cannot resolve nesting scope
// safely. This parser can, because it tracks explicit stop-tokens through
// recursive calls instead of guessing where a construct ends.
//
// It NEVER guesses: an unexpected token, a construct with no unambiguous
// end, or leftover input after a top-level parse throws ParseError. The
// caller treats that as "send this one to a human/vision review" — a slow
// deterministic correct answer beats a fast wrong one in a study tool.

export class ParseError extends Error {}

// ---- Tokenizer ------------------------------------------------------------

type Token =
  | { kind: "num"; value: string }
  | { kind: "word"; value: string } // a bare variable/identifier (x, V, sin, f, ...)
  | { kind: "kw"; value: KeywordToken }
  | { kind: "root"; index: string } // "the Nth root of" — general form, index is a number or "n"
  | { kind: "text"; value: string }; // literal unit/label text (e.g. "degrees", "dollars")

type KeywordToken =
  | "FRAC_WITH_NUM" // "the fraction with numerator"
  | "AND_DENOMINATOR" // "and denominator"
  | "FRAC" // "the fraction"
  | "FRAC_NEGATIVE" // "the negative fraction"
  | "OVER" // "over"
  | "END_FRACTION"
  | "SQRT" // "the square root of"
  | "CBRT" // "the cube root of"
  | "END_ROOT"
  | "SQUARED"
  | "CUBED"
  | "TO_THE" // "to the" / "raised to the" / "raised to"
  | "POWER" // "power"
  | "END_POWER"
  | "SUB" // "sub" (subscript)
  | "LPAREN"
  | "RPAREN"
  | "NEGATIVE"
  | "EQUALS" // "equals" / "which equals"
  | "LEQ"
  | "GEQ"
  | "LT"
  | "GT"
  | "NEQ"
  | "PLUS"
  | "MINUS"
  | "PLUS_MINUS"
  | "TIMES"
  | "DIVIDED_BY"
  | "COMMA"
  | "AND"
  | "ORDERED_PAIR"
  | "SET_OF"
  | "DEGREES"
  | "OF" // function application: "f of x" -> f(x)
  | "LINE_SEGMENT"
  | "TRIANGLE"
  | "ANGLE"
  | "SIDE"
  | "LENGTH_OF"
  | "MEASURE_OF"
  | "SIN_OF"
  | "COS_OF"
  | "TAN_OF"
  | "APPROX"
  | "END_SUBSCRIPT"
  | "PI";

// Longest-phrase-first. Each entry: the phrase regex source (word-boundary
// wrapped by the caller) and the keyword it produces.
const KEYWORD_PHRASES: [string, KeywordToken][] = [
  ["the fraction with numerator", "FRAC_WITH_NUM"],
  ["and denominator", "AND_DENOMINATOR"],
  ["the negative fraction", "FRAC_NEGATIVE"],
  ["the fraction", "FRAC"],
  ["end fraction", "END_FRACTION"],
  ["the square root of", "SQRT"],
  ["square root of", "SQRT"],
  ["the cube root of", "CBRT"],
  ["cube root of", "CBRT"],
  ["end root", "END_ROOT"],
  ["squared", "SQUARED"],
  ["cubed", "CUBED"],
  ["raised to", "TO_THE"], // NOT "raised to the" as one unit — that would eat the "the" that "the fraction"/"the square root of" need right after ("raised to the fraction Q over 4 power")
  ["to the", "TO_THE"],
  ["end power", "END_POWER"],
  ["power", "POWER"],
  ["sub", "SUB"],
  ["open outer parenthesis", "LPAREN"],
  ["close outer parenthesis", "RPAREN"],
  ["open inner parenthesis", "LPAREN"],
  ["close inner parenthesis", "RPAREN"],
  ["open parenthesis", "LPAREN"],
  ["close parenthesis", "RPAREN"],
  ["end parenthesis", "RPAREN"],
  ["parenthesis", "LPAREN"], // occasional upstream typo dropping "open "
  ["plus or minus", "PLUS_MINUS"],
  ["the negative of", "NEGATIVE"],
  ["negative of", "NEGATIVE"],
  ["negative", "NEGATIVE"],
  ["the sine of", "SIN_OF"],
  ["sine of", "SIN_OF"],
  ["the cosine of", "COS_OF"],
  ["cosine of", "COS_OF"],
  ["the tangent of", "TAN_OF"],
  ["tangent of", "TAN_OF"],
  ["the measure of", "MEASURE_OF"],
  ["end subscript", "END_SUBSCRIPT"],
  ["subscript", "SUB"],
  ["comma", "COMMA"],
  ["which equals", "EQUALS"],
  ["which is approximately equal to", "APPROX"],
  ["which is less than or equal to", "LEQ"],
  ["which is greater than or equal to", "GEQ"],
  ["which is not equal to", "NEQ"],
  ["which is less than", "LT"],
  ["which is greater than", "GT"],
  ["is less than or equal to", "LEQ"],
  ["less than or equal to", "LEQ"],
  ["is greater than or equal to", "GEQ"],
  ["greater than or equal to", "GEQ"],
  ["is not equal to", "NEQ"],
  ["does not equal", "NEQ"],
  ["not equal to", "NEQ"],
  ["is approximately equal to", "APPROX"],
  ["approximately equal to", "APPROX"],
  ["equal to", "EQUALS"],
  ["is less than", "LT"],
  ["less than", "LT"],
  ["is greater than", "GT"],
  ["greater than", "GT"],
  ["the point with coordinates", "ORDERED_PAIR"],
  ["the points with coordinates", "ORDERED_PAIR"],
  ["with coordinates", "ORDERED_PAIR"],
  ["equals", "EQUALS"],
  ["is equal to", "EQUALS"],
  ["is", "EQUALS"],
  ["plus", "PLUS"],
  ["minus", "MINUS"],
  ["times", "TIMES"],
  ["divided by", "DIVIDED_BY"],
  ["the ordered pair", "ORDERED_PAIR"],
  ["set consisting of", "SET_OF"],
  ["degrees", "DEGREES"],
  ["pi", "PI"],
  ["degree", "DEGREES"],
  ["the length of side", "LENGTH_OF"],
  ["the length of", "LENGTH_OF"],
  ["line segment", "LINE_SEGMENT"],
  ["triangle", "TRIANGLE"],
  ["angle", "ANGLE"],
  ["side", "SIDE"],
  ["and", "AND"],
  ["over", "OVER"],
  ["of", "OF"],
];

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const CARDINAL_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

// Plural denominator words -> the number they denote, e.g. "thirds" -> 3.
// "halves" is irregular (not "twoths").
const DENOMINATOR_WORDS: Record<string, number> = {
  half: 2,
  halves: 2,
  third: 3,
  thirds: 3,
  fourth: 4,
  fourths: 4,
  fifth: 5,
  fifths: 5,
  sixth: 6,
  sixths: 6,
  seventh: 7,
  sevenths: 7,
  eighth: 8,
  eighths: 8,
  ninth: 9,
  ninths: 9,
  tenth: 10,
  tenths: 10,
};

// Spelled-out fractions like "one third", "two sixths", "one-half" — merged
// into a single LaTeX-fraction literal before generic tokenization, since
// they're semantically one atom, not two separate words.
const SPELLED_FRACTION_RE = new RegExp(
  `\\b(${Object.keys(CARDINAL_WORDS).join("|")})[\\s-]+(${Object.keys(DENOMINATOR_WORDS).join("|")})\\b`,
  "gi",
);

export function tokenize(input: string): Token[] {
  // Merge "N point N" decimals and thousands-comma numbers before generic
  // tokenization — both look like word/punctuation boundaries otherwise.
  const text = input
    // Systems of equations framed as prose ("Equation 1: X. Equation 2: Y.",
    // "This answer choice consists of two equations. X, and, Y.") — strip
    // the labels/framing sentence, then let a genuine sentence break become
    // the same top-level "and" join a bare "and" already triggers. Must run
    // before the decimal-merge below matches on bare digits/periods.
    .replace(/\bEquation\s+\d+\s*:\s*/gi, "")
    .replace(/\b(?:this answer choice|each option)\s+consists\s+of\s+\w+\s+equations?\.\s*/gi, "")
    .replace(/\bopen\s+brace\b,?\s*/gi, "")
    .replace(/\bclose\s+brace\b,?\s*/gi, "")
    .replace(/\.\s+(?=\S)/g, " and ") // a real sentence break, not a decimal point (those have no following space yet)
    .replace(/\btimes,/gi, "times ") // "1,800 times, 1 point 0 2" — trailing comma noise after an operator
    .replace(/,\s*(end fraction|end root|which equals)\b/gi, " $1") // drop the comma before an explicit closer/chain word
    .replace(/(\d)\s+point\s+(\d(?:\s+\d)*)/gi, (_m, whole: string, fracDigits: string) => {
      return `${whole}.${fracDigits.replace(/\s+/g, "")}`;
    })
    .replace(SPELLED_FRACTION_RE, (_m, num: string, den: string) => {
      const n = CARDINAL_WORDS[num.toLowerCase()];
      const d = DENOMINATOR_WORDS[den.toLowerCase()];
      return ` @FRAC${n}_${d}@ `;
    })
    // "the fourth root of" / "the nth root of" — square/cube already have
    // their own fixed phrases; any other ordinal (or the variable-degree
    // "nth") is this general form.
    .replace(/\bthe\s+(nth|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+root\s+of\b/gi, (_m, ord: string) => {
      const index = ord.toLowerCase() === "nth" ? "n" : String(WORD_NUMBERS[ord.toLowerCase()]);
      return ` @ROOT${index}@ `;
    });

  const tokens: Token[] = [];
  // Longest phrase first, case-insensitive, word-boundary delimited.
  const phrasePattern = new RegExp(
    `@FRAC\\d+_\\d+@|@ROOT[0-9n]+@` +
      `|\\b(${KEYWORD_PHRASES.map(([p]) => p.replace(/ /g, "\\s+")).join("|")})\\b` +
      `|\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?` +
      `|[A-Za-z]+|,`,
    "gi",
  );

  const phraseToKeyword = new Map(KEYWORD_PHRASES.map(([p, k]) => [p.toLowerCase().replace(/\s+/g, " "), k]));

  let match: RegExpExecArray | null;
  while ((match = phrasePattern.exec(text))) {
    const raw = match[0];
    if (raw === ",") {
      tokens.push({ kind: "kw", value: "COMMA" });
      continue;
    }
    const fracMatch = /^@FRAC(\d+)_(\d+)@$/.exec(raw);
    if (fracMatch) {
      tokens.push({ kind: "num", value: `\\frac{${fracMatch[1]}}{${fracMatch[2]}}` });
      continue;
    }
    const rootMatch = /^@ROOT([0-9n]+)@$/.exec(raw);
    if (rootMatch) {
      tokens.push({ kind: "root", index: rootMatch[1] });
      continue;
    }
    const normalized = raw.toLowerCase().replace(/\s+/g, " ");
    if (phraseToKeyword.has(normalized)) {
      tokens.push({ kind: "kw", value: phraseToKeyword.get(normalized)! });
    } else if (/^\d/.test(raw)) {
      tokens.push({ kind: "num", value: raw.replace(/,/g, "") });
    } else {
      tokens.push({ kind: "word", value: raw });
    }
  }
  return tokens;
}

// ---- Parser -----------------------------------------------------------

const STOP_ALL_RELATIONS = new Set<KeywordToken>(["EQUALS", "LEQ", "GEQ", "LT", "GT", "NEQ", "APPROX"]);

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }


  private isKw(token: Token | undefined, kw: KeywordToken): boolean {
    return !!token && token.kind === "kw" && token.value === kw;
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new ParseError("unexpected end of input");
    this.pos++;
    return t;
  }

  /** Only auto-skip a comma when this context doesn't treat COMMA itself as
   * a meaningful stop marker (ordered pairs / sets put COMMA in their stop
   * set precisely so it is NOT swallowed here). Commas in this corpus are
   * overwhelmingly spoken-pause punctuation, e.g. "120 a, plus 100 b" — the
   * comma before "plus" carries no meaning. Called at every point where a
   * fresh token is about to be inspected, so a run of stray commas never
   * blocks a continuation or a postfix modifier. */
  private skipStrayCommas(stop: Set<KeywordToken>): void {
    while (!stop.has("COMMA") && this.isKw(this.peek(), "COMMA")) this.pos++;
  }

  private atEnd(stop: Set<KeywordToken>): boolean {
    this.skipStrayCommas(stop);
    const t = this.peek();
    if (!t) return true;
    return t.kind === "kw" && stop.has(t.value);
  }

  parseTopLevel(): string {
    const statements: string[] = [this.parseFullStatement()];
    while (!this.atEnd(new Set())) {
      if (!this.isKw(this.peek(), "AND")) break;
      this.next();
      // "..., and equals Y" is prose continuing the SAME statement (a
      // trailing relation with no repeated subject), not a second one.
      if (this.peek()?.kind === "kw" && STOP_ALL_RELATIONS.has((this.peek() as { value: KeywordToken }).value)) {
        const t = this.next() as { kind: "kw"; value: KeywordToken };
        const op = RELATION_OPS[t.value];
        const right = this.parseAdditive(new Set());
        statements[statements.length - 1] = `${statements[statements.length - 1]} ${op} ${right}`;
      } else {
        statements.push(this.parseFullStatement());
      }
    }
    if (!this.atEnd(new Set())) {
      const suffix = this.tryParseTrailingUnitSuffix();
      if (suffix === null || !this.atEnd(new Set())) {
        throw new ParseError(`unconsumed input at position ${this.pos}: ${JSON.stringify(this.peek())}`);
      }
      statements[statements.length - 1] += suffix;
    }
    return statements.join("\\text{ and }");
  }

  /** One complete relational statement (a system of equations is several of
   * these joined by "and" at the top level). */
  private parseFullStatement(): string {
    // A handful of alt strings are truncated fragments starting mid-sentence
    // with "which equals X" / "equals X" and no left-hand side at all —
    // drop the dangling relation and parse just the value.
    if (this.peek()?.kind === "kw" && STOP_ALL_RELATIONS.has((this.peek() as { value: KeywordToken }).value)) {
      this.next();
      return this.parseAdditive(new Set());
    }
    return this.parseRelational(new Set());
  }

  /** A trailing run of plain words (optionally ending in "squared"/"cubed")
   * after the numeric content is a unit label, e.g. "75 centimeters squared"
   * = 75 cm². Only consumed when it accounts for ALL remaining input —
   * never partially, since a genuine parse failure should still throw. */
  private tryParseTrailingUnitSuffix(): string | null {
    const start = this.pos;
    const words: string[] = [];
    let power: 2 | 3 | null = null;
    for (;;) {
      const t = this.peek();
      if (t && t.kind === "word") {
        this.next();
        words.push(t.value);
      } else if (this.isKw(t, "SQUARED")) {
        this.next();
        power = 2;
      } else if (this.isKw(t, "CUBED")) {
        this.next();
        power = 3;
      } else if (this.isKw(t, "COMMA")) {
        this.next();
      } else {
        break;
      }
    }
    if (words.length === 0) {
      this.pos = start;
      return null;
    }
    const text = `\\text{ ${words.join(" ")}}`;
    return power ? `${text}^{${power}}` : text;
  }

  private parseRelational(stop: Set<KeywordToken>): string {
    let left = this.parseAdditive(stop);
    while (!this.atEnd(stop)) {
      const t = this.peek();
      if (t && t.kind === "kw" && STOP_ALL_RELATIONS.has(t.value)) {
        this.next();
        const op = RELATION_OPS[t.value];
        const right = this.parseAdditive(stop);
        left = `${left} ${op} ${right}`;
      } else {
        break;
      }
    }
    return left;
  }

  private parseAdditive(stop: Set<KeywordToken>): string {
    const localStop = union(stop, STOP_ALL_RELATIONS, ["AND", "END_FRACTION", "END_ROOT", "RPAREN"]);
    let left = this.parseMultiplicative(localStop);
    while (!this.atEnd(localStop)) {
      const t = this.peek();
      if (this.isKw(t, "PLUS")) {
        this.next();
        left = `${left}+${this.parseMultiplicative(localStop)}`;
      } else if (this.isKw(t, "MINUS")) {
        this.next();
        left = `${left}-${this.parseMultiplicative(localStop)}`;
      } else if (this.isKw(t, "PLUS_MINUS")) {
        // Binary "±" between two already-parsed terms, e.g. the quadratic
        // formula's "negative b plus or minus the square root of ...".
        this.next();
        left = `${left}\\pm${this.parseMultiplicative(localStop)}`;
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplicative(stop: Set<KeywordToken>): string {
    const localStop = union(stop, ["PLUS", "MINUS", "PLUS_MINUS"]);
    let left = this.parseUnary(localStop);
    for (;;) {
      if (this.atEnd(localStop)) break;
      const t = this.peek();
      if (this.isKw(t, "TIMES")) {
        this.next();
        left = `${left} \\times ${this.parseUnary(localStop)}`;
      } else if (this.isKw(t, "DIVIDED_BY") || this.isKw(t, "OVER")) {
        // Bare "A over B" (no "the fraction" prefix) is the same construct.
        this.next();
        left = `\\frac{${left}}{${this.parseUnary(localStop)}}`;
      } else if (this.startsAtom(localStop)) {
        // Implicit multiplication by juxtaposition, e.g. "a, b" meaning the
        // product ab (a real, standard math convention — not a guess).
        left = `${left}${this.parseUnary(localStop)}`;
      } else {
        break;
      }
    }
    return left;
  }

  /** Whether the (comma-skipped) next token could begin a fresh atom —
   * used to detect implicit multiplication by juxtaposition. */
  private startsAtom(stop: Set<KeywordToken>): boolean {
    if (this.atEnd(stop)) return false;
    const t = this.peek();
    if (!t) return false;
    // A bare "word" only starts implicit multiplication when it's a real
    // single-letter variable (e.g. "a, b" meaning the product ab). A
    // multi-letter word is prose ("centimeters", "of", "coordinates", a
    // function name already consumed elsewhere) — accepting it here is how
    // "cubic centimeters" used to become the nonsense atom "cubiccentimeters"
    // instead of falling through to the trailing-unit-suffix handling (or,
    // for "F of X", to the dedicated OF construct below) where it belongs.
    if (t.kind === "num" || t.kind === "root") return true;
    if (t.kind === "word") return /^[A-Za-z]$/.test(t.value);
    if (t.kind === "kw") {
      return (
        t.value === "LPAREN" ||
        t.value === "SQRT" ||
        t.value === "CBRT" ||
        t.value === "FRAC" ||
        t.value === "FRAC_WITH_NUM" ||
        t.value === "FRAC_NEGATIVE" ||
        t.value === "NEGATIVE" ||
        t.value === "PI"
      );
    }
    return false;
  }

  private parseUnary(stop: Set<KeywordToken>): string {
    this.skipStrayCommas(stop);
    if (this.isKw(this.peek(), "NEGATIVE")) {
      this.next();
      return `-${this.parseUnary(stop)}`;
    }
    if (this.isKw(this.peek(), "PLUS_MINUS")) {
      this.next();
      return `\\pm${this.parseUnary(stop)}`;
    }
    return this.parsePostfix(stop);
  }

  private parsePostfix(stop: Set<KeywordToken>): string {
    let atom = this.parseAtom(stop);
    for (;;) {
      this.skipStrayCommas(stop);
      const t = this.peek();
      if (this.isKw(t, "SQUARED")) {
        this.next();
        atom = `{${atom}}^{2}`;
      } else if (this.isKw(t, "CUBED")) {
        this.next();
        atom = `{${atom}}^{3}`;
      } else if (this.isKw(t, "DEGREES")) {
        this.next();
        atom = `{${atom}}^{\\circ}`;
      } else if (this.isKw(t, "SUB")) {
        this.next();
        const sub = this.parseAtomicToken();
        this.skipStrayCommas(stop);
        if (this.isKw(this.peek(), "END_SUBSCRIPT")) this.next();
        atom = `{${atom}}_{${sub}}`;
      } else if (this.isKw(t, "OF")) {
        // Function application, e.g. "f of x" -> f(x), "f of negative 1" ->
        // f(-1), "f of (3x)" -> f(3x), "cosine of angle R S W" ->
        // cosine(\angle RSW). The argument is one unary-level term — never
        // an open-ended expression, since parseUnary stops at +/-.
        this.next();
        const arg = this.parseUnary(stop);
        atom = `${atom}\\left(${arg}\\right)`;
      } else if (this.isKw(t, "TO_THE")) {
        this.next();
        // Two word orders occur: "to the FIFTH power" (value between) and
        // "to the power T" (value after) — handle both. Either way the
        // closer may be the plain "power" or the more explicit "end power",
        // and an "end power" closer is sometimes present even after the
        // power-first form ("to the power 6, end power").
        if (this.isKw(this.peek(), "POWER")) {
          this.next();
          const exponent = this.parseExponentValue(stop);
          this.skipStrayCommas(stop);
          if (this.isKw(this.peek(), "END_POWER")) this.next();
          atom = `{${atom}}^{${exponent}}`;
        } else {
          const exponent = this.parseExponentValue(stop);
          if (!this.isKw(this.peek(), "POWER") && !this.isKw(this.peek(), "END_POWER")) {
            throw new ParseError('expected "power" to close "to the ..."');
          }
          this.next();
          atom = `{${atom}}^{${exponent}}`;
        }
      } else {
        break;
      }
    }
    return atom;
  }

  /** The exponent slot in "to the FOO power" — a word-number, a bare
   * variable, or a nested fraction, but never a full relational expression. */
  private parseExponentValue(stop: Set<KeywordToken>): string {
    // "raised to the fourth power" tokenizes as TO_THE("raised to") + "the"
    // + "fourth" + POWER — a bare filler "the" with nothing else it could
    // belong to (unlike "the fraction"/"the square root of", which are
    // matched as their own multi-word phrases and never reach here as a
    // lone "the"). Skip it.
    if (this.peek()?.kind === "word" && (this.peek() as { value: string }).value.toLowerCase() === "the") {
      this.next();
    }
    const t = this.peek();
    if (t && t.kind === "word" && t.value.toLowerCase() in WORD_NUMBERS) {
      this.next();
      return String(WORD_NUMBERS[t.value.toLowerCase()]);
    }
    return this.parseAdditive(union(freshScope(stop), ["POWER", "END_POWER"]));
  }

  /** A single token used as a subscript — kept intentionally narrow
   * (subscripts in this corpus are always one variable or one number). */
  private parseAtomicToken(): string {
    const t = this.next();
    if (t.kind === "num" || t.kind === "word") return t.value;
    throw new ParseError(`expected a subscript token, got ${JSON.stringify(t)}`);
  }

  /** A run of one or more point labels, e.g. "D E" / "A, B C" / the
   * pre-merged "NQ" (the corpus mixes space-, comma-, and no-separator
   * forms) for "line segment", "triangle", "angle", "side". Concatenated
   * with no separator (AB, ABC). */
  private parsePointLetters(stop: Set<KeywordToken>): string {
    let letters = "";
    for (;;) {
      this.skipStrayCommas(stop);
      const t = this.peek();
      if (t && t.kind === "word" && /^[A-Za-z]{1,4}$/.test(t.value)) {
        letters += t.value;
        this.next();
      } else {
        break;
      }
    }
    if (letters === "") throw new ParseError("expected point letters");
    return letters;
  }

  private parseAtom(stop: Set<KeywordToken>): string {
    this.skipStrayCommas(stop);
    const t = this.peek();
    if (!t) throw new ParseError("expected an atom, got end of input");

    if (t.kind === "num") {
      this.next();
      return t.value;
    }
    if (t.kind === "word") {
      // Accept short tokens (variables, point labels, function names — x,
      // AB, sin) as literal atoms; reject longer bare English words
      // ("eight", "thirteen", "cubic") rather than silently splicing them
      // into the output as if they were math. Spelled-out numbers/units
      // that deserve real handling get it elsewhere (SPELLED_FRACTION_RE,
      // the trailing-unit-suffix pass) — anything left is prose, and prose
      // reaching here is a sign this alt text isn't a single clean
      // equation, which should fail loud, not produce wrong-looking LaTeX.
      if (!/^[A-Za-z]{1,3}$/.test(t.value)) {
        throw new ParseError(`unexpected word as atom: ${JSON.stringify(t.value)}`);
      }
      this.next();
      return t.value;
    }
    if (t.kind === "root") {
      this.next();
      const inner = this.parseRootArgument(stop);
      return t.index === "n" ? `\\sqrt[n]{${inner}}` : `\\sqrt[${t.index}]{${inner}}`;
    }
    if (t.kind === "kw") {
      switch (t.value) {
        case "LPAREN": {
          this.next();
          const inner = this.parseRelational(union(freshScope(stop), ["RPAREN"]));
          if (!this.isKw(this.peek(), "RPAREN")) throw new ParseError("unmatched open parenthesis");
          this.next();
          return `\\left(${inner}\\right)`;
        }
        case "SQRT": {
          this.next();
          const inner = this.parseRootArgument(stop);
          return `\\sqrt{${inner}}`;
        }
        case "CBRT": {
          this.next();
          const inner = this.parseRootArgument(stop);
          return `\\sqrt[3]{${inner}}`;
        }
        case "FRAC":
        case "FRAC_NEGATIVE": {
          const negative = t.value === "FRAC_NEGATIVE";
          this.next();
          const numerator = this.parseAdditive(union(freshScope(stop), ["OVER"]));
          if (!this.isKw(this.peek(), "OVER")) throw new ParseError('expected "over" in fraction');
          this.next();
          const denominator = this.parseFractionDenominator(stop);
          return `${negative ? "-" : ""}\\frac{${numerator}}{${denominator}}`;
        }
        case "FRAC_WITH_NUM": {
          this.next();
          const numerator = this.parseAdditive(union(freshScope(stop), ["AND_DENOMINATOR"]));
          if (!this.isKw(this.peek(), "AND_DENOMINATOR")) {
            throw new ParseError('expected "and denominator"');
          }
          this.next();
          const denominator = this.parseFractionDenominator(stop);
          return `\\frac{${numerator}}{${denominator}}`;
        }
        case "ORDERED_PAIR": {
          this.next();
          const a = this.parseAdditive(union(freshScope(stop), ["COMMA"]));
          if (!this.isKw(this.peek(), "COMMA")) throw new ParseError('expected comma in ordered pair');
          this.next();
          const b = this.parseAdditive(stop);
          return `\\left(${a}, ${b}\\right)`;
        }
        case "SET_OF": {
          this.next();
          const items: string[] = [this.parseAdditive(union(freshScope(stop), ["COMMA", "AND"]))];
          for (;;) {
            const nt = this.peek();
            if (nt && nt.kind === "kw" && (nt.value === "COMMA" || nt.value === "AND")) {
              this.next();
              // Oxford-comma style lists ("A, B, and C") carry both a comma
              // AND "and" immediately before the last item — consume both.
              if (this.isKw(this.peek(), "AND")) this.next();
              items.push(this.parseAdditive(union(freshScope(stop), ["COMMA", "AND"])));
            } else {
              break;
            }
          }
          return `\\{${items.join(", ")}\\}`;
        }
        case "LENGTH_OF":
        case "MEASURE_OF":
          // "the length of X" / "the measure of X" denote the same
          // quantity as X itself in this notation (e.g. "the length of
          // side A B" == "AB", "the measure of angle D" == "\angle D") —
          // transparent wrappers.
          this.next();
          return this.parseAtom(stop);
        case "SIN_OF":
        case "COS_OF":
        case "TAN_OF": {
          this.next();
          const fn = t.value === "SIN_OF" ? "\\sin" : t.value === "COS_OF" ? "\\cos" : "\\tan";
          return `${fn}\\left(${this.parseUnary(stop)}\\right)`;
        }
        case "LINE_SEGMENT": {
          this.next();
          return `\\overline{${this.parsePointLetters(stop)}}`;
        }
        case "TRIANGLE": {
          this.next();
          return `\\triangle ${this.parsePointLetters(stop)}`;
        }
        case "ANGLE": {
          this.next();
          return `\\angle ${this.parsePointLetters(stop)}`;
        }
        case "SIDE": {
          this.next();
          return this.parsePointLetters(stop);
        }
        case "DEGREES": {
          // A standalone unit label with nothing preceding it, e.g. an
          // answer choice whose entire content is "degrees Fahrenheit".
          this.next();
          const words: string[] = [];
          while (this.peek()?.kind === "word") words.push((this.next() as { value: string }).value);
          return `\\text{degrees${words.length ? " " + words.join(" ") : ""}}`;
        }
        // A bare sign with nothing before it to operate on — the whole alt
        // text is just the symbol itself (seen on some answer choices whose
        // entire content is "plus", "minus", or "(plus or minus)").
        case "PLUS":
          this.next();
          return "+";
        case "MINUS":
          this.next();
          return "-";
        case "PLUS_MINUS":
          this.next();
          return "\\pm";
        case "PI":
          this.next();
          return "\\pi";
        default:
          throw new ParseError(`unexpected token as atom: ${JSON.stringify(t)}`);
      }
    }
    throw new ParseError(`unexpected token as atom: ${JSON.stringify(t)}`);
  }

  /** A root's argument stops at an explicit "end root" (consumed here) or,
   * failing that, at whatever stops the enclosing context — never guessed
   * past an ambiguous boundary. */
  private parseRootArgument(stop: Set<KeywordToken>): string {
    const inner = this.parseAdditive(union(freshScope(stop), ["END_ROOT"]));
    if (this.isKw(this.peek(), "END_ROOT")) this.next();
    return inner;
  }

  private parseFractionDenominator(stop: Set<KeywordToken>): string {
    const inner = this.parseAdditive(union(freshScope(stop), ["END_FRACTION"]));
    if (this.isKw(this.peek(), "END_FRACTION")) this.next();
    return inner;
  }
}

const RELATION_OPS: Record<string, string> = {
  EQUALS: "=",
  LEQ: "\\leq",
  GEQ: "\\geq",
  LT: "<",
  GT: ">",
  NEQ: "\\neq",
  APPROX: "\\approx",
};

function union(base: Set<KeywordToken>, ...more: (Set<KeywordToken> | KeywordToken[])[]): Set<KeywordToken> {
  const out = new Set(base);
  for (const m of more) for (const k of m) out.add(k);
  return out;
}

// Markers a lower-precedence level adds to its OWN stop set purely so it
// knows when to stop its own loop (PLUS/MINUS for additive; all relation
// operators for the top of the expression grammar). They must not leak into
// a freshly-entered bracketed sub-expression (parens, a fraction's
// numerator/denominator, a root's argument, an exponent, ...) — that
// sub-expression is free to use its own +/-/relations and should only be
// cut short by a genuinely still-pending OUTER closer (RPAREN,
// END_FRACTION, END_ROOT), which this deliberately leaves untouched.
function freshScope(stop: Set<KeywordToken>): Set<KeywordToken> {
  const out = new Set(stop);
  out.delete("PLUS");
  out.delete("MINUS");
  out.delete("PLUS_MINUS");
  for (const r of STOP_ALL_RELATIONS) out.delete(r);
  return out;
}

export interface SpokenMathResult {
  latex: string;
  confidence: "high";
}

/** Parse a College Board spoken-math alt-text string into LaTeX. Throws
 * ParseError (never returns a guess) when the grammar can't account for the
 * whole string unambiguously. */
export function spokenMathToLatex(alt: string): SpokenMathResult {
  const tokens = tokenize(alt);
  if (tokens.length === 0) throw new ParseError("empty input");
  const parser = new Parser(tokens);
  const latex = parser.parseTopLevel();
  return { latex, confidence: "high" };
}
