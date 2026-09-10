// PM CONTROL TOWER — Project detail bundle types (mirrors GET /api/projects/[id])

export interface ProjectCore {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  phase: string;
  methodology: string;
  riskLevel: string;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  baselineStart: string | null;
  baselineFinish: string | null;
  baselineBudget: number;
  currentBudget: number;
  actualCost: number;
  forecastCost: number;
  plannedHours: number;
  actualHours: number;
  progress: number;
  healthScore: number;
  ragStatus: string;
  charter: string | null;
  objectives: string | null;
  successCriteria: string | null;
  statusDate: string | null;
}
export interface ProjectDetailBundle {
  project: ProjectCore;
  program: { id: string; code: string; name: string } | null;
  portfolio: { id: string; code: string; name: string } | null;
  owner: { id: string; name: string } | null;
  counts: {
    risks: number; issues: number; changeRequests: number; alertEvents: number;
    assumptions: number; deliverables: number;
  };
  latestEvmPeriod: {
    cpi: number; spi: number; eac: number; vac: number; tcpi: number;
    bac: number; pv: number; ev: number; ac: number; etc: number;
    costVariance: number; scheduleVariance: number; percentComplete: number;
    statusDate: string; source: string;
  } | null;
  healthSnapshots: {
    id: string; capturedAt: string; healthScore: number; ragStatus: string;
    cpi: number; spi: number; eac: number; openRisks: number; openIssues: number;
    overdueMilestones: number; triggeredBy: string; notes: string | null;
  }[];
  stageGates: { id: string; code: string; name: string; decisionStatus: string; plannedDate: string | null }[];
  milestones: { id: string; code: string; name: string; dueDate: string | null; status: string; isCritical: boolean }[];
  baselines: { id: string; version: number; name: string; status: string }[];
  wbsTree: { id: string; code: string; name: string; nodeType: string; children: unknown[] }[];
  tasks: { id: string; code: string; name: string; status: string; isCritical: boolean; progress: number }[];
  requirements: { id: string; reqCode: string; title: string; status: string }[];
}
