export interface LinkCheckResult {
  status: number | string;
  isBroken: boolean;
  reason?: string | null;
}

export interface LinkInfo {
  sourcePages: Set<string>;
  linkType: 'internal' | 'external';
}

export interface CrawlResult {
  success: boolean;
  message: string;
  pagesCrawled: number;
  brokenLinksFound: number;
  elapsedTime?: number;
}

export interface BrokenLinkResponse {
  url: string;
  linkType: 'internal' | 'external';
  status: number | string;
  sourcePages: string[];
  reason?: string;
  checkedAt: Date;
}

export interface PaginatedBrokenLinks {
  status: 'success' | 'error';
  message: string;
  data: {
    baseUrl: string;
    totalBrokenLinks: number;
    brokenLinks: BrokenLinkResponse[];
    pagination: {
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
    };
  };
}

export interface ApiError {
  status: 'error';
  message: string;
  error?: any;
}