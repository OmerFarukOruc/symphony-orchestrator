export function buildSecrets(keys: string[] = ["LINEAR_API_KEY", "OPENAI_API_KEY", "GITHUB_TOKEN"]): {
  keys: string[];
} {
  return { keys };
}
