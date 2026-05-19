import { z } from 'zod';

export const RequestSchema = z.object({
  titles: z.array(z.string().min(1)).min(1).max(5),
  clientVersion: z.string().max(32).optional(),
});

export type RequestPayload = z.infer<typeof RequestSchema>;

export const ResponseSchema = z.object({
  topicLabel: z.string().min(1),
  escapeQueries: z
    .array(z.object({ queryText: z.string().min(1) }))
    .length(3),
});

export type ResponsePayload = z.infer<typeof ResponseSchema>;

const MAX_TITLE_LEN = 120;
const MAX_TITLES = 5;

export function sanitizeTitles(titles: string[]): string[] {
  return titles.slice(0, MAX_TITLES).map((t) => t.slice(0, MAX_TITLE_LEN));
}
