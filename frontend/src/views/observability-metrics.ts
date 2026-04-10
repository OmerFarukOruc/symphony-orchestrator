export interface PrometheusSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export interface ParsedPrometheusMetrics {
  helps: Record<string, string>;
  types: Record<string, string>;
  samples: PrometheusSample[];
}

export function parsePrometheusText(raw: string): ParsedPrometheusMetrics {
  const helps: Record<string, string> = {};
  const types: Record<string, string> = {};
  const samples: PrometheusSample[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("# HELP ")) {
      const [, name, ...rest] = trimmed.split(" ");
      helps[name] = rest.join(" ");
      continue;
    }
    if (trimmed.startsWith("# TYPE ")) {
      const [, name, type] = trimmed.split(" ");
      types[name] = type;
      continue;
    }
    const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/);
    if (!match) {
      continue;
    }
    const [, name, , rawLabels = "", rawValue] = match;
    samples.push({ name, labels: parseLabels(rawLabels), value: Number(rawValue) });
  }
  return { helps, types, samples };
}

export function sumMetric(
  metrics: ParsedPrometheusMetrics,
  name: string,
  matcher?: Record<string, string>,
): number | null {
  const matching = metrics.samples.filter((sample) => sample.name === name && matchesLabels(sample.labels, matcher));
  if (!matching.length) {
    return null;
  }
  return matching.reduce((total, sample) => total + sample.value, 0);
}

export function meanHistogramMs(metrics: ParsedPrometheusMetrics, baseName: string): number | null {
  const total = sumMetric(metrics, `${baseName}_sum`);
  const count = sumMetric(metrics, `${baseName}_count`);
  if (total === null || count === null || count <= 0) {
    return null;
  }
  return (total / count) * 1000;
}

export function formatLatencyMs(valueMs: number | null): string {
  if (valueMs === null || Number.isNaN(valueMs)) {
    return "—";
  }
  if (valueMs >= 1000) {
    return `${(valueMs / 1000).toFixed(2)}s`;
  }
  if (valueMs >= 10) {
    return `${Math.round(valueMs)}ms`;
  }
  return `${valueMs.toFixed(1)}ms`;
}

function parseLabels(input: string): Record<string, string> {
  if (!input) {
    return {};
  }
  return Object.fromEntries(
    input
      .split(/,(?=[a-zA-Z_]\w*=)/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((pair) => {
        const separator = pair.indexOf("=");
        return [
          pair.slice(0, separator),
          pair
            .slice(separator + 1)
            .trim()
            .replaceAll(/^"|"$/g, ""),
        ];
      }),
  );
}

function matchesLabels(labels: Record<string, string>, matcher?: Record<string, string>): boolean {
  if (!matcher) {
    return true;
  }
  return Object.entries(matcher).every(([key, value]) => labels[key] === value);
}
