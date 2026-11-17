import type { Sentence, Token } from '../model';

export interface ChunkOptions {
  chunkWords: number;
  chunkChars: number;
}

export interface Chunk {
  tokens: Token[];
  text: string;
  /** The chunk is the last of its sentence. */
  endsSentence: boolean;
  /** The chunk's last token ends in a comma-class mark: , ; : or a dash. */
  endsClause: boolean;
}

const CLAUSE_MARK = /[,;:\-–—]$/u;

export function joinTokens(tokens: Token[]): string {
  return tokens.map((t) => t.text).join(' ');
}

/** Whether `token` is a word ending in a comma-class mark. Atoms never end a clause. */
export function endsClause(token: Token): boolean {
  return token.kind === 'word' && CLAUSE_MARK.test(token.text);
}

/** Split one sentence into display chunks (spec section 3). */
export function chunkSentence(sentence: Sentence, { chunkWords, chunkChars }: ChunkOptions): Chunk[] {
  const groups: Token[][] = [];
  let current: Token[] = [];
  let joinedLength = 0;
  const flush = () => {
    if (current.length > 0) groups.push(current);
    current = [];
    joinedLength = 0;
  };
  const lengthWith = (token: Token) => (current.length === 0 ? 0 : joinedLength + 1) + token.text.length;
  for (const token of sentence.tokens) {
    if (current.length > 0 && (current.length >= chunkWords || lengthWith(token) > chunkChars)) flush();
    joinedLength = lengthWith(token);
    current.push(token);
    if (current.length >= 2 && endsClause(token)) flush();
  }
  flush();
  return groups.map((tokens, i) => ({
    tokens,
    text: joinTokens(tokens),
    endsSentence: i === groups.length - 1,
    endsClause: endsClause(tokens[tokens.length - 1]),
  }));
}
