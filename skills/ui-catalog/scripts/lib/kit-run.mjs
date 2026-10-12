// Kit mode: with the react adapter, `generate` writes atom specs and
// questions.md from the kit model; `check` holds them; `build` lists them.
import fs from 'node:fs';
import path from 'node:path';
import { readText, writeText, sha1 } from './fsutil.mjs';
import { compDir } from './library.mjs';
import { kitModel } from './kit.mjs';
import { readAnswers, writeQuestions, QUESTIONS_FILE } from './questions.mjs';
import { atomSections, newAtomFile, rewriteAtomFile } from './atom-spec.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { runPatternGenerate } from './pattern-run.mjs';

export const isKitMode = (config) => config?.adapter === 'react';

export function kitOf(inventory, outDir) {
  const answers = readAnswers(path.join(outDir, QUESTIONS_FILE));
  return { kit: kitModel(inventory, { answers, kits: kitRefs(outDir) }), answers };
}

// `kit:` of every spec: the kit components the developers built.
export function kitRefs(outDir) {
  const dir = compDir(outDir);
  const out = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch {}
  for (const f of files) {
    const d = parseFrontmatter(readText(path.join(dir, f), '')).data || {};
    if (d.id && d.kit) out.set(String(d.id), String(d.kit));
  }
  return out;
}

// What a seal vouches for: the spec as written and the facts behind it — without the
// `sourceHash:` line, so the first seal holds.
export const atomHash = (text, atom) => sha1(String(text).replace(/^sourceHash:.*(?:\r?\n|$)/m, '') + '\n§\n' + (atom?.factsHash || 'missing'));

export function runKitGenerate(root, outDir, inventory, config, { quiet = false } = {}) {
  const { kit } = kitOf(inventory, outDir);
  const atomsDir = compDir(outDir);
  const written = [], updated = [];
  for (const a of kit.atoms) {
    const file = path.join(atomsDir, `${a.id}.md`);
    const sections = atomSections(a, { root, atomsDir, tokens: inventory.tokens || [] });
    const old = readText(file);
    if (old == null) { writeText(file, newAtomFile(a, sections)); written.push(a.id); continue; }
    const next = rewriteAtomFile(old, sections);
    if (next !== old) { writeText(file, next); updated.push(a.id); }
  }
  const q = writeQuestions(path.join(outDir, QUESTIONS_FILE), config.project, kit.atoms);
  if (!quiet) {
    console.log(`ui-catalog generate (кит): атомов ${kit.atoms.length}; новых спек ${written.length}, переписано из кода ${updated.length}`);
    for (const a of kit.atoms) console.log(`  ${a.id.padEnd(12)} ${a.name.padEnd(14)} реализаций ${a.impls.length}, мест ${a.uses}, вопросов ${a.questions.filter((x) => x.status !== 'answered').length}`);
    console.log(`  вопросы: ${q.total}, открыто ${q.open} — ${path.join(outDir, QUESTIONS_FILE)}`);
    console.log(`  служебных классов (не атомы): ${kit.utilities.length}`);
  }
  // Composites: found in the code, described as it has them.
  const patterns = runPatternGenerate(root, outDir, inventory, config, { quiet });
  return { kit, written, updated, questions: q, patterns };
}

// Specs on disk that the code no longer has an atom for.
export function orphanAtoms(outDir, kit) {
  const dir = compDir(outDir);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch {}
  const ids = new Set(kit.atoms.map((a) => a.id));
  return files.map((f) => path.basename(f, '.md')).filter((id) => !ids.has(id) && parseFrontmatter(readText(path.join(dir, `${id}.md`), '')).data?.id);
}
