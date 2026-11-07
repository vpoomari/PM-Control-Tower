// PM CONTROL TOWER — Field dictionary loader: import a Form Tab Builder field document
// (same shape POST /api/tabs/import accepts) into CustomFieldDefinition.
//
// CREATE-ONLY by design: existing field keys are reported and left untouched so this
// can never clobber live configuration. Run after generating the document from the
// Jira field catalogue workbook:
//   python scripts/xlsx-to-field-catalogue.py examples/Jira_Enterprise_PMO_Field_Catalogue.xlsx
//   npx tsx scripts/seed-field-catalogue.ts [examples/jira-field-catalogue.import.json]

import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { normalizeFieldConfig, normalizeOptions } from "../src/lib/engines/custom-fields";

interface FieldDoc {
  fieldKey: string;
  label: string;
  dataType: string;
  options?: string[] | null;
  config?: Record<string, unknown> | null;
  description?: string | null;
  isActive?: boolean;
}

async function main() {
  const path = process.argv[2] ?? "examples/jira-field-catalogue.import.json";
  const doc = JSON.parse(readFileSync(path, "utf-8")) as { fields?: FieldDoc[] };
  const fields = doc.fields ?? [];
  if (!fields.length) {
    console.error(`No fields in ${path} — nothing to do.`);
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;
  const skippedKeys: string[] = [];

  for (const f of fields) {
    const existing = await db.customFieldDefinition.findUnique({ where: { fieldKey: f.fieldKey } });
    if (existing) {
      skipped += 1;
      skippedKeys.push(f.fieldKey);
      continue;
    }
    const isChoice = f.dataType === "DROPDOWN" || f.dataType === "MULTI_SELECT";
    await db.customFieldDefinition.create({
      data: {
        fieldKey: f.fieldKey,
        label: f.label,
        dataType: f.dataType,
        options: isChoice ? (normalizeOptions(f.options) as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        config: f.config ? (normalizeFieldConfig(f.config) as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        description: f.description ?? null,
        isActive: f.isActive ?? true,
      },
    });
    created += 1;
  }

  const total = await db.customFieldDefinition.count();
  console.log(`◈ Field catalogue load — ${created} created, ${skipped} skipped (already existed)`);
  if (skippedKeys.length) console.log(`  skipped keys: ${skippedKeys.join(", ")}`);
  console.log(`  dictionary now holds ${total} field definition(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
