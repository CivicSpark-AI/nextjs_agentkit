/**
 * Evaluation system with canary tests
 * Tests QA accuracy, classifier performance, and JSON validity
 * Run via: npm run evals
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { hybridSearch } from '../src/lib/retrieval';
import { classifyWithEscalation } from '../src/lib/classifier';
import { db } from '../src/db';
import { agendaItems } from '../src/db/schema';
import { eq } from 'drizzle-orm';

interface QAGoldRecord {
  question: string;
  expected_sections: string[]; // array of URLs or section IDs
}

interface ClassifierGoldRecord {
  item_id: number;
  expected_topics: string[];
}

interface EvalResults {
  timestamp: string;
  qa: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
  classifier: {
    total: number;
    microF1: number;
    macroF1: number;
  };
  jsonValidity: {
    total: number;
    valid: number;
    invalid: number;
  };
}

// Jaccard similarity for citation overlap
function jaccardSimilarity(set1: string[], set2: string[]): number {
  const s1 = new Set(set1);
  const s2 = new Set(set2);
  const intersection = new Set([...s1].filter((x) => s2.has(x)));
  const union = new Set([...s1, ...s2]);
  return intersection.size / union.size;
}

async function runQAEvals(): Promise<typeof results> {
  console.log('\n=== QA Evaluation ===');
  
  const goldPath = path.join(__dirname, '../evals/qa_gold.csv');
  if (!fs.existsSync(goldPath)) {
    console.log('No QA gold file found, skipping');
    return { total: 0, passed: 0, failed: 0, passRate: 0 };
  }

  const csvData = fs.readFileSync(goldPath, 'utf-8');
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
  });

  const goldRecords: QAGoldRecord[] = records.map((r: any) => ({
    question: r.question,
    expected_sections: r.expected_sections.split('|'),
  }));

  let passed = 0;
  let failed = 0;

  for (const gold of goldRecords) {
    console.log(`\nQ: ${gold.question.slice(0, 60)}...`);
    
    const results = await hybridSearch(gold.question, { topK: 6 });
    const retrievedUrls = results.map((r) => r.url);
    
    const similarity = jaccardSimilarity(retrievedUrls, gold.expected_sections);
    const threshold = 0.6;
    
    if (similarity >= threshold) {
      console.log(`✓ PASS (Jaccard: ${similarity.toFixed(2)})`);
      passed++;
    } else {
      console.log(`✗ FAIL (Jaccard: ${similarity.toFixed(2)})`);
      console.log(`Expected: ${gold.expected_sections.join(', ')}`);
      console.log(`Got: ${retrievedUrls.join(', ')}`);
      failed++;
    }
  }

  const results = {
    total: goldRecords.length,
    passed,
    failed,
    passRate: passed / goldRecords.length,
  };

  console.log(`\nQA Results: ${passed}/${goldRecords.length} passed (${(results.passRate * 100).toFixed(1)}%)`);
  return results;
}

async function runClassifierEvals(): Promise<typeof results> {
  console.log('\n=== Classifier Evaluation ===');
  
  const goldPath = path.join(__dirname, '../evals/classifier_gold.csv');
  if (!fs.existsSync(goldPath)) {
    console.log('No classifier gold file found, skipping');
    return { total: 0, microF1: 0, macroF1: 0 };
  }

  const csvData = fs.readFileSync(goldPath, 'utf-8');
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
  });

  const goldRecords: ClassifierGoldRecord[] = records.map((r: any) => ({
    item_id: parseInt(r.item_id),
    expected_topics: r.expected_topics.split('|'),
  }));

  let totalPredicted = 0;
  let totalGold = 0;
  let totalCorrect = 0;

  for (const gold of goldRecords) {
    const [item] = await db
      .select()
      .from(agendaItems)
      .where(eq(agendaItems.id, gold.item_id));

    if (!item) {
      console.log(`Item ${gold.item_id} not found, skipping`);
      continue;
    }

    const predicted = item.topics || [];
    const expected = gold.expected_topics;

    totalPredicted += predicted.length;
    totalGold += expected.length;
    totalCorrect += predicted.filter((t) => expected.includes(t)).length;

    console.log(`Item ${gold.item_id}: ${predicted.join(', ')} vs ${expected.join(', ')}`);
  }

  const precision = totalCorrect / (totalPredicted || 1);
  const recall = totalCorrect / (totalGold || 1);
  const microF1 = (2 * precision * recall) / (precision + recall || 1);

  const results = {
    total: goldRecords.length,
    microF1,
    macroF1: microF1, // Simplified; true macro-F1 requires per-class calculation
  };

  console.log(`\nClassifier Micro-F1: ${microF1.toFixed(3)}`);
  return results;
}

async function runJSONValidityCheck(): Promise<typeof results> {
  console.log('\n=== JSON Validity Check ===');
  
  const recentItems = await db
    .select()
    .from(agendaItems)
    .limit(20)
    .orderBy(agendaItems.createdAt);

  let valid = 0;
  let invalid = 0;

  for (const item of recentItems) {
    // Check that topics is a valid array
    if (Array.isArray(item.topics)) {
      valid++;
    } else {
      console.log(`Invalid topics for item ${item.id}`);
      invalid++;
    }

    // Check that confidence is valid numeric
    if (item.confidence !== null) {
      const conf = parseFloat(item.confidence as string);
      if (isNaN(conf) || conf < 0 || conf > 1) {
        console.log(`Invalid confidence for item ${item.id}: ${item.confidence}`);
        invalid++;
      } else {
        valid++;
      }
    }
  }

  const results = {
    total: recentItems.length,
    valid,
    invalid,
  };

  console.log(`\nJSON Validity: ${valid}/${results.total} valid`);
  return results;
}

async function main() {
  console.log('Starting evaluations...\n');

  const qaResults = await runQAEvals();
  const classifierResults = await runClassifierEvals();
  const jsonResults = await runJSONValidityCheck();

  const evalResults: EvalResults = {
    timestamp: new Date().toISOString(),
    qa: qaResults,
    classifier: classifierResults,
    jsonValidity: jsonResults,
  };

  // Write results to file
  const outputPath = path.join(__dirname, '../evals/results.json');
  fs.writeFileSync(outputPath, JSON.stringify(evalResults, null, 2));

  console.log(`\n✓ Results written to ${outputPath}`);
  console.log(JSON.stringify(evalResults, null, 2));

  // Exit with error if any tests failed
  if (qaResults.passRate < 0.8 || classifierResults.microF1 < 0.6) {
    console.error('\n✗ Evaluations failed to meet thresholds');
    process.exit(1);
  }

  console.log('\n✓ All evaluations passed!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});

