import { requireAuthenticatedUserId, requireSupabase, rpcNullable } from "./shared";

export interface FundRow { id:string; user_id:string; backing_account_id:string; name:string; purpose_key:string|null; currency:string; color:string|null; icon:string|null; sort_order:number; active:boolean }
export interface FundBalanceRow { fund_id:string; backing_account_id:string; balance_minor:number; currency:string }
export interface GoalRow { id:string; fund_id:string; name:string; target_minor:number|null; preferred_balance_minor:number|null; cap_minor:number|null; preferred_contribution_minor:number|null; floor_minor:number|null; target_date:string|null; status:string; is_primary:boolean }
export interface AllocationPlanRow { id:string; name:string; trigger_kind:string; source_account_id:string; active:boolean; is_default:boolean }
export interface AllocationPlanItemRow { id:string; plan_id:string; label:string; destination_type:"fund"|"account"; destination_fund_id:string|null; destination_account_id:string|null; amount_minor:number; mode:"manual"|"recommended"|"automatic"; priority:number; stop_basis:"none"|"target"|"preferred"|"cap"; activation_source_item_id:string|null; active:boolean; starts_on:string|null; ends_on:string|null }
export interface MovementRow { id:string; fund_id:string; kind:string; amount_minor:number; occurred_at:string; description:string; transaction_id:string|null }
export interface BackingRow { account_id:string; account_name:string; account_balance_minor:number; allocated_minor:number; unallocated_minor:number; backing_valid:boolean }

function client() { return requireSupabase(); }
export const fundsRepository = {
  async getWorkspace() {
    const db=client(); const userId=await requireAuthenticatedUserId(db);
    const results=await Promise.all([
      db.from("funds").select("*").eq("user_id",userId).order("sort_order"), db.from("fund_balances").select("*").eq("user_id",userId),
      db.from("goals").select("*").eq("user_id",userId), db.from("fund_movements").select("*").eq("user_id",userId).order("occurred_at",{ascending:false}).limit(200),
      db.from("allocation_plans").select("*").eq("user_id",userId).order("created_at"), db.from("allocation_plan_items").select("*").eq("user_id",userId).order("priority"),
      db.from("fund_backing_summary").select("*").eq("user_id",userId), db.from("profiles").select("*").eq("user_id",userId).single(),
      db.from("accounts").select("id,name,currency,liquidity_class,subtype,is_system").eq("user_id",userId).is("archived_at",null),
    ]);
    for(const result of results) if(result.error) throw result.error;
    return { funds:results[0].data as FundRow[], balances:results[1].data as FundBalanceRow[], goals:results[2].data as GoalRow[],
      movements:results[3].data as MovementRow[], plans:results[4].data as AllocationPlanRow[], items:results[5].data as AllocationPlanItemRow[],
      backing:results[6].data as BackingRow[], profile:results[7].data as {base_currency:string;operating_floor_minor:number|null;safety_window_days:number|null},
      accounts:results[8].data as Array<{id:string;name:string;currency:string;liquidity_class:string;subtype:string;is_system:boolean}> };
  },
  async updateFund(id:string,values:Partial<Pick<FundRow,"name"|"color"|"icon"|"sort_order"|"active">>) { const db=client(); const userId=await requireAuthenticatedUserId(db); const {error}=await db.from("funds").update(values).eq("id",id).eq("user_id",userId); if(error) throw error; },
  async updateGoal(id:string,values:Partial<Pick<GoalRow,"name"|"target_minor"|"preferred_balance_minor"|"cap_minor"|"preferred_contribution_minor"|"floor_minor"|"target_date"|"status">>) { const db=client(); const userId=await requireAuthenticatedUserId(db); const {error}=await db.from("goals").update(values).eq("id",id).eq("user_id",userId); if(error) throw error; },
  async updatePlanItem(id:string,values:Partial<Pick<AllocationPlanItemRow,"amount_minor"|"mode"|"priority"|"active"|"stop_basis">>) { const db=client(); const userId=await requireAuthenticatedUserId(db); const {error}=await db.from("allocation_plan_items").update(values).eq("id",id).eq("user_id",userId); if(error) throw error; },
  async allocate(fundId:string,amountMinor:number,description:string,idempotencyKey:string) { const {data,error}=await client().rpc("allocate_to_fund",{p_fund_id:fundId,p_amount_minor:amountMinor,p_occurred_at:new Date().toISOString(),p_description:description,p_idempotency_key:idempotencyKey}); if(error) throw error; return data as string; },
  async release(fundId:string,amountMinor:number,description:string,idempotencyKey:string) { const {data,error}=await client().rpc("release_from_fund",{p_fund_id:fundId,p_amount_minor:amountMinor,p_occurred_at:new Date().toISOString(),p_description:description,p_idempotency_key:idempotencyKey}); if(error) throw error; return data as string; },
  async transfer(sourceFundId:string,destinationFundId:string,amountMinor:number,description:string,idempotencyKey:string) { const {data,error}=await client().rpc("transfer_between_funds",{p_source_fund_id:sourceFundId,p_destination_fund_id:destinationFundId,p_amount_minor:amountMinor,p_occurred_at:new Date().toISOString(),p_description:description,p_idempotency_key:idempotencyKey}); if(error) throw error; return data; },
  async executePayday(planId:string,triggerTransactionId:string|null,items:Array<{plan_item_id:string;recommended_minor:number;approved_minor:number}>,idempotencyKey:string) { const {data,error}=await client().rpc("execute_payday_allocation",{p_plan_id:planId,p_trigger_transaction_id:rpcNullable(triggerTransactionId),p_items:items,p_idempotency_key:idempotencyKey}); if(error) throw error; return data as string; },
  async updateSafety(operatingFloorMinor:number,safetyWindowDays:number) { const db=client(); const userId=await requireAuthenticatedUserId(db); const {error}=await db.from("profiles").update({operating_floor_minor:operatingFloorMinor,safety_window_days:safetyWindowDays}).eq("user_id",userId); if(error) throw error; },
};
