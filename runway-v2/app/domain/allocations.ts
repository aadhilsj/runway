import type { AllocationInstruction, DateOnly, MinorUnits } from "./types";

export interface AllocationEvaluation {
  instructionId: string;
  eligible: boolean;
  reason: "eligible" | "inactive" | "outside-window" | "below-floor" | "below-threshold";
}

/** Compatibility check used by the original planning model. */
export function evaluateAllocation(instruction: AllocationInstruction, availableMinor: MinorUnits, asOfDate: DateOnly): AllocationEvaluation {
  if (!instruction.active) return { instructionId: instruction.id, eligible: false, reason: "inactive" };
  if (asOfDate < instruction.startsOn || (instruction.endsOn && asOfDate > instruction.endsOn)) return { instructionId: instruction.id, eligible: false, reason: "outside-window" };
  if (instruction.accountFloorMinor !== undefined && availableMinor < instruction.accountFloorMinor) return { instructionId: instruction.id, eligible: false, reason: "below-floor" };
  if (instruction.triggerThresholdMinor !== undefined && availableMinor < instruction.triggerThresholdMinor) return { instructionId: instruction.id, eligible: false, reason: "below-threshold" };
  return { instructionId: instruction.id, eligible: true, reason: "eligible" };
}

export type AllocationMode = "manual" | "recommended" | "automatic";
export type AllocationDestinationType = "fund" | "account";
export type AllocationStopBasis = "none" | "target" | "preferred" | "cap";
export interface AllocationGoalInput { fundId: string; targetMinor?: number | null; preferredMinor?: number | null; capMinor?: number | null }
export interface AllocationPlanItemInput {
  id: string; label: string; mode: AllocationMode; priority: number; amountMinor: number; active: boolean;
  destinationType: AllocationDestinationType; destinationFundId?: string | null; destinationAccountId?: string | null;
  stopBasis?: AllocationStopBasis; startsOn?: string | null; endsOn?: string | null; activationSourceItemId?: string | null;
}
export interface AllocationEngineInput {
  asOfDate: string; safeAllocatableMinor: number; items: readonly AllocationPlanItemInput[];
  fundBalancesMinor: Readonly<Record<string, number>>; goals: readonly AllocationGoalInput[];
}
export type AllocationReason = "recommended" | "automatic-ready" | "manual-only" | "inactive" | "outside-window" |
  "waiting-for-source-threshold" | "goal-threshold-reached" | "partially-funded" | "operating-floor-protected" | "invalid-destination";
export interface AllocationRecommendation {
  itemId: string; label: string; priority: number; destinationType: AllocationDestinationType; destinationFundId: string | null;
  destinationAccountId: string | null; requestedMinor: number; recommendedMinor: number; reason: AllocationReason;
  explanation: string; executable: boolean;
}
export interface AllocationEngineResult {
  availableAtStartMinor: number; remainingSafeMinor: number; recommendations: AllocationRecommendation[];
  resultingFundBalancesMinor: Record<string, number>;
}

function stopAmount(item: AllocationPlanItemInput, goal: AllocationGoalInput | undefined): number | null {
  if (!goal) return null;
  if (item.stopBasis === "target") return goal.targetMinor ?? null;
  if (item.stopBasis === "preferred") return goal.preferredMinor ?? null;
  if (item.stopBasis === "cap") return goal.capMinor ?? null;
  return null;
}
function skipped(item: AllocationPlanItemInput, reason: AllocationReason, explanation: string): AllocationRecommendation {
  return { itemId: item.id, label: item.label, priority: item.priority, destinationType: item.destinationType,
    destinationFundId: item.destinationFundId ?? null, destinationAccountId: item.destinationAccountId ?? null,
    requestedMinor: item.amountMinor, recommendedMinor: 0, reason, explanation, executable: false };
}

