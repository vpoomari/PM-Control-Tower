const fs = require("fs");
const p = "prisma/schema.prisma";
let s = fs.readFileSync(p, "utf8");

// 1) Project relations
const projAnchor = "  plannerEntries   PlannerEntry[]\n}";
if (!s.includes("freshnessMetrics")) {
  s = s.replace(projAnchor,
`  plannerEntries   PlannerEntry[]
  freshnessMetrics FreshnessMetric[]
  evidenceBundles  EvidenceBundle[]
  simulationRuns   SimulationRun[]
  scenarios        Scenario[]
  aiActions        AiAction[]
  benefitProfiles  BenefitProfile[]
}`);
}

// 2) Task estimate relation
if (!s.includes("estimate         TaskEstimate?")) {
  s = s.replace('  predecessors Dependency[] @relation("DependencySuccessor")',
`  estimate     TaskEstimate?
  predecessors Dependency[] @relation("DependencySuccessor")`);
}

// 3) New models
if (!s.includes("model FreshnessMetric")) {
  s += `
// ============ INTEGRITY LAYER ============
// Freshness (honest staleness), Evidence (tamper-evident bundles), Monte Carlo
// (seeded probabilistic forecasting), Calibration (say/do memory), Scenarios
// (branch & merge sandbox), AI actions (draft-only, human-approved), Benefits.

model FreshnessMetric {
  id                  String   @id @default(cuid())
  projectId           String
  feed                String   // timesheets | ledger | tasks | raid | gates
  lastUpdate          DateTime
  expectedCadenceDays Int      @default(7)
  updatedAt           DateTime @updatedAt

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, feed])
  @@index([projectId])
}

model EvidenceBundle {
  id            String    @id @default(cuid())
  projectId     String
  createdBy     String
  createdByName String
  docCount      Int
  manifestHash  String
  status        String    @default("VALID") // VALID | TAMPERED
  verifiedAt    DateTime?
  manifestJson  String
  createdAt     DateTime  @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
}

model TaskEstimate {
  taskId       String   @id
  optimistic   Float
  likely       Float
  pessimistic  Float
  distribution String   @default("PERT") // PERT | TRIANGULAR
  updatedAt    DateTime @updatedAt

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
}

model SimulationRun {
  id          String   @id @default(cuid())
  projectId   String
  seed        Int
  iterations  Int
  stale       Boolean  @default(false)
  resultsJson String
  createdAt   DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
}

model CalibrationFactor {
  id         String   @id @default(cuid())
  scopeType  String   // team | workType | project
  scopeId    String
  label      String
  factor     Float
  sampleSize Int
  mad        Float
  computedAt DateTime @default(now()) @updatedAt

  @@unique([scopeType, scopeId])
  @@index([scopeType])
}

model Scenario {
  id              String    @id @default(cuid())
  name            String
  projectId       String
  status          String    @default("SANDBOX") // SANDBOX | MERGED | DISCARDED
  createdBy       String
  createdByName   String
  snapshotJson    String
  overridesJson   String    @default("{}")
  diffJson        String?
  changeRequestId String?
  createdAt       DateTime  @default(now())
  mergedAt        DateTime?

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
}

model AiAction {
  id            String    @id @default(cuid())
  type          String    // STEERING_PACK | REPLAN_PROPOSAL
  projectId     String?
  title         String
  contentJson   String
  status        String    @default("DRAFTED") // DRAFTED | EDITED | APPROVED | REJECTED
  trigger       String?
  humanReviewer String?
  decidedAt     DateTime?
  createdAt     DateTime  @default(now())

  project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@index([projectId, type])
}

model BenefitProfile {
  id                String    @id @default(cuid())
  projectId         String
  name              String
  type              String    // REVENUE | COST_SAVING | CAPACITY | KPI
  baselineValue     Float
  targetValue       Float
  timeframeMonths   Int
  owner             String
  reviewCadenceDays Int       @default(30)
  active            Boolean   @default(false)
  activatedAt       DateTime?
  createdAt         DateTime  @default(now())

  project  Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  actuals  BenefitActual[]
  reviews  BenefitReview[]

  @@index([projectId])
}

model BenefitActual {
  id        String   @id @default(cuid())
  profileId String
  period    DateTime
  value     Float
  source    String?
  createdAt DateTime @default(now())

  profile BenefitProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@unique([profileId, period])
}

model BenefitReview {
  id         String   @id @default(cuid())
  profileId  String
  date       DateTime
  status     String   @default("ON_TRACK") // ON_TRACK | AT_RISK | MISSED
  commentary String?
  createdAt  DateTime @default(now())

  profile BenefitProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId])
}
`;
}
fs.writeFileSync(p, s);
console.log("schema updated:", s.includes("model BenefitReview"), s.includes("freshnessMetrics"), s.includes("estimate         TaskEstimate?"));
