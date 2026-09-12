// PM CONTROL TOWER — Evidence Bundle Engine (pure)
// Tamper-evident export: SHA-256 hash chain across every document
// (each doc's hash includes the previous doc's hash). Altering any
// stored record breaks the chain visibly at the altered document.

import { createHash } from "crypto";

export interface EvidenceDoc { ref: string; kind: string; content: string }
export interface EvidenceManifestEntry { index: number; ref: string; kind: string; hash: string; prevHash: string }
export interface EvidenceManifest { entries: EvidenceManifestEntry[]; manifestHash: string; algorithm: "sha256-chain" }

export function hashDocument(prevHash: string, doc: EvidenceDoc): string {
  return createHash("sha256").update(`${prevHash}|${doc.kind}|${doc.ref}|${doc.content}`).digest("hex");
}

export function buildChain(docs: EvidenceDoc[]): EvidenceManifest {
  const entries: EvidenceManifestEntry[] = [];
  let prev = "GENESIS";
  docs.forEach((d, i) => {
    const hash = hashDocument(prev, d);
    entries.push({ index: i, ref: d.ref, kind: d.kind, hash, prevHash: prev });
    prev = hash;
  });
  const manifestHash = createHash("sha256").update(entries.map((e) => e.hash).join("")).digest("hex");
  return { entries, manifestHash, algorithm: "sha256-chain" };
}

export interface VerifyResult { pass: boolean; firstBrokenRef: string | null; checkedCount: number }

/** Re-derive the chain from CURRENT records and compare against the stored manifest. */
export function verifyChain(docs: EvidenceDoc[], manifest: EvidenceManifest): VerifyResult {
  const rebuilt = buildChain(docs);
  if (rebuilt.manifestHash === manifest.manifestHash && rebuilt.entries.length === manifest.entries.length) {
    return { pass: true, firstBrokenRef: null, checkedCount: docs.length };
  }
  const byRef = new Map(rebuilt.entries.map((e) => [e.ref, e]));
  for (const stored of manifest.entries) {
    const live = byRef.get(stored.ref);
    if (!live) return { pass: false, firstBrokenRef: stored.ref, checkedCount: docs.length };
    const expected = hashDocument(stored.prevHash, { ref: stored.ref, kind: stored.kind, content: docs.find((d) => d.ref === stored.ref)?.content ?? "" });
    if (live.hash !== stored.hash || expected !== stored.hash) {
      return { pass: false, firstBrokenRef: stored.ref, checkedCount: docs.length };
    }
  }
  return { pass: false, firstBrokenRef: "MANIFEST", checkedCount: docs.length };
}
