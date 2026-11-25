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
import { spaceQuestions } from './spacing.mjs';

export const isKitMode = (config) => config?.adapter === 'react';

export function kitOf(inventory, outDir, config = {}) {
  const answers = readAnswers(path.join(outDir, QUESTIONS_FILE));
  return { kit: kitModel(inventory, { answers, kits: kitRefs(outDir), families: config.families || [] }), answers };
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

// What the agent assumed where the person running the skill did not know (context.assumed):
// questions to the team, first in the product part of questions.md.
export const introId = (question) => `intro.${sha1(String(question)).slice(0, 8)}`;
export function introQuestions(config, answers) {
  const list = [].concat(config.context?.assumed || []).filter((x) => x && x.question);
  if (!list.length) return null;
  const questions = list.map((x) => {
    const id = introId(x.question);
    const ans = answers.get(id);
    const answered = !!ans?.answer;
    return {
      id, kind: 'intro', audience: 'product', title: x.question, human: x.question, wordsGiven: true,
      recommend: 'верно', why: `агент взял: ${x.assumed}`, options: ['верно', 'неверно — напишите, как правильно'],
      facts: [`взято: ${x.assumed}`], factsHash: sha1(String(x.assumed)).slice(0, 10), flags: [],
      status: answered ? 'answered' : 'open', answer: ans?.answer || '', who: ans?.who || '', date: ans?.date || '', previous: '',
    };
  });
  return { id: 'intro', name: 'Знакомство с проектом', uses: Number.MAX_SAFE_INTEGER, questions };
}

export function runKitGenerate(root, outDir, inventory, config, { quiet = false } = {}) {
  const { kit, answers } = kitOf(inventory, outDir, config);
  const atomsDir = compDir(outDir);
  const written = [], updated = [];
  for (const a of kit.atoms) {
    const file = path.join(atomsDir, `${a.id}.md`);
    const sections = atomSections(a, { root, atomsDir, tokens: inventory.tokens || [], families: config.families || [], inventory, context: config.context || null });
    const old = readText(file);
    if (old == null) { writeText(file, newAtomFile(a, sections)); written.push(a.id); continue; }
    const next = rewriteAtomFile(old, sections);
    if (next !== old) { writeText(file, next); updated.push(a.id); }
  }
  // Composites first: the spacing by role is measured on them and asked with the atoms.
  const patterns = runPatternGenerate(root, outDir, inventory, config, { quiet, atoms: kit.atoms, answers });
  const intro = introQuestions(config, answers);
  const basics = spaceQuestions(patterns.space);
  const q = writeQuestions(path.join(outDir, QUESTIONS_FILE), config.project, [...(intro ? [intro] : []), ...(basics ? [basics] : []), ...kit.atoms], { families: config.families || [], code: answers.code || [] });
  if (!quiet) {
    console.log(`ui-catalog generate (кит): атомов ${kit.atoms.length}; новых спек ${written.length}, переписано из кода ${updated.length}`);
    for (const a of kit.atoms) console.log(`  ${a.id.padEnd(12)} ${a.name.padEnd(14)} реализаций ${a.impls.length}, мест ${a.uses}, вопросов ${a.questions.filter((x) => x.status !== 'answered').length}`);
    console.log(`  вопросы: ${q.total}, открыто ${q.open} — ${path.join(outDir, QUESTIONS_FILE)}`);
    console.log(`  служебных классов (не атомы): ${kit.utilities.length}`);
  }
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
