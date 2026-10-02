/**
 * YouTube Search & Media Discovery Service
 * Realiza buscas diretas no YouTube sem necessidade de chaves de API pagas,
 * retornando títulos, URLs, contagem de visualizações, canais, detecção de Shorts
 * e datas reais e precisas de publicação (uploadDate e tempo relativo).
 */

export interface YouTubeVideoResult {
  type: 'video' | 'shorts';
  title: string;
  url: string;
  videoId: string;
  views: string;
  viewsNumber: number;
  published: string;
  uploadDate?: string;
  duration: string;
  channel: string;
}

export interface YouTubeSearchOptions {
  maxResults?: number;
  type?: 'all' | 'shorts' | 'video';
  sortBy?: 'relevance' | 'views' | 'recent';
  uploadDate?: 'all' | 'hour' | 'today' | 'week' | 'month' | 'year';
}

export class YouTubeService {
  /**
   * Converte texto de visualizações (ex: "5.4M views", "140 mil visualizações", "23 mi de visualizações") em número
   */
  public parseViewCount(viewStr: string): number {
    if (!viewStr) return 0;
    const clean = viewStr.toLowerCase().replace(/views?|visualizaç(ões|ão)|assistindo|watching|de\s+visualizações/gi, '').trim();

    // Formato com Milhões (ex: "23 mi", "5.4m", "1.2 mi", "5 million")
    if (/(^|\d|\s)(mi\b|milh|million|m\b)/i.test(clean) && !/\bmil\b/i.test(clean)) {
      const num = parseFloat(clean.replace(/[^\d.,]/g, '').replace(',', '.').trim());
      return Math.round((num || 0) * 1000000);
    }

    // Formato com Milhares (ex: "140 mil", "1 mil", "45k", "1.5k")
    if (/(^|\d|\s)(k\b|mil\b|thousand)/i.test(clean)) {
      const num = parseFloat(clean.replace(/[^\d.,]/g, '').replace(',', '.').trim());
      return Math.round((num || 0) * 1000);
    }

    // Formato numérico puro com separadores
    const digits = clean.replace(/\D/g, '');
    return parseInt(digits, 10) || 0;
  }

