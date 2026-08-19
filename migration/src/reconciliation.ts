export interface ReconciliationInput {
  legacyCurrentBalanceMinor: number;
  proposedOpeningBalanceMinor: number;
  warningThresholdLegacyMinor: number;
  warningThresholdProposedMinor: number;
}

export function reconcileOpeningBalance(input: ReconciliationInput) {
  const differenceMinor = input.proposedOpeningBalanceMinor - input.legacyCurrentBalanceMinor;
  return {
    ...input,
    differenceMinor,
    historicalReferenceLedgerEffectMinor: 0 as const,
    forecastLedgerEffectMinor: 0 as const,
    openingBalanceLedgerEffectMinor: input.proposedOpeningBalanceMinor,
    noDoubleCountingPassed: differenceMinor === 0,
  };
}
