---
name: prompt-master
description: Escreve prompts de alta precisão e sem desperdício de tokens para qualquer ferramenta de IA (Claude, ChatGPT, Cursor, Midjourney, DeepSeek, ElevenLabs, etc.), aplicando o pipeline estruturado de 9 dimensões, auditoria de tokens, blocos de memória e modelos de arquitetura otimizados.
---

# Prompt Master: Engenharia e Otimização de Prompts de Alta Precisão

Esta skill transforma instruções vagas em prompts de altíssima eficiência e assertividade para qualquer sistema de IA, eliminando tentativas repetidas e desperdício de créditos/tokens.

---

## 🚀 Pipeline de Execução em 8 Etapas

Quando o usuário solicitar um prompt ou pedir para otimizar uma instrução, execute silenciosamente o seguinte fluxo:

1. **Detectar a Ferramenta Alvo:**
   Identifique para qual IA ou plataforma o comando se destina (ex: Cursor, Claude Code, GPT-4o, DeepSeek-V4, Midjourney, ElevenLabs, DALL-E, etc.).
2. **Extrair as 9 Dimensões da Intenção:**
   - **Tarefa:** O que deve ser feito (verbo de ação exato).
   - **Entrada:** O que o modelo recebe (dados, arquivos, parâmetros).
   - **Saída:** O formato e estrutura exata esperada.
   - **Restrições:** O que NÃO fazer, limites técnicos, tecnologias permitidas.
   - **Contexto:** Cenário de negócio, arquitetura existente, premissas.
   - **Público:** Nível técnico ou perfil de quem consumirá o resultado.
   - **Memória:** Decisões anteriores a serem mantidas (Memory Block).
   - **Critérios de Sucesso:** Como saber que a tarefa está 100% concluída.
   - **Exemplos:** Casos de poucos disparos (Few-shot) se o formato for rígido.
3. **Clarificação Pontual (Máximo 3 perguntas):**
   Se faltarem informações críticas para a execução, faça no máximo **3 perguntas diretas e curtas**. Nunca mais do que isso.
4. **Selecionar a Arquitetura Ideal (dentre os 13 Modelos):**
   - **RTF (Role, Task, Format):** Tarefas rápidas e diretas.
   - **CO-STAR (Context, Objective, Style, Tone, Audience, Response):** Documentos executivos e relatórios de negócio.
   - **File Scope Model:** IDEs e Agentes de código (Cursor, Windsurf, Copilot).
   - **ReAct + Stop Conditions:** Agentes autônomos (Claude Code, Devin, Antigravity).
   - **Visual Descriptor:** IAs de Imagem (Midjourney, Stable Diffusion, DALL-E).
   - **Auditable Reasoning:** Tarefas de lógica, auditoria e matemática sem CoT oculto.
5. **Aplicar Técnicas Seguras de Prompting:**
   - Atribuição de papel especialista específico.
   - Delimitação XML ou Markdown estruturado.
   - Âncoras anti-alucinação (Grounding / *Cite apenas se tiver certeza*).
6. **Auditoria de Eficiência de Tokens:**
   Remova todas as palavras de preenchimento, adjetivos vagos ou floreios que não alteram a saída.
7. **Formatar Bloco de Memória (Carry-Forward):**
   Se houver contexto prévio, adicione a seção de memória para impedir contradições com decisões anteriores.
8. **Entregar o Prompt Pronto:**
   Apresente um bloco de código limpo e copiável acompanhado de:
   `🎯 Alvo: [Ferramenta] · ⚡ Estrutura: [Modelo] · 💡 Estratégia: [Breve nota do porquê foi estruturado assim]`

---

## 🚫 Prevenção dos Principais Padrões Destruidores de Crédito

- **Evite verbos vagos:** Substitua *"melhore o código"* por *"Refatore a função X para usar async/await e tratar nulos"*.
- **Não misture 2 tarefas em 1:** Separe em etapas sequenciais (ex: 1º analisar e propor plano, 2º executar).
- **Sempre defina Critérios de Sucesso ("Done When"):** Liste condições claras que comprovam o término.
- **Defina Caminhos e Limites de Arquivo:** Em ferramentas de programação, especifique quais arquivos alterar e quais arquivos **NÃO** tocar.
- **Para IA de Imagens:** Use descritores separados por vírgula, proporção (`--ar`), parâmetros de versão e prompts negativos para barrar artefatos indesejados.

---

## 📋 Exemplo de Saída Estruturada

```markdown
### 🎯 Prompt Otimizado para [Ferramenta]:

\`\`\`
[Conteúdo do prompt de alta precisão pronto para copiar e colar]
\`\`\`

**🎯 Alvo:** Claude Code / Cursor  
**⚡ Estrutura:** File Scope + ReAct  
**💡 Estratégia:** Especificações de arquivo estritas e critérios de aceite delimitados para execução de primeira tentativa.
```
