import { forecastRepository } from "./forecast-repository";
import { fundsRepository } from "./funds-repository";
import { budgetsRepository } from "./budgets-repository";
import { requireAuthenticatedUserId,requireSupabase } from "./shared";
import type { PlanRow,ScenarioChangeRow } from "./plans-repository";

export const analyticsRepository={async getWorkspace(){const db=requireSupabase(),userId=await requireAuthenticatedUserId(db);const [forecast,funds,budgets,transactions,plans,changes]=await Promise.all([
 forecastRepository.getWorkspace(),fundsRepository.getWorkspace(),budgetsRepository.getWorkspace(),
 db.from("transactions").select("*,transaction_entries(*)").eq("user_id",userId).eq("status","posted").order("occurred_at"),
 db.from("scenarios").select("*").eq("user_id",userId).order("created_at"),db.from("scenario_changes").select("*").eq("user_id",userId).order("sort_order")]);
 for(const result of [transactions,plans,changes])if(result.error)throw result.error;return{forecast,funds,budgets,transactions:transactions.data!,plans:plans.data as PlanRow[],changes:changes.data as ScenarioChangeRow[]};}};
