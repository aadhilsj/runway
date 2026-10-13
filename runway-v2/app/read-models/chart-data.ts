export interface ChartDatum {
  label: string;
  value: number;
}

export function toChartNumber(minorUnits: number): number {
  return minorUnits / 100;
}
