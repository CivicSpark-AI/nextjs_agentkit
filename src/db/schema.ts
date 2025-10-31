import { pgTable, text, serial, integer, timestamp, numeric, jsonb, date, uuid, vector, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Vector document sections (for RAG)
export const sections = pgTable(
  'sections',
  {
    id: text('id').primaryKey(),
    docId: text('doc_id').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    page: integer('page'),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    tsv: text('tsv'), // Will be generated via SQL trigger
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    embeddingIdx: index('sections_embedding_idx').using(
      'ivfflat',
      table.embedding.op('vector_cosine_ops')
    ),
    tsvIdx: index('sections_tsv_idx').using('gin', sql`to_tsvector('english', ${table.tsv})`),
  })
);

// City Council agendas
export const agendas = pgTable('agendas', {
  id: serial('id').primaryKey(),
  meetingDate: date('meeting_date').notNull(),
  sourceUrl: text('source_url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Individual agenda items
export const agendaItems = pgTable('agenda_items', {
  id: serial('id').primaryKey(),
  agendaId: integer('agenda_id')
    .notNull()
    .references(() => agendas.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  itemUrl: text('item_url'),
  rawJson: jsonb('raw_json'),
  topics: text('topics').array().default(sql`'{}'::text[]`),
  confidence: numeric('confidence', { precision: 3, scale: 2 }),
  citations: jsonb('citations'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// User subscriptions for digest emails
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  district: text('district'),
  topics: text('topics').array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Digest run history
export const digests = pgTable('digests', {
  id: serial('id').primaryKey(),
  runAt: timestamp('run_at').defaultNow().notNull(),
  stats: jsonb('stats'),
});

// Type exports
export type Section = typeof sections.$inferSelect;
export type NewSection = typeof sections.$inferInsert;
export type Agenda = typeof agendas.$inferSelect;
export type NewAgenda = typeof agendas.$inferInsert;
export type AgendaItem = typeof agendaItems.$inferSelect;
export type NewAgendaItem = typeof agendaItems.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Digest = typeof digests.$inferSelect;

