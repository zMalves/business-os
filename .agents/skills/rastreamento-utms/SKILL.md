---
name: rastreamento-utms
description: Implementação de tracking avançado, padronização de parâmetros UTM, API de conversões (CAPI) server-side e deduplicação de eventos.
---

# 🌐 Skill: Rastreamento Avançado, UTMs & CAPI

## 🎯 Objetivo
Blindar a infraestrutura de mensuração de dados da operação contra bloqueios de adblockers, iOS 14+ e cookies de terceiros, garantindo atribuição fidedigna de cada venda e lead gerado.

---

## 🏷️ Dicionário Padrão de Parâmetros UTM

Nunca utilize links sem UTMs em anúncios pagos. Siga a estrutura canônica:

```text
https://seusite.com.br/pagina/?utm_source=meta&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

### Significado de cada Parâmetro:
* `utm_source`: Origem do tráfego (`meta`, `google`, `tiktok`, `email`).
* `utm_medium`: Mídia ou canal de aquisição (`cpc`, `stories`, `reels`, `bio`).
* `utm_campaign`: Nome dinâmico da campanha (`{{campaign.name}}` no Meta).
* `utm_content`: Nome dinâmico do criativo (`{{ad.name}}` no Meta).
* `utm_term`: Nome dinâmico do conjunto de anúncios (`{{adset.name}}` no Meta).

---

## ⚡ API de Conversões do Meta (CAPI) Server-Side

O pixel tradicional via JavaScript no navegador perde entre 20% a 40% dos dados reais de conversão. A API de Conversões envia os eventos diretamente do servidor:

### Pilares de Configuração CAPI:
1. **Deduplicação de Eventos:**
   * Enviar o mesmo parâmetro `event_id` tanto no disparo do pixel no navegador quanto no disparo via CAPI.
   * O Meta recebe os dois eventos e mescla em um só, evitando contagem duplicada.
2. **Qualidade de Correspondência de Evento (Event Quality Match Score):**
   * Enviar parâmetros de usuário criptografados em SHA-256: `em` (e-mail), `ph` (telefone com DDI e DDD), `fn` (primeiro nome), `client_ip_address` e `client_user_agent`.
   * **Meta de Qualidade:** Pontuação $\ge 8.0/10$ no Gerenciador de Eventos.

---

## 🔍 Teste e Validação em Tempo Real

* **Meta Pixel Helper:** Extensão do navegador para checar se os eventos `PageView`, `ViewContent`, `Lead` e `Purchase` disparam com os valores corretos.
* **Aba "Testar Eventos" no Gerenciador:** Validar se os eventos aparecem com o rótulo "Navegador e Servidor" (deduplicados com sucesso).

---

## ✅ Checklist de Rastreamento
- [ ] O domínio está verificado na Central de Segurança do Business Manager.
- [ ] O protocolo de mensuração de eventos agregados foi configurado com prioridades corretas.
- [ ] As UTMs estão preenchidas no campo "Parâmetros de URL" de todos os anúncios.
- [ ] Nenhum parâmetro pessoal (PII) sensível está sendo enviado sem hash criptográfico.
