import {describe,expect,it} from "vitest";
import {aggregateCategorySpend,aggregateMonthlyCashFlow,currentFinancialPosition,deriveNetWorthSeries,type AnalyticsAccount,type AnalyticsTransaction} from "~/domain/analytics";
const accounts:AnalyticsAccount[]=[
 {id:"cash",name:"Cash",class:"asset",subtype:"checking",liquidityClass:"operating",includeInNetWorth:true,isSystem:false},
 {id:"invest",name:"Investments",class:"asset",subtype:"investment",liquidityClass:"invested",includeInNetWorth:true,isSystem:false},
 {id:"debt",name:"Card",class:"liability",subtype:"credit_card",liquidityClass:"liability",includeInNetWorth:true,isSystem:false},
 {id:"income",name:"Income",class:"income",subtype:"cash",liquidityClass:"non_liquid",includeInNetWorth:false,isSystem:true},
 {id:"expense",name:"Expense",class:"expense",subtype:"cash",liquidityClass:"non_liquid",includeInNetWorth:false,isSystem:true},
 {id:"equity",name:"Equity",class:"equity",subtype:"cash",liquidityClass:"non_liquid",includeInNetWorth:false,isSystem:true},
];
const tx=(id:string,kind:string,date:string,entries:Array<[string,number,string?]>,reverses:string|null=null):AnalyticsTransaction=>({id,kind,status:"posted",occurredAt:`${date}T12:00:00Z`,description:id,reversesTransactionId:reverses,entries:entries.map(([accountId,amountMinor,categoryId])=>({accountId,amountMinor,categoryId:categoryId??null}))});
const rows=[tx("open","opening_balance","2026-08-19",[["cash",100_000],["equity",-100_000]]),tx("salary","income","2026-09-01",[["cash",30_000],["income",-30_000,"salary"]]),tx("food","expense","2026-09-02",[["cash",-8_000],["expense",8_000,"food"]]),tx("transfer","transfer","2026-09-03",[["cash",-10_000],["invest",10_000]]),tx("refund","refund","2026-09-04",[["cash",2_000],["expense",-2_000,"food"]])];
describe("Phase 8 authoritative analytics",()=>{
 it("calculates income minus expenses and excludes transfers/opening",()=>expect(aggregateMonthlyCashFlow(rows,accounts,"UTC").at(-1)).toEqual({month:"2026-09",incomeMinor:30_000,expenseMinor:6_000,netMinor:24_000}));
 it("treats investment contributions as transfers, not spending",()=>expect(aggregateMonthlyCashFlow(rows,accounts,"UTC").at(-1)!.expenseMinor).toBe(6_000));
 it("reduces category spending for refunds",()=>expect(aggregateCategorySpend(rows,accounts,new Map([["food","Food"]]),"UTC","2026-09")[0]!.amountMinor).toBe(6_000));
 it("aggregates expense categories and shares",()=>expect(aggregateCategorySpend(rows,accounts,new Map([["food","Food"]]),"UTC","2026-09")[0]).toMatchObject({label:"Food",share:1}));
 it("keeps transfers net-worth neutral",()=>{const series=deriveNetWorthSeries(rows,accounts,"UTC");expect(series.find(row=>row.date==="2026-09-03")!.netWorthMinor).toBe(122_000)});
 it("corrects history when a reversal posts",()=>{const reversal=tx("reverse-food","expense","2026-09-05",[["cash",8_000],["expense",-8_000,"food"]],"food");expect(deriveNetWorthSeries([...rows,reversal],accounts,"UTC").at(-1)!.netWorthMinor).toBe(132_000)});
 it("starts authoritative net worth at cutover rather than fabricating earlier dates",()=>expect(deriveNetWorthSeries(rows,accounts,"UTC")[0]).toMatchObject({date:"2026-08-19",authoritative:true}));
 it("counts Fund allocation nowhere because it is not a ledger transaction",()=>expect(aggregateMonthlyCashFlow(rows,accounts,"UTC")).toHaveLength(2));
 it("derives cash, allocated, unallocated and book-value investments once",()=>expect(currentFinancialPosition(accounts,new Map([["cash",114_000],["invest",10_000],["debt",0]]),20_000)).toEqual({totalCashMinor:114_000,allocatedCashMinor:20_000,unallocatedCashMinor:94_000,investmentBookValueMinor:10_000,totalAssetsMinor:124_000,totalLiabilitiesMinor:0,netWorthMinor:124_000}));
 it("subtracts displayed liabilities from net worth",()=>expect(currentFinancialPosition(accounts,new Map([["cash",100_000],["invest",0],["debt",25_000]]),0).netWorthMinor).toBe(75_000));
 it("treats a reimbursable share as an asset without inflating income or spending",()=>{
  const reimbursementAccounts:AnalyticsAccount[]=[...accounts,{id:"receivable",name:"Splitwise receivable",class:"asset",subtype:"cash",liquidityClass:"non_liquid",includeInNetWorth:true,isSystem:false}];
  const split=tx("split-groceries","expense","2026-09-06",[["cash",-30_000],["receivable",6_000],["expense",24_000,"food"]]);
  const repayment=tx("splitwise-repayment","reimbursement","2026-09-07",[["receivable",-3_000],["cash",3_000]]);
  const flow=aggregateMonthlyCashFlow([...rows,split,repayment],reimbursementAccounts,"UTC").at(-1)!;
  expect(flow).toEqual({month:"2026-09",incomeMinor:30_000,expenseMinor:30_000,netMinor:0});
  expect(aggregateCategorySpend([...rows,split,repayment],reimbursementAccounts,new Map([["food","Food"]]),"UTC","2026-09")[0]!.amountMinor).toBe(30_000);
  expect(currentFinancialPosition(reimbursementAccounts,new Map([["cash",87_000],["receivable",3_000],["invest",10_000],["debt",0]]),0)).toMatchObject({totalCashMinor:87_000,totalAssetsMinor:100_000,netWorthMinor:100_000});
 });
});
