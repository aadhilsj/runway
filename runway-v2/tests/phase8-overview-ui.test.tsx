import {cleanup,render,screen} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {MemoryRouter} from "react-router";
import {beforeEach,describe,expect,it,vi} from "vitest";
import OverviewRoute from "~/routes/overview";
import AnalyticsRoute from "~/routes/analytics";
const overview={currency:"NOK",safeToSpendMinor:295600,operatingFloorMinor:900000,safetyWindowDays:30,nextReliableIncome:null,position:{totalCashMinor:1195600,allocatedCashMinor:0,unallocatedCashMinor:1195600,netWorthMinor:1195600,investmentBookValueMinor:0},forecast:{endDate:"2027-08-19",endingOperatingCashMinor:2000000,lowest:{date:"2026-09-01",balanceMinor:1000000},firstBreach:null,incomeMinor:0,expenseMinor:0,chart:[]},funds:[{id:"f",name:"Emergency",balanceMinor:0,targetMinor:4500000,progress:0,projectedBalanceMinor:0,projectedCompletion:null,contributionMode:"recommended",nextContributionMinor:500000}],currentFlow:{month:"2026-08",incomeMinor:0,expenseMinor:0,netMinor:0},currentBudget:{month:"2026-10",totals:{budgetedMinor:1653800,actualMinor:0,committedMinor:0,remainingMinor:1653800,uncommittedMinor:1653800},rows:[]},upcoming:[],overdue:[],recent:[],selectedPlanIds:[],planAlternative:null};
const analytics={currency:"NOK",timeZone:"Europe/Oslo",currentMonth:"2026-08",cashFlow:[],spending:[],netWorth:[{date:"2026-08-19",netWorthMinor:1195600,cashMinor:1195600,authoritative:true}],budgetPeriods:[],cutoverDate:"2026-08-19"};
vi.mock("~/data/repositories/analytics-repository",()=>({analyticsRepository:{getWorkspace:vi.fn(async()=>({}))}}));
vi.mock("~/read-models/overview",()=>({buildOverviewReadModel:vi.fn(()=>overview),buildAnalyticsReadModel:vi.fn(()=>analytics)}));
function show(node:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>)}
describe("Phase 8 cockpit UI",()=>{beforeEach(()=>{cleanup();vi.clearAllMocks()});
 it("renders the canonical headline metrics and safe-to-spend explanation",async()=>{show(<OverviewRoute/>);expect(await screen.findByText("Safe to spend")).toBeVisible();expect(screen.getByText("Total cash")).toBeVisible();expect(screen.getByText(/30-day safety window/)).toBeVisible()});
 it("renders Fund, budget, forecast and early-history states",async()=>{show(<OverviewRoute/>);expect(await screen.findByText("Emergency")).toBeVisible();expect(screen.getByText("Budgeted")).toBeVisible();expect(screen.getByText("No operating-floor breach projected")).toBeVisible();expect(screen.getByText(/No posted income or spending/)).toBeVisible()});
 it("renders analytics with a labeled authoritative cutover boundary",async()=>{show(<AnalyticsRoute/>);expect(await screen.findByText(/Authoritative history begins 2026-08-19/)).toBeVisible();expect(screen.getByText(/No pre-cutover values/)).toBeVisible()});
});
