export interface TranslationItem {
  id: string;
  path: string[];
  text: string;
  protectedTokens: string[];
}
export interface TranslationRequest {
  sourceLanguage: string;
  targetLanguage: string;
  items: TranslationItem[];
}
export interface TranslationResult {
  items: (
    | { id: string; text: string; model?: string }
    | { id: string; error: "machineInvalidResult" }
  )[];
  billedCharacters?: number;
}
export interface TranslationProvider {
  readonly id: string;
  readonly displayName: string;
  readonly configured: boolean;
  supports(sourceLanguage: string, targetLanguage: string): boolean;
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
export const sourceCharacters = (text: string) => Array.from(text).length;
