/**
 * Weekly digest email script
 * Sends topic-based summaries to subscribers
 * Run via: npm run send:digest
 */

import { Resend } from 'resend';
import { db } from '../src/db';
import { subscriptions, agendaItems, agendas, digests } from '../src/db/schema';
import { eq, gte, inArray, sql } from 'drizzle-orm';

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY environment variable is required');
}

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@civicspark.ai';

interface DigestItem {
  title: string;
  body: string;
  url: string | null;
  topics: string[];
  meetingDate: Date;
}

async function getRecentItems(topics: string[], daysBack: number = 7): Promise<DigestItem[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const results = await db
    .select({
      title: agendaItems.title,
      body: agendaItems.body,
      url: agendaItems.itemUrl,
      topics: agendaItems.topics,
      meetingDate: agendas.meetingDate,
    })
    .from(agendaItems)
    .innerJoin(agendas, eq(agendaItems.agendaId, agendas.id))
    .where(
      sql`${agendas.meetingDate} >= ${cutoffDate.toISOString().split('T')[0]} 
          AND ${agendaItems.topics} && ${topics}`
    )
    .orderBy(agendas.meetingDate);

  return results as DigestItem[];
}

function generateEmailHTML(items: DigestItem[], topics: string[]): string {
  const topicList = topics.join(', ');
  
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .item { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
    .item-title { font-size: 18px; font-weight: bold; color: #1f2937; margin-bottom: 10px; }
    .item-meta { font-size: 14px; color: #6b7280; margin-bottom: 10px; }
    .item-body { font-size: 14px; color: #374151; }
    .topics { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-right: 5px; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 CivicSpark Weekly Digest</h1>
    <p>Your topics: ${topicList}</p>
  </div>
  <div class="content">
    <p>Here are the City Council agenda items from the past week that match your interests:</p>
`;

  if (items.length === 0) {
    html += `<p><em>No new items this week.</em></p>`;
  } else {
    items.forEach((item) => {
      html += `
    <div class="item">
      <div class="item-title">${item.title}</div>
      <div class="item-meta">
        Meeting Date: ${item.meetingDate.toLocaleDateString()} |
        ${item.topics.map((t) => `<span class="topics">${t}</span>`).join('')}
      </div>
      <div class="item-body">${item.body.slice(0, 300)}${item.body.length > 300 ? '...' : ''}</div>
      ${item.url ? `<p><a href="${item.url}">View Full Item →</a></p>` : ''}
    </div>
`;
    });
  }

  html += `
  </div>
  <div class="footer">
    <p>This is a volunteer community project. For official information, visit <a href="https://www.cityoftulsa.org">cityoftulsa.org</a>.</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe">Unsubscribe</a></p>
  </div>
</body>
</html>
`;

  return html;
}

async function sendDigestToSubscriber(subscription: typeof subscriptions.$inferSelect) {
  console.log(`Preparing digest for ${subscription.email}...`);

  const items = await getRecentItems(subscription.topics);
  
  if (items.length === 0) {
    console.log('No items, skipping email');
    return { sent: false, itemCount: 0 };
  }

  const html = generateEmailHTML(items, subscription.topics);

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: subscription.email,
      subject: `CivicSpark Digest: ${items.length} new ${items.length === 1 ? 'item' : 'items'}`,
      html,
    });

    console.log(`✓ Sent to ${subscription.email} (${items.length} items)`);
    return { sent: true, itemCount: items.length };
  } catch (error) {
    console.error(`Failed to send to ${subscription.email}:`, error);
    return { sent: false, itemCount: items.length, error: String(error) };
  }
}

async function main() {
  console.log('Starting weekly digest...');

  // Get all subscriptions
  const subs = await db.select().from(subscriptions);
  console.log(`Found ${subs.length} subscriber(s)`);

  const stats = {
    total: subs.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    totalItems: 0,
  };

  for (const sub of subs) {
    const result = await sendDigestToSubscriber(sub);
    
    if (result.sent) {
      stats.sent++;
      stats.totalItems += result.itemCount;
    } else if (result.error) {
      stats.failed++;
    } else {
      stats.skipped++;
    }
  }

  // Record digest run
  await db.insert(digests).values({
    runAt: new Date(),
    stats,
  });

  console.log('\n✓ Digest complete!');
  console.log(JSON.stringify(stats, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error('Digest failed:', err);
  process.exit(1);
});

