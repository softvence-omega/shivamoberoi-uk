export interface CachedSeoAnalysis {
  url: string;
  title: string;
  description: string;
  keywords: string[];
  h1Tags: string[];
  statusCode: number;
  analyzedAt: string; // ISO string
  score?: number;     // optional SEO score
}