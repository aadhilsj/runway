import type { ForecastItem, Scenario } from "./types";

export function applyActiveScenarios(base: readonly ForecastItem[], scenarios: readonly Scenario[]): ForecastItem[] {
  return [...base, ...scenarios.filter((scenario) => scenario.active).flatMap((scenario) => scenario.items)];
}

// TODO(phase-2): define scenario precedence and collision behavior.
