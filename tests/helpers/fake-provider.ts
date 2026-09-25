import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
} from "../../src/domain/translation";
export class FakeTranslationProvider implements TranslationProvider {
  readonly id = "fake";
  readonly displayName = "Test translator";
  configured = true;
  calls: TranslationRequest[] = [];
  supports(source: string, target: string) {
    return source.startsWith("en") && ["fr", "ar", "de"].includes(target);
  }
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    this.calls.push(structuredClone(request));
    return {
      items: request.items.map((item) => ({
        id: item.id,
        text: `Translated: ${item.text}`,
      })),
    };
  }
}
