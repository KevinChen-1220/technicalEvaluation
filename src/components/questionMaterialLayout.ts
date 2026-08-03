export function getImageAspectRatio(aspectRatio?: number): number {
  return aspectRatio ?? 16 / 9;
}

export function getBarFillPercent(value: number, maximum: number): `${number}%` {
  if (maximum <= 0) return '0%';

  const percentage = Math.min(100, Math.max(0, (value / maximum) * 100));
  const rounded = Math.round(percentage * 100) / 100;
  return `${rounded}%`;
}
