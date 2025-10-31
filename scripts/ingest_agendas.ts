/**
 * Agenda ingestion and classification script
 * Scrapes City Council agendas, classifies items, and stores in DB
 * Run via: npm run ingest:agendas
 */

import * as cheerio from 'cheerio';
import { db } from '../src/db';
import { agendas, agendaItems, type NewAgenda, type NewAgendaItem } from '../src/db/schema';
import { classifyWithEscalation } from '../src/lib/classifier';

interface ScrapedAgenda {
  meetingDate: Date;
  sourceUrl: string;
  items: ScrapedAgendaItem[];
}

interface ScrapedAgendaItem {
  title: string;
  body: string;
  itemUrl?: string;
}

// Generic scraper - you'll customize this based on Tulsa's actual website
async function scrapeAgenda(url: string): Promise<ScrapedAgenda | null> {
  try {
    console.log(`Scraping ${url}...`);
    
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    // CUSTOMIZE THIS SECTION based on Tulsa's actual HTML structure
    // This is a placeholder implementation
    const items: ScrapedAgendaItem[] = [];
    
    $('.agenda-item').each((i, elem) => {
      const title = $(elem).find('.item-title').text().trim();
      const body = $(elem).find('.item-body').text().trim();
      const itemUrl = $(elem).find('a').attr('href');

      if (title && body) {
        items.push({
          title,
          body,
          itemUrl: itemUrl ? new URL(itemUrl, url).href : undefined,
        });
      }
    });

    // Extract meeting date from page
    const dateText = $('.meeting-date').text().trim();
    const meetingDate = dateText ? new Date(dateText) : new Date();

    return {
      meetingDate,
      sourceUrl: url,
      items,
    };
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error);
    return null;
  }
}

async function ingestAndClassifyAgenda(agendaUrl: string) {
  const scraped = await scrapeAgenda(agendaUrl);
  if (!scraped) {
    console.log('Scraping failed, skipping');
    return;
  }

  console.log(`Found ${scraped.items.length} items`);

  // Insert agenda record
  const [agendaRecord] = await db
    .insert(agendas)
    .values({
      meetingDate: scraped.meetingDate,
      sourceUrl: scraped.sourceUrl,
    })
    .returning();

  console.log(`Agenda record created: ${agendaRecord.id}`);

  // Process each item
  for (let i = 0; i < scraped.items.length; i++) {
    const item = scraped.items[i];
    console.log(`\nClassifying item ${i + 1}/${scraped.items.length}: ${item.title.slice(0, 50)}...`);

    // Classify with escalation
    const classification = await classifyWithEscalation(item.title, item.body);

    console.log(
      `Topics: ${classification.topics.join(', ')} (confidence: ${classification.confidence.toFixed(2)})`
    );

    // Insert agenda item
    await db.insert(agendaItems).values({
      agendaId: agendaRecord.id,
      title: item.title,
      body: item.body,
      itemUrl: item.itemUrl,
      rawJson: item as any,
      topics: classification.topics,
      confidence: classification.confidence.toString(),
      citations: {
        reasoning: classification.reasoning,
      },
    });

    console.log('✓ Item saved');
  }

  console.log('\n✓ Agenda ingestion complete!');
}

async function main() {
  // Default URLs (customize for Tulsa)
  const agendaUrls = process.env.AGENDA_URLS?.split(',') || [
    'https://www.cityoftulsa.org/government/city-council/agendas/',
    // Add more URLs as needed
  ];

  console.log(`Processing ${agendaUrls.length} agenda(s)...`);

  for (const url of agendaUrls) {
    await ingestAndClassifyAgenda(url);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Agenda ingestion failed:', err);
  process.exit(1);
});

