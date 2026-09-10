// PM CONTROL TOWER — System configuration summary
// GET /api/admin/templates-config — entity counts, feature flags, env presence (booleans only).
// Never returns environment VALUES — only whether variables are set.

import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { withApi, ok, ApiError } from "@/lib/api";
import { fromJson } from "@/lib/constants";

const CONFIG_FILE = "system-config.json";

interface FeatureFlags {
  [flag: string]: boolean | string | number;
}

const DEFAULT_FLAGS: FeatureFlags = {
  aiAssistant: true,
  automationEngine: true,
  realtimeUpdates: true,
  webhookDelivery: true,
  templateApplication: true,
  sandboxMode: true,
};

async function loadStoredConfig(): Promise<{ flags: FeatureFlags; source: string }> {
  // 1) Inline env config (JSON string)  2) db/system-config.json  3) defaults
  const envConfig = process.env.PMCT_CONFIG_JSON;
  if (envConfig) {
    const parsed = fromJson<FeatureFlags>(envConfig, {});
    if (Object.keys(parsed).length > 0) return { flags: { ...DEFAULT_FLAGS, ...parsed }, source: "env:PMCT_CONFIG_JSON" };
  }
  try {
    const raw = await readFile(path.join(process.cwd(), "db", CONFIG_FILE), "utf-8");
    const parsed = fromJson<FeatureFlags>(raw, {});
    if (Object.keys(parsed).length > 0) return { flags: { ...DEFAULT_FLAGS, ...parsed }, source: `db/${CONFIG_FILE}` };
  } catch {
    /* config file absent — defaults apply */
  }
  return { flags: { ...DEFAULT_FLAGS }, source: "defaults" };
}

export const GET = withApi(async () => {
  const {
    user, role, portfolio, program, project, wBSNode, task, milestone, resource, assignment,
    timesheet, budgetLine, risk, issue, changeRequest, stageGate, governanceRule, alertEvent,
    automationRule, template, integration, webhookSubscription, aIConnector, aIExecution, auditEvent,
  } = db;

  const [
    users, roles, portfolios, programs, projects, wbsNodes, tasks, milestones, resources, assignments,
    timesheets, budgetLines, risks, issues, changeRequests, stageGates, governanceRules, alerts,
    automations, templates, integrations, webhooks, aiConnectors, aiExecutions, audits,
  ] = await Promise.all([
    user.count(), role.count(), portfolio.count(), program.count(), project.count(),
    wBSNode.count(), task.count(), milestone.count(), resource.count(), assignment.count(),
    timesheet.count(), budgetLine.count(), risk.count(), issue.count(), changeRequest.count(),
    stageGate.count(), governanceRule.count(), alertEvent.count(),
    automationRule.count(), template.count(), integration.count(),
    webhookSubscription.count(), aIConnector.count(), aIExecution.count(), auditEvent.count(),
  ]);

  const { flags, source } = await loadStoredConfig();

  return ok({
    counts: {
      users, roles, portfolios, programs, projects, wbsNodes, tasks, milestones,
      resources, assignments, timesheets, budgetLines, risks, issues, changeRequests,
      stageGates, governanceRules, alertEvents: alerts, automationRules: automations,
      templates, integrations, webhookSubscriptions: webhooks, aiConnectors, aiExecutions, auditEvents: audits,
    },
    featureFlags: flags,
    featureFlagsSource: source,
    environment: {
      // Presence booleans only — variable values are NEVER exposed
      jwtSecretSet: Boolean(process.env.JWT_SECRET),
      databaseUrlSet: Boolean(process.env.DATABASE_URL),
      webOriginSet: Boolean(process.env.WEB_ORIGIN),
      realtimeUrlSet: Boolean(process.env.REALTIME_URL),
    },
    generatedAt: new Date().toISOString(),
  });
}, { permission: "admin.config", rateLimit: { limit: 120, windowMs: 60_000 } });
