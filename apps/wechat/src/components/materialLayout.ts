export function calculateBarWidths(items: Array<{ value: number }>): number[] {
  const values = items.map((item) => Math.max(0, item.value));
  const maximum = Math.max(0, ...values);
  return maximum === 0 ? values.map(() => 0) : values.map((value) => (value / maximum) * 100);
}

export function getTableMinWidth(columnCount: number): number {
  return Math.max(320, columnCount * 120);
}
