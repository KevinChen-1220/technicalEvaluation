export function getLoadingDotDelay(index: 0 | 1 | 2): number {
  return index * 140;
}

export function shouldDimButton(disabled: boolean, loading: boolean): boolean {
  return disabled && !loading;
}
