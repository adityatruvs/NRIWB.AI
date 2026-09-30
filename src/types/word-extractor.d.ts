/** word-extractor ships no types — this covers the one method this repo calls. */
declare module 'word-extractor' {
  export default class WordExtractor {
    extract(input: string | Buffer): Promise<{ getBody(): string }>
  }
}
