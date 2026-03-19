export function buildSparklinePath(values: number[]): string {
  if (values.length <= 1) {
    return "M 2 24 L 98 24";
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 96 + 2;
      const y = 24 - ((value - min) / span) * 20;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}
