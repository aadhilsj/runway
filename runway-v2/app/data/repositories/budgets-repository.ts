import { requireAuthenticatedUserId, requireSupabase } from "./shared";
function client(){return requireSupabase();}
export interface BudgetPeriodRow{id:string;month_start:string;currency:string;status:"planned"|"active"|"closed";notes:string|null}
export interface BudgetLineRow{id:string;budget_period_id:string;category_id:string|null;group_id:string|null;budgeted_minor:number;rollover:boolean;notes:string|null}
export const budgetsRepository={
  async getWorkspace(){const db=client();const userId=await requireAuthenticatedUserId(db);const results=await Promise.all([
    db.from("budget_periods").select("*").eq("user_id",userId).order("month_start"),db.from("budget_lines").select("*").eq("user_id",userId),
    db.from("budget_groups").select("*").eq("user_id",userId),db.from("budget_group_categories").select("*").eq("user_id",userId),
    db.from("budget_actuals").select("*").eq("user_id",userId),db.from("budget_commitments").select("*").eq("user_id",userId),
    db.from("categories").select("id,name,kind").eq("user_id",userId).eq("kind","expense").is("archived_at",null),db.from("profiles").select("base_currency").eq("user_id",userId).single()]);
    for(const result of results)if(result.error)throw result.error;return{periods:results[0].data as BudgetPeriodRow[],lines:results[1].data as BudgetLineRow[],groups:results[2].data as Array<{id:string;name:string}>,groupCategories:results[3].data as Array<{group_id:string;category_id:string}>,actuals:results[4].data as Array<{category_id:string;month_start:string;actual_minor:number}>,commitments:results[5].data as Array<{category_id:string;month_start:string;committed_minor:number}>,categories:results[6].data as Array<{id:string;name:string;kind:string}>,currency:(results[7].data as {base_currency:string}).base_currency};
  },
  async createPeriod(monthStart:string,currency:string){const db=client();const userId=await requireAuthenticatedUserId(db);const{error}=await db.from("budget_periods").insert({user_id:userId,month_start:monthStart,currency,status:"planned"});if(error)throw error;},
  async createLine(periodId:string,categoryId:string,budgetedMinor:number){const db=client();const userId=await requireAuthenticatedUserId(db);const{error}=await db.from("budget_lines").insert({user_id:userId,budget_period_id:periodId,category_id:categoryId,budgeted_minor:budgetedMinor});if(error)throw error;},
  async updateLine(id:string,budgetedMinor:number){const db=client();const userId=await requireAuthenticatedUserId(db);const{error}=await db.from("budget_lines").update({budgeted_minor:budgetedMinor}).eq("id",id).eq("user_id",userId);if(error)throw error;},
};
