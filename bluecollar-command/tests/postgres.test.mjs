import { readFileSync, writeFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

test('PostgreSQL keeps concurrent planner updates and rolls back failed writes', { skip: !process.env.PLANNER_TEST_DATABASE_URL }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'planner-pg-test-'));
  const previous = process.env.DATABASE_URL;
  try {
    symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(directory, 'node_modules'), 'dir');
    const source = readFileSync(new URL('../src/lib/marketing-store.server.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    writeFileSync(join(directory, 'marketing-store.server.mjs'), compiled);
    process.env.DATABASE_URL = process.env.PLANNER_TEST_DATABASE_URL;
    const { store, updateStore } = await import(pathToFileURL(join(directory, 'marketing-store.server.mjs')));
    await updateStore(s => { s.accountBrands['pg-preflight-counter'] = '0'; });
    await Promise.all(Array.from({ length: 20 }, () => updateStore(s => {
      s.accountBrands['pg-preflight-counter'] = String(Number(s.accountBrands['pg-preflight-counter']) + 1);
    })));
    assert.equal((await store()).accountBrands['pg-preflight-counter'], '20');
    await assert.rejects(updateStore(s => {
      s.accountBrands['pg-preflight-counter'] = 'bad';
      throw new Error('rollback check');
    }), /rollback check/);
    assert.equal((await store()).accountBrands['pg-preflight-counter'], '20');
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
