# Allocation modes

Every allocation instruction names its mode and safeguard inputs. Mode changes authority, not arithmetic.

- `manual`: Runway calculates eligibility or context, but the user initiates and confirms every movement.
- `recommended`: Runway may rank or propose allocations. Nothing moves until the user accepts a specific recommendation.
- `automatic`: A previously authorized active rule may create an allocation when its schedule and safeguards pass. Automatic mode requires explicit auditability and a future server-side execution design.

Instructions can define an amount or basis-point percentage, frequency, priority, active state, account floor, trigger threshold, redirect fund, and start/end dates. A floor protects the source account. A threshold prevents execution below an eligibility amount. A redirect identifies the next destination when a future cap/exhaustion rule applies.

Phase 1 validates the contract and basic eligibility only. It does not execute transfers, infer a preferred allocation, or pretend that automatic authorization exists.
