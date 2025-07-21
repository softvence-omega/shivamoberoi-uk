import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import OpenAI from 'openai'; // Changed import
import { ConfigService } from '@nestjs/config';
import { Content, ContentDocument } from 'src/schemas/content.schema';

interface ContentAnalysis {
  readabilityScore: number;
  keywordDensity: number;
  issues: string[];
   keywords?: string[];
}

interface ContentResult {
  url: string;
  content: string;
  analysis: ContentAnalysis;

}

@Injectable()
export class ContentAiService {
  private readonly logger = new Logger(ContentAiService.name);
  private readonly openai: OpenAI; // Changed type
  private readonly config = {
    cacheTtl: 3600,
    maxRetries: 3,
    retryDelay: 1000,
    model: 'gpt-3.5-turbo',
    maxTokens: 300,
    temperature: 0.7,
  };

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in the environment variables');
    }
    this.openai = new OpenAI({ apiKey }); // Simplified initialization
  }

  async generateContent(
    url: string,
    keywords: string[], // Fixed parameter name (was 'keyword')
  ): Promise<ContentResult> {
    const cacheKey = `content_generate_${url}`;
    try {
      const cached = await this.cacheManager.get<ContentResult>(cacheKey);
      if (cached) {
        this.logger.debug(`Returning cached content for ${url}`);
        return cached;
      }

      const prompt = this.buildGenerationPrompt(url, keywords);
      const generatedContent = await this.retryableAiCall(prompt);
      const analysis = await this.analyzeContent(generatedContent, keywords);

      const content = await this.contentModel.create({
        url,
        originalContent: '',
        generatedContent,
        analysis,
      });

      const result = this.formatResult(url, generatedContent, analysis);
      await this.cacheManager.set(cacheKey, result, this.config.cacheTtl);
      return result;
    } catch (err) {
      this.logger.error(`Failed generating content for ${url}: ${err.message}`);
      throw new Error(`Content generation failed: ${err.message}`);
    }
  }
 async refineContent(url: string, content: string): Promise<ContentResult> {
    const cacheKey = `content_refine_${url}`;
    try {
        const cached = await this.cacheManager.get<ContentResult>(cacheKey);
        if (cached) {
            this.logger.debug(`Returning cached refined content for ${url}`);
            return cached;
        }

        // 1. Get existing content with proper typing
        const existingContent = await this.contentModel.findOne({ url })
            .lean<{ analysis?: ContentAnalysis & { keywords?: string[] } }>()
            .exec();

        // 2. Extract keywords safely
        const keywords = existingContent?.analysis?.keywords 
            ? [...existingContent.analysis.keywords] 
            : this.extractKeywords(content);

        // 3. Perform analysis
        const analysis = await this.analyzeContent(content, keywords);
        
        // 4. Generate refined content
        const prompt = this.buildRefinementPrompt(
            content,
            keywords,
            analysis.issues
        );
        const refinedContent = await this.retryableAiCall(prompt);

        // 5. Update database
        const updatedContent = await this.contentModel.findOneAndUpdate(
            { url },
            {
                originalContent: content,
                generatedContent: refinedContent,
                analysis: {
                    ...analysis,
                    keywords // Ensure keywords are saved
                },
                updatedAt: new Date(),
            },
            { upsert: true, new: true, lean: true }
        );

        // 6. Cache and return result
        const result = this.formatResult(url, refinedContent, analysis);
        await this.cacheManager.set(cacheKey, result, this.config.cacheTtl);
        return result;
    } catch (err) {
        this.logger.error(`Failed to refine content for ${url}: ${err.message}`);
        throw new Error(`Content refinement failed: ${err.message}`);
    }
}
  private async analyzeContent(
    content: string,
    keywords: string[],
  ): Promise<ContentAnalysis> {
    const prompt = this.buildAnalysisPrompt(content, keywords);
    try {
      const response = await this.retryableAiCall(prompt, 150, 0.3);
      return this.parseAnalysisResponse(response);
    } catch (error) {
      this.logger.warn(`AI analysis failed, using fallback: ${error.message}`);
      return this.fallbackAnalysis(content, keywords);
    }
  }
private fallbackAnalysis(content: string, keywords: string[]): ContentAnalysis {
    const wordCount = content.split(/\s+/).length;
    const keywordMatches = keywords.reduce((count, kw) => 
      count + (content.toLowerCase().split(kw.toLowerCase()).length - 1), 0);
    
    return {
      readabilityScore: Math.min(90, Math.max(60, wordCount / 3)),
      keywordDensity: keywords.length > 0 ? (keywordMatches / wordCount) * 100 : 0,
      issues: wordCount < 150 ? ['Content too short'] : [],
    };
  }
    private parseAnalysisResponse(response: string): ContentAnalysis {
    try {
      const parsed = JSON.parse(response);
      return {
        readabilityScore: Math.min(100, Math.max(0, parsed.readabilityScore || 50)),
        keywordDensity: Math.min(100, Math.max(0, parsed.keywordDensity || 0)),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch (error) {
      throw new Error(`Invalid analysis response: ${error.message}`);
    }
  }

  private extractKeywords(content: string): string[] {
    // Fallback heuristic if AI fails
    const words = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
    return [...new Set(words)].slice(0, 5);
  }

  private async retryableAiCall(
    prompt: string,
    maxTokens: number = this.config.maxTokens,
    temperature: number = this.config.temperature,
  ): Promise<string> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature,
        });
        return response.choices[0].message?.content?.trim() || '';
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.config.maxRetries) {
          this.logger.warn(
            `Retrying AI call (${attempt}/${this.config.maxRetries})...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelay),
          );
        }
      }
    }
    throw lastError || new Error('AI call failed after retries');
  }

  private buildRefinementPrompt(content: string, keywords: string[], issues: string[]): string {
    return `Improve this content for SEO while keeping its original meaning. 
    Keywords: ${keywords.join(', ')}. 
    Fix these issues: ${issues.join('; ')}. 
    Original content: ${content}. 
    Maintain 200-250 word count and add markdown formatting if needed.`;
  }

  private buildGenerationPrompt(url: string, keywords: string[]): string {
    return `Generate SEO-optimized content (200-300 words) for ${url} using these keywords naturally: ${keywords.join(', ')}.
            Include engaging introduction, detailed body, and clear conclusion.
            Use subheadings (H2, H3) where appropriate.`;
  }

  private buildAnalysisPrompt(content: string, keywords: string[]): string {
    return `Analyze this content for SEO and return JSON with these properties:
    - "readabilityScore": (0-100)
    - "keywordDensity": (percentage for ${keywords.join(', ')})
    - "issues": (array of issues found)
    Content: ${content}.
    Return valid JSON only. Example: {"readabilityScore": 85, "keywordDensity": 2.5, "issues": ["short content"]}`;
  }

  private formatResult(
    url: string,
    content: string,
    analysis: ContentAnalysis,
  ): ContentResult {
    return { url, content, analysis };
  }
}
