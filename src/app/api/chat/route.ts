import { NextRequest } from 'next/server';
import { openai } from '@/lib/embeddings';
import { hybridSearch, formatContextBlock } from '@/lib/retrieval';
import { z } from 'zod';

const RequestSchema = z.object({
  message: z.string().min(1).max(2000),
});

const SYSTEM_PROMPT = `You are CivicSpark Tulsa, an AI assistant that helps Tulsa residents understand city ordinances, zoning codes, and local regulations.

CORE RESPONSIBILITIES:
- Explain city rules and regulations in plain English at an 8th-grade reading level
- Always cite exact Municode sections or Zoning Code pages with URLs
- Use the provided context sections to inform your answers
- If you're unsure, direct users to official city resources

IMPORTANT RULES:
- DO NOT provide legal advice
- DO provide informational summaries with official source links
- Always include at least one citation link in your response
- If the question is outside Tulsa city ordinances, politely redirect to appropriate resources
- Keep responses concise (2-3 paragraphs max)

When citing sources, use this format: "[Section Title](URL)"`;

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json();
    const { message } = RequestSchema.parse(body);

    // Rate limiting check (simple IP-based, can be enhanced)
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    console.log(`Chat request from ${ip}: ${message.slice(0, 50)}...`);

    // Retrieve relevant context
    const retrievalResults = await hybridSearch(message, {
      topK: 6,
      useTextSearch: false,
      similarityThreshold: 0.5,
    });

    // Format context for LLM
    const contextBlock = formatContextBlock(retrievalResults);

    // Prepare messages
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: `CONTEXT FROM DATABASE:\n${contextBlock}\n\nUSER QUESTION: ${message}`,
      },
    ];

    // Stream response from OpenAI
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 800,
      stream: true,
    });

    // Create readable stream for response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }

          // Send citations at the end
          const citations = retrievalResults.map((r) => ({
            title: r.title,
            url: r.url,
            page: r.page,
          }));
          const citationsJson = JSON.stringify({ citations });
          controller.enqueue(encoder.encode(`\n\n__CITATIONS__:${citationsJson}`));

          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request format', details: error.errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

