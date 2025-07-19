

export async function analyzeText(content: string, keywords: string[]) {
    const wordCount = content.split(/\s+/).length;
    const keywordCount = keywords.reduce((count, keyword) => count + (content.match(new RegExp(`\\b${keyword}\\b`, 'gi')) || []).length, 0);
    const readabilityScore = 206.835 - (1.015 * (wordCount / content.split(/\n/).length)) - (84.6 * (content.split(/\s+/).length / wordCount));
    const keywordDensity = (keywordCount / wordCount) * 100 || 0;

    const issues: string[] = [];
    if(keywordDensity < 0.05) issues.push('Low keyword density');
    if(readabilityScore < 50) issues.push('poor readability score');
    if(content.length < 200) issues.push('Content too short');
    return {readabilityScore, keywordDensity, issues};
    
}