  /**
   * Formata uma data ISO ou timestamp em string legível e relativa
   */
  private formatRelativeDate(isoDateStr: string): string {
    try {
      const date = new Date(isoDateStr);
      if (isNaN(date.getTime())) return isoDateStr;

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);
      const diffMonths = Math.floor(diffDays / 30);
      const diffYears = Math.floor(diffDays / 365);

      if (diffSec < 60) return 'há poucos segundos';
      if (diffMin < 60) return `há ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
      if (diffHours < 24) return `há ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
      if (diffDays < 30) return `há ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`;
      if (diffMonths < 12) return `há ${diffMonths} ${diffMonths === 1 ? 'mês' : 'meses'}`;
      return `há ${diffYears} ${diffYears === 1 ? 'ano' : 'anos'}`;
    } catch {
      return isoDateStr;
    }
  }

  /**
   * Enriquece dados detalhados de um vídeo (data de upload exata, autor, contagem de views)
   */
  private async fetchVideoDetails(videoId: string): Promise<{
    uploadDate?: string;
    published?: string;
    channel?: string;
    exactViews?: number;
  }> {
    try {
      const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cookie': 'CONSENT=YES+1; PREF=hl=pt-BR&gl=BR;'
        },
        signal: AbortSignal.timeout(4000)
      });

      if (!res.ok) return {};

      const html = await res.text();
      const uploadDateMatch = html.match(/"uploadDate":"([^"]+)"/) || html.match(/itemprop="uploadDate" content="([^"]+)"/);
      const dateTextMatch = html.match(/"dateText":\s*{"simpleText":"([^"]+)"}/);
      const ownerMatch = html.match(/"ownerChannelName":"([^"]+)"/) || html.match(/"author":"([^"]+)"/);
      const viewCountMatch = html.match(/"viewCount":"([^"]+)"/) || html.match(/itemprop="interactionCount" content="([^"]+)"/);

      const isoDate = uploadDateMatch ? uploadDateMatch[1] : undefined;
      let published = dateTextMatch ? dateTextMatch[1] : undefined;

      if (isoDate) {
        const relative = this.formatRelativeDate(isoDate);
        published = published ? `${published} (${relative})` : relative;
      }

      return {
        uploadDate: isoDate ? isoDate.split('T')[0] : undefined,
        published,
        channel: ownerMatch ? ownerMatch[1] : undefined,
        exactViews: viewCountMatch ? parseInt(viewCountMatch[1], 10) : undefined,
      };
    } catch {
      return {};
    }
  }

  /**
   * Pesquisa vídeos ou Shorts diretamente no YouTube
   */
  async search(query: string, options: YouTubeSearchOptions = {}): Promise<{
    success: boolean;
    query: string;
    total: number;
    results: YouTubeVideoResult[];
    error?: string;
  }> {
    try {
      const maxResults = options.maxResults || 5;
      let searchQuery = query;
      
      if (options.type === 'shorts' && !searchQuery.toLowerCase().includes('shorts')) {
        searchQuery += ' #shorts';
      }

      // Parâmetros de filtro e ordenação do YouTube:
      // sp=CAI%253D (ordem por data de envio recente)
      // sp=EgIIAQ%253D%253D (Última hora)
      // sp=EgIIAg%253D%253D (Hoje / últimas 24h)
      // sp=EgIIAw%253D%253D (Esta semana)
      // sp=EgIIBA%253D%253D (Este mês)
      // sp=EgIIBQ%253D%253D (Este ano)
      let spParam = '';
      if (options.uploadDate === 'hour') {
        spParam = '&sp=EgIIAQ%253D%253D';
      } else if (options.uploadDate === 'today') {
        spParam = '&sp=EgIIAg%253D%253D';
      } else if (options.uploadDate === 'week') {
        spParam = '&sp=EgIIAw%253D%253D';
      } else if (options.uploadDate === 'month') {
        spParam = '&sp=EgIIBA%253D%253D';
      } else if (options.uploadDate === 'year') {
        spParam = '&sp=EgIIBQ%253D%253D';
      } else if (options.sortBy === 'views') {
        spParam = '&sp=CAMSAhAB';
      } else if (options.sortBy === 'recent') {
        spParam = '&sp=CAI%253D';
      }

      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}${spParam}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cookie': 'CONSENT=YES+1; PREF=hl=pt-BR&gl=BR;'
        },
        signal: AbortSignal.timeout(7000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao acessar YouTube`);
      }

      const html = await response.text();
      const jsonMatch = html.match(/ytInitialData\s*=\s*({.+?});/);
      if (!jsonMatch) {
        return {
          success: false,
          query,
          total: 0,
          results: [],
          error: 'Não foi possível extrair dados estruturados da busca do YouTube.'
        };
      }

      const data = JSON.parse(jsonMatch[1]);
      const videos: YouTubeVideoResult[] = [];
      const seenIds = new Set<string>();

      const traverse = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;

        // Formato 1: Vídeo padrão
        if (obj.videoRenderer && obj.videoRenderer.videoId) {
          const v = obj.videoRenderer;
          const vId = v.videoId;
          if (!seenIds.has(vId)) {
            seenIds.add(vId);
            const viewText = v.viewCountText?.simpleText || v.viewCountText?.runs?.map((r: any) => r.text).join('') || '0 views';
            const duration = v.lengthText?.simpleText || 'Desconhecido';
            const isShorts = duration.startsWith('0:') && parseInt(duration.split(':')[1], 10) <= 60;

            videos.push({
              type: isShorts ? 'shorts' : 'video',
              title: v.title?.runs?.[0]?.text || v.headline?.simpleText || 'Vídeo sem título',
              url: isShorts ? `https://www.youtube.com/shorts/${vId}` : `https://www.youtube.com/watch?v=${vId}`,
              videoId: vId,
              views: viewText,
              viewsNumber: this.parseViewCount(viewText),
              published: v.publishedTimeText?.simpleText || '',
              duration,
              channel: v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || ''
            });
          }
        }

        // Formato 2: Shelf de Shorts
        if (obj.reelItemRenderer && obj.reelItemRenderer.videoId) {
          const r = obj.reelItemRenderer;
          const vId = r.videoId;
          if (!seenIds.has(vId)) {
            seenIds.add(vId);
            const viewText = r.viewCountText?.simpleText || 'N/A';
            videos.push({
              type: 'shorts',
              title: r.headline?.simpleText || r.title?.runs?.[0]?.text || 'Shorts sem título',
              url: `https://www.youtube.com/shorts/${vId}`,
              videoId: vId,
              views: viewText,
              viewsNumber: this.parseViewCount(viewText),
              published: '',
              duration: '< 60s (Shorts)',
              channel: ''
            });
          }
        }

        // Formato 3: Rich grid lockup
        if (obj.shortsLockupViewModel && obj.shortsLockupViewModel.entityId) {
          const s = obj.shortsLockupViewModel;
          const vId = s.entityId.replace('shorts-shelf-item-', '');
          if (vId && !seenIds.has(vId)) {
            seenIds.add(vId);
            const title = s.overlayMetadata?.primaryText?.content || 'Shorts';
            const viewText = s.overlayMetadata?.secondaryText?.content || 'N/A';
            videos.push({
              type: 'shorts',
              title,
              url: `https://www.youtube.com/shorts/${vId}`,
              videoId: vId,
              views: viewText,
              viewsNumber: this.parseViewCount(viewText),
              published: '',
              duration: '< 60s (Shorts)',
              channel: ''
            });
          }
        }

        for (const key of Object.keys(obj)) {
          traverse(obj[key]);
        }
      };

      traverse(data);

      let filteredResults = videos;
      if (options.type === 'shorts') {
        const onlyShorts = videos.filter(v => v.type === 'shorts');
        if (onlyShorts.length > 0) filteredResults = onlyShorts;
      } else if (options.type === 'video') {
        const onlyLong = videos.filter(v => v.type === 'video');
        if (onlyLong.length > 0) filteredResults = onlyLong;
      }

      // Ordena por visualizações se solicitado
      if (options.sortBy === 'views') {
        filteredResults.sort((a, b) => b.viewsNumber - a.viewsNumber);
      }

      const topCandidates = filteredResults.slice(0, maxResults);

      // Enriquece em paralelo os metadados reais (data exata, canal e contagem confirmada)
      await Promise.all(
        topCandidates.map(async (v) => {
          const details = await this.fetchVideoDetails(v.videoId);
          if (details.uploadDate) {
            v.uploadDate = details.uploadDate;
          }
          if (details.published) {
            v.published = details.published;
          }
          if (details.channel && !v.channel) {
            v.channel = details.channel;
          }
          if (details.exactViews && details.exactViews > v.viewsNumber) {
            v.viewsNumber = details.exactViews;
          }
        })
      );

      return {
        success: true,
        query,
        total: filteredResults.length,
        results: topCandidates
      };
    } catch (err: any) {
      console.error('[YouTubeService] Erro na busca:', err.message);
      return {
        success: false,
        query,
        total: 0,
        results: [],
        error: err.message
      };
    }
  }
}

export const youtubeService = new YouTubeService();
