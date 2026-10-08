---
name: estrategia-campanha
description: Arquitetura e estrutura de campanhas de tráfego pago, definindo alocação de orçamento (CBO vs ABO), esteira de aprendizado de máquina e padrão de nomenclatura.
---

# 🏗️ Skill: Estratégia e Arquitetura de Campanhas

## 🎯 Objetivo
Estruturar contas de anúncios com arquitetura enxuta e escalável, eliminando sobreposição interna de leilões e acelerando a saída da fase de aprendizado dos algoritmos.

---

## 🏛️ Estrutura Operacional Recomendada

### 1. Piloto / Validação Rápida (1-1-4 em CBO)
* **Objetivo:** Validação com orçamento reduzido (ex: R$ 30/dia) e máxima velocidade.
* **Estrutura:**
  * 1 Campanha (CBO / Advantage Campaign Budget).
  * 1 Conjunto de Anúncios (Público Aberto ou Segmentação Ampla com Exclusões).
  * 4 Criativos variados (2 vídeos + 2 estáticos de ângulos distintos).
* **Mecanismo:** A IA distribui a verba dinamicamente para o criativo que gerar conversa/conversão no menor CPA.

### 2. Máquina de Aquisição & Escala (Estrutura 80/20)
* **Campanha de Escala (CBO - 80% do Orçamento Total):**
  * Contém apenas os criativos e conjuntos que já comprovaram CPA abaixo da meta.
  * Otimizada para o evento de conversão final (Lead, Purchase ou Conversa Iniciada).
* **Campanha de Teste Contínuo (ABO - 20% do Orçamento Total):**
  * Conjuntos com orçamento fixo diário pequeno (ex: R$ 15 a R$ 25 por conjunto).
  * 3 a 5 variações de criativos novos por semana.
  * O criativo que bater a meta de CPA por 3 dias consecutivos é graduado para a campanha de CBO de escala.

---

## 🏷️ Naming Convention Padrão (Rastreabilidade Absoluta)

Padronize todos os nomes para facilitar relatórios automatizados e filtros no Gerenciador:

```text
[NÍVEL DE CAMPANHA]:
[OBJETIVO]_[CANAL]_[OFERTA]_[MODALIDADE]_[VERSAO]
Ex: LEADS_META_TRAFEGO297_CBO_V1

[NÍVEL DE CONJUNTO]:
[FAIXA_ETARIA]_[GENERO]_[REGIAO]_[PUBLICO]_[EXCLUSOES]
Ex: 25-55_TODOS_CURITIBA-10KM_ABERTO_EXCLUI-LEADS

[NÍVEL DE ANÚNCIO]:
[FORMATO]_[ANGULO]_[GANCHO]_[ID_ARTE]
Ex: VIDEO_DOR_QUEIMAR-DINHEIRO_AD01
```

---

## ⚙️ Regras de Otimização Semanal

| Dia da Semana | Ação do Gestor / Agente |
|---|---|
| **Segunda-feira** | Análise de CPA semanal acumulado. Pausa de criativos que gastaram $2\times$ o CPA alvo sem nenhuma conversão. |
| **Quarta-feira** | Subida de novas artes para o conjunto de testes (ABO). Checagem de frequência. |
| **Sexta-feira** | Ajuste fino de orçamento (+15% a +20% nos conjuntos vencedores). Verificação de saldo e faturamento. |
| **Fim de Semana** | Não mexer no algoritmo (evitar reiniciar a fase de aprendizado durante o pico de tráfego de sábado/domingo). |

---

## ✅ Checklist de Configuração da Campanha
- [ ] O objetivo selecionado no Meta é **Leads** ou **Vendas** (nunca Tráfego para cliques soltos).
- [ ] O pixel/dataset e a API de conversões (CAPI) estão conectados e verificados no conjunto.
- [ ] O fuso horário da conta de anúncios está sincronizado com a localização do cliente (GMT-3).
- [ ] As exclusões de quem já converteu estão ativas no conjunto de aquisição.
- [ ] As regras automáticas de proteção de orçamento estão configuradas para pausar se o CPA estourar o teto.
