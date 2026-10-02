export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export class WebService {
  /**
   * Lê o conteúdo completo de qualquer página da web formatado em Markdown limpo (via Jina Reader)
   */
  async readWebpage(url: string, maxLength: number = 6000): Promise<{ success: boolean; url: string; title?: string; content: string }> {
    try {
      const cleanUrl = url.trim();
      const jinaUrl = `https://r.jina.ai/${cleanUrl}`;

      const response = await fetch(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Victoria-Secretary/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Falha ao ler página (${response.status}: ${response.statusText})`);
      }

      const fullText = await response.text();
      const content = fullText.length > maxLength 
        ? fullText.slice(0, maxLength) + '\n\n...[Conteúdo truncado para otimização]'
        : fullText;

      return {
        success: true,
        url: cleanUrl,
        content,
      };
    } catch (error: any) {
      console.error(`[WebService] Erro ao ler página ${url}:`, error.message);
      return {
        success: false,
        url,
        content: `Erro ao acessar o link: ${error.message}`,
      };
    }
  }

  /**
   * Realiza uma pesquisa rápida na web retornando os principais resultados
   */
  async searchWeb(query: string, limit: number = 5): Promise<{ query: string; results: SearchResult[] }> {
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Busca retornou status ${response.status}`);
      }

      const html = await response.text();
      const results: SearchResult[] = [];

      // Regex para extrair blocos de resultados do DuckDuckGo HTML
      const resultBlocks = html.split('<div class="result results_links');
      
      for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
        const block = resultBlocks[i];
        
        // Extrai título
        const titleMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/) ||
                           block.match(/<a class="result__url"[^>]*>([\s\S]*?)<\/a>/);
        const linkMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"/) ||
                          block.match(/<a class="result__snippet"[^>]*href="([^"]+)"/);
        const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

        const rawTitle = block.match(/<a class="result__title"[^>]*>([\s\S]*?)<\/a>/) ||
                         block.match(/<h2 class="result__title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);

        const title = rawTitle ? rawTitle[1].replace(/<[^>]+>/g, '').trim() : 'Resultado';
        const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        let resultUrl = linkMatch ? linkMatch[1].trim() : '';

        // Limpa redirecionamento do DuckDuckGo se houver
        if (resultUrl.includes('uddg=')) {
          const matchUddg = resultUrl.match(/uddg=([^&]+)/);
          if (matchUddg) {
            resultUrl = decodeURIComponent(matchUddg[1]);
          }
        }

        if (snippet && snippet.length > 0) {
          results.push({
            title,
            snippet,
            url: resultUrl.startsWith('//') ? `https:${resultUrl}` : resultUrl,
          });
        }
      }

      return { query, results };
    } catch (error: any) {
      console.error(`[WebService] Erro ao buscar na web por "${query}":`, error.message);
      return { query, results: [] };
    }
  }
}

export const webService = new WebService();
