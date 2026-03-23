import { db } from '@/db';
import { sections, type Section } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { createEmbedding } from './embeddings';

export interface RetrievalResult {
  id: string;
  title: string;
  url: string;
  page: number | null;
  content: string;
  similarity: number;
}

export async function hybridSearch(
  query: string,
  options: {
    topK?: number;
    useTextSearch?: boolean;
    similarityThreshold?: number;
  } = {}
): Promise<RetrievalResult[]> {
  const { topK = 6, useTextSearch = false, similarityThreshold = 0.5 } = options;

  // Create query embedding
  const queryEmbedding = await createEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(',')}]`;

  // Build query with optional text search filter
  let queryBuilder = db
    .select({
      id: sections.id,
      title: sections.title,
      url: sections.url,
      page: sections.page,
      content: sections.content,
      similarity: sql<number>`1 - (${sections.embedding} <=> ${embeddingString}::vector)`,
    })
    .from(sections);

  // Add text search filter if enabled
  if (useTextSearch) {
    queryBuilder = queryBuilder.where(
      sql`to_tsvector('english', ${sections.title} || ' ' || ${sections.content}) @@ plainto_tsquery('english', ${query})`
    );
  }

  // Execute with similarity threshold and limit
  const results = await queryBuilder
    .where(sql`1 - (${sections.embedding} <=> ${embeddingString}::vector) > ${similarityThreshold}`)
    .orderBy(sql`${sections.embedding} <=> ${embeddingString}::vector`)
    .limit(topK);

  return results as RetrievalResult[];
}

export function formatContextBlock(results: RetrievalResult[]): string {
  if (results.length === 0) {
    return 'No relevant sections found in the database.';
  }

  let context = 'RELEVANT ORDINANCE SECTIONS:\n\n';

  results.forEach((result, idx) => {
    context += `[${idx + 1}] ${result.title}\n`;
    context += `URL: ${result.url}`;
    if (result.page) {
      context += ` (Page ${result.page})`;
    }
    context += `\n`;
    // Truncate content to ~500 chars to stay within token limits
    const truncatedContent = result.content.length > 500 
      ? result.content.slice(0, 500) + '...' 
      : result.content;
    context += `Content: ${truncatedContent}\n`;
    context += `Similarity: ${(result.similarity * 100).toFixed(1)}%\n\n`;
  });

  return context;
}

