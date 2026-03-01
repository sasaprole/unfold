import { z } from 'zod';

export const FrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  level: z.number().int().min(1), // No max limit - unlimited levels supported
  status: z.enum(['not-started', 'in-progress', 'complete', 'blocked']),
  parent: z.string(),
  order: z.number().int().min(0),
  icon: z.string().optional(),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

export type PlanStatus = 'not-started' | 'in-progress' | 'complete' | 'blocked';
export type PlanLevel = number; // Any positive integer
