/** AI edit proposals (isomorphic): diff entries against the base version + applying accepted entries. */
import type { ThemeManifest, ThemePackage } from "@/modules/theme-engine/types";
import { MANIFEST_PATH, sortPaths } from "./package";

export type Proposal = {
  baseVersionId: string;
  summary: string;
  changedFiles: Record<string, string>;
  deletedFiles: string[];
  manifest?: ThemeManifest;
};

export type ProposalEntry = { path: string; kind: "added" | "changed" | "deleted"; original: string; modified: string };

export function proposalEntries(base: ThemePackage, p: Proposal): ProposalEntry[] {
  const out: ProposalEntry[] = [];
  if (p.manifest) {
    const a = JSON.stringify(base.manifest, null, 2);
    const b = JSON.stringify(p.manifest, null, 2);
    if (a !== b) out.push({ path: MANIFEST_PATH, kind: "changed", original: a, modified: b });
  }
  for (const path of sortPaths(Object.keys(p.changedFiles))) {
    const original = base.files[path];
    if (original === p.changedFiles[path]) continue;
    out.push({ path, kind: original === undefined ? "added" : "changed", original: original ?? "", modified: p.changedFiles[path] });
  }
  for (const path of p.deletedFiles) if (base.files[path] !== undefined) out.push({ path, kind: "deleted", original: base.files[path], modified: "" });
  return out;
}

/** Applies the accepted entries of a proposal on top of the base package. */
export function applyProposal(base: ThemePackage, p: Proposal, accepted: Set<string>): ThemePackage {
  const files = { ...base.files };
  let manifest = base.manifest;
  for (const e of proposalEntries(base, p)) {
    if (!accepted.has(e.path)) continue;
    if (e.path === MANIFEST_PATH && p.manifest) manifest = p.manifest;
    else if (e.kind === "deleted") delete files[e.path];
    else files[e.path] = e.modified;
  }
  return { manifest, files };
}