/** Pure, deterministic recommendation. Confirmation is a separate RPC command. */
export function recommendAllocations(input: AllocationEngineInput): AllocationEngineResult {
  let remaining = Math.max(0, Math.trunc(input.safeAllocatableMinor));
  const balances = { ...input.fundBalancesMinor };
  const goals = new Map(input.goals.map((goal) => [goal.fundId, goal]));
  const sourceSatisfied = new Map<string, boolean>();
  const recommendations: AllocationRecommendation[] = [];
  const sorted = [...input.items].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const item of sorted) {
    if (!item.active) { recommendations.push(skipped(item, "inactive", "This plan item is paused.")); continue; }
    if ((item.startsOn && input.asOfDate < item.startsOn) || (item.endsOn && input.asOfDate > item.endsOn)) {
      recommendations.push(skipped(item, "outside-window", "This item is outside its active date range.")); continue;
    }
    if (item.activationSourceItemId && !sourceSatisfied.get(item.activationSourceItemId)) {
      recommendations.push(skipped(item, "waiting-for-source-threshold", "The redirect starts after its source goal reaches the configured threshold.")); continue;
    }
    if (item.mode === "manual") { recommendations.push(skipped(item, "manual-only", "Manual items are never included automatically.")); continue; }
    if (item.amountMinor <= 0 || (item.destinationType === "fund" && !item.destinationFundId) || (item.destinationType === "account" && !item.destinationAccountId)) {
      recommendations.push(skipped(item, "invalid-destination", "A positive amount and valid destination are required.")); continue;
    }
    let requested = Math.trunc(item.amountMinor);
    if (item.destinationType === "fund") {
      const fundId = item.destinationFundId!;
      const threshold = stopAmount(item, goals.get(fundId));
      if (threshold != null) requested = Math.min(requested, Math.max(0, threshold - (balances[fundId] ?? 0)));
      if (requested === 0) { sourceSatisfied.set(item.id, true); recommendations.push(skipped(item, "goal-threshold-reached", "The configured goal threshold is already reached.")); continue; }
    }
    const recommended = Math.min(requested, remaining);
    if (recommended === 0) { sourceSatisfied.set(item.id, false); recommendations.push(skipped(item, "operating-floor-protected", "No safe cash remains after the operating floor and safety window.")); continue; }
    remaining -= recommended;
    if (item.destinationType === "fund") balances[item.destinationFundId!] = (balances[item.destinationFundId!] ?? 0) + recommended;
    sourceSatisfied.set(item.id, recommended === requested);
    const partial = recommended < requested;
    recommendations.push({ itemId: item.id, label: item.label, priority: item.priority, destinationType: item.destinationType,
      destinationFundId: item.destinationFundId ?? null, destinationAccountId: item.destinationAccountId ?? null,
      requestedMinor: item.amountMinor, recommendedMinor: recommended,
      reason: partial ? "partially-funded" : item.mode === "automatic" ? "automatic-ready" : "recommended",
      explanation: partial ? "Partially funded because the remaining cash is protected by the operating floor." :
        item.mode === "automatic" ? "Eligible after the configured trigger and safety checks." : "Ready for review and confirmation.",
      executable: item.destinationType === "fund" });
  }
  return { availableAtStartMinor: Math.max(0, Math.trunc(input.safeAllocatableMinor)), remainingSafeMinor: remaining,
    recommendations, resultingFundBalancesMinor: balances };
}

export interface SafeToSpendInput { dailyOperatingCash: readonly { date: string; balanceMinor: number }[]; allocatedOperatingMinor: number; operatingFloorMinor: number; safetyWindowDays: number }
export function calculateSafeToSpend(input: SafeToSpendInput): number {
  const window = input.dailyOperatingCash.slice(0, Math.max(1, input.safetyWindowDays));
  if (!window.length) return 0;
  const minimumUnallocated = Math.min(...window.map((point) => point.balanceMinor - input.allocatedOperatingMinor));
  return Math.max(0, minimumUnallocated - input.operatingFloorMinor);
}
export function calculateUnallocatedCash(accountBalanceMinor: number, backedFundBalancesMinor: readonly number[]): number {
  return accountBalanceMinor - backedFundBalancesMinor.reduce((sum, value) => sum + value, 0);
}
export function fundBackingIntegrity(accountBalanceMinor: number, backedFundBalancesMinor: readonly number[]) {
  const allocatedMinor = backedFundBalancesMinor.reduce((sum, value) => sum + value, 0);
  const unallocatedMinor = accountBalanceMinor - allocatedMinor;
  return { allocatedMinor, unallocatedMinor, valid: allocatedMinor >= 0 && unallocatedMinor >= 0 };
}
