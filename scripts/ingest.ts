/**
 * Ingestion script for Tulsa ordinances (Municode/Zoning PDFs)
 * Run via: npm run ingest
 * Or via GitHub Actions (scheduled nightly)
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../src/db';
import { sections, type NewSection } from '../src/db/schema';
import { createEmbeddings } from '../src/lib/embeddings';

interface DocumentChunk {
  id: string;
  docId: string;
  title: string;
  url: string;
  page?: number;
  content: string;
}

// Simple text chunker (1-2k tokens ~= 4-8k chars)
function chunkText(text: string, maxChars: number = 6000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  const paragraphs = text.split('\n\n');

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function ingestFromJSON(filePath: string) {
  console.log(`Ingesting from ${filePath}...`);

  const raw = fs.readFileSync(filePath, 'utf-8');
  const documents: DocumentChunk[] = JSON.parse(raw);

  console.log(`Found ${documents.length} document chunks`);

  // Process in batches
  const batchSize = 50;
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    console.log(`Processing batch ${i / batchSize + 1}/${Math.ceil(documents.length / batchSize)}`);

    // Create embeddings
    const texts = batch.map((d) => `${d.title}\n\n${d.content}`);
    const embeddings = await createEmbeddings(texts);

    // Prepare inserts
    const inserts: NewSection[] = batch.map((doc, idx) => ({
      id: doc.id,
      docId: doc.docId,
      title: doc.title,
      url: doc.url,
      page: doc.page || null,
      content: doc.content,
      embedding: JSON.stringify(embeddings[idx]),
    }));

    // Upsert to database
    await db
      .insert(sections)
      .values(inserts)
      .onConflictDoUpdate({
        target: sections.id,
        set: {
          title: sections.title,
          content: sections.content,
          embedding: sections.embedding,
        },
      });

    console.log(`✓ Batch ${i / batchSize + 1} inserted`);
  }

  console.log('✓ Ingestion complete!');
}

// Example: Process from a sample JSON file
async function main() {
  const dataPath = process.env.INGEST_FILE || './data/ordinances.json';

  if (!fs.existsSync(dataPath)) {
    console.error(`File not found: ${dataPath}`);
    console.log('\nExpected JSON format:');
    console.log(
      JSON.stringify(
        [
          {
            id: 'municode-123',
            docId: 'municode',
            title: 'Chapter 1: General Provisions',
            url: 'https://library.municode.com/...',
            page: 1,
            content: 'Section 1.1 ...',
          },
        ],
        null,
        2
      )
    );
    console.log('\nCreate this file or set INGEST_FILE env variable.');
    process.exit(1);
  }

  await ingestFromJSON(dataPath);
  process.exit(0);
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});

