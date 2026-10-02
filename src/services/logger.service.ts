export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';
export type LogCategory = 'system' | 'whatsapp' | 'agent' | 'ai' | 'webhook' | 'task' | 'deploy';

export interface LogEntry {
  id: string;
  timestamp: string; // ISO string
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata?: any;
}

export interface GetLogsOptions {
  limit?: number;
  category?: string;
  level?: string;
  search?: string;
  sinceId?: string;
}

export class LoggerService {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private idCounter: number = 0;

  constructor() {
    this.system('Sistema de Logs inicializado com sucesso.');
  }

  private addLog(level: LogLevel, category: LogCategory, message: string, metadata?: any): LogEntry {
    this.idCounter++;
    const entry: LogEntry = {
      id: `log_${Date.now()}_${this.idCounter}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      metadata: metadata ? (typeof metadata === 'object' ? JSON.parse(JSON.stringify(metadata)) : metadata) : undefined,
    };

    this.logs.push(entry);

    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }

    const icon = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
    console.log(`[${entry.timestamp}] [${category.toUpperCase()}] ${icon} ${message}`);

    return entry;
  }

  log(level: LogLevel, category: LogCategory, message: string, metadata?: any) {
    return this.addLog(level, category, message, metadata);
  }

  info(category: LogCategory, message: string, metadata?: any) {
    return this.addLog('info', category, message, metadata);
  }

  warn(category: LogCategory, message: string, metadata?: any) {
    return this.addLog('warn', category, message, metadata);
  }

  error(category: LogCategory, message: string, metadata?: any) {
    return this.addLog('error', category, message, metadata);
  }

  success(category: LogCategory, message: string, metadata?: any) {
    return this.addLog('success', category, message, metadata);
  }

  whatsapp(message: string, metadata?: any, level: LogLevel = 'info') {
    return this.addLog(level, 'whatsapp', message, metadata);
  }

  agent(message: string, metadata?: any, level: LogLevel = 'info') {
    return this.addLog(level, 'agent', message, metadata);
  }

  ai(message: string, metadata?: any, level: LogLevel = 'info') {
    return this.addLog(level, 'ai', message, metadata);
  }

  webhook(message: string, metadata?: any, level: LogLevel = 'info') {
    return this.addLog(level, 'webhook', message, metadata);
  }

  system(message: string, metadata?: any, level: LogLevel = 'info') {
    return this.addLog(level, 'system', message, metadata);
  }

  deploy(message: string, metadata?: any, level: LogLevel = 'info') {
    return this.addLog(level, 'deploy', message, metadata);
  }

  getLogs(options: GetLogsOptions = {}): { total: number; logs: LogEntry[] } {
    let filtered = [...this.logs];

    if (options.category && options.category !== 'all') {
      const cat = options.category.toLowerCase();
      filtered = filtered.filter((l) => l.category.toLowerCase() === cat);
    }

    if (options.level && options.level !== 'all') {
      const lvl = options.level.toLowerCase();
      filtered = filtered.filter((l) => l.level.toLowerCase() === lvl);
    }

    if (options.search && options.search.trim().length > 0) {
      const q = options.search.toLowerCase().trim();
      filtered = filtered.filter((l) => {
        const msgMatch = l.message.toLowerCase().includes(q);
        const metaMatch = l.metadata ? JSON.stringify(l.metadata).toLowerCase().includes(q) : false;
        return msgMatch || metaMatch;
      });
    }

    if (options.sinceId) {
      const idx = filtered.findIndex((l) => l.id === options.sinceId);
      if (idx !== -1) {
        filtered = filtered.slice(idx + 1);
      }
    }

    const total = filtered.length;
    const limit = options.limit ? Math.min(Math.max(1, options.limit), 500) : 200;
    
    const sliced = filtered.slice(-limit);

    return {
      total,
      logs: sliced,
    };
  }

  clear() {
    this.logs = [];
    this.system('Buffer de logs limpo pelo usuário.');
    return { success: true, message: 'Logs limpos com sucesso.' };
  }
}

export const loggerService = new LoggerService();
