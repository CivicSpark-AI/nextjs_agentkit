import { openai } from './embeddings';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

// Topic taxonomy
export const TOPICS = [
  'housing',
  'zoning',
  'transportation',
  'public_safety',
  'utilities',
  'budget',
  'environment',
  'arts_culture',
  'economic_development',
  'other',
] as const;

export type Topic = typeof TOPICS[number];

// Schema for structured output
const ClassificationSchema = z.object({
  topics: z.array(z.enum(TOPICS)).min(1).max(3),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export async function classifyAgendaItem(
  title: string,
  body: string,
  options: {
    useSmallModel?: boolean;
  } = {}
): Promise<Classification> {
  const { useSmallModel = true } = options;
  
  const model = useSmallModel ? 'gpt-4o-mini' : 'gpt-4o';
  
  const systemPrompt = `You are a classifier for Tulsa City Council agenda items.

Available topics: ${TOPICS.join(', ')}

Instructions:
- Assign 1-3 topics to each agenda item based on its title and body
- Provide a confidence score (0-1) based on clarity of the content
- Explain your reasoning briefly
- Default to "other" if unclear`;

  const userPrompt = `Classify this agenda item:

Title: ${title}

Body: ${body}`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: zodResponseFormat(ClassificationSchema, 'classification'),
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No classification returned');
    }

    const result = JSON.parse(content);
    return ClassificationSchema.parse(result);
  } catch (error) {
    console.error('Classification error:', error);
    // Fallback classification
    return {
      topics: ['other'],
      confidence: 0.0,
      reasoning: 'Classification failed',
    };
  }
}

// Multi-stage classification with confidence escalation
export async function classifyWithEscalation(
  title: string,
  body: string,
  confidenceThreshold: number = 0.6
): Promise<Classification> {
  // Try small model first
  const smallModelResult = await classifyAgendaItem(title, body, { useSmallModel: true });
  
  // If confidence is high enough, return small model result
  if (smallModelResult.confidence >= confidenceThreshold) {
    return smallModelResult;
  }
  
  // Otherwise, escalate to larger model
  console.log(`Low confidence (${smallModelResult.confidence}), escalating to larger model`);
  return await classifyAgendaItem(title, body, { useSmallModel: false });
}

