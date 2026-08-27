# 🧠 Seção F - Classificador ML Avançado - Resumo Completo

## 🎯 Objetivo

Implementar sistema avançado de machine learning para categorização automática de transações com:
- Aprendizado contínuo baseado em feedback do usuário
- Detecção de padrões automáticos
- Ajuste dinâmico de confiança
- Feedback loop para melhoria progressiva
- Interface de gerenciamento de padrões

## ✅ Trabalho Realizado

### Backend - ML Classifier Module

#### 1. Entities (2 arquivos)

**MLFeedback Entity** (100 linhas)
```
├── Id, UserId, ExpenseId
├── Description (texto original)
├── SuggestedCategoryId (previsão do modelo)
├── CorrectCategoryId (categoria real/corrigida)
├── OriginalConfidence (confiança da sugestão 0-1)
├── FeedbackType enum: correct | incorrect | partial
├── IsPositive (boolean: se foi feedback positivo)
├── Notes (anotações do usuário)
├── Metadata (source, establishmentHint, timeToCorrect, reason)
├── Soft deletes + timestamps
└── Índices: userId, (userId, createdAt), (userId, isPositive), categoryId
```

**MLPattern Entity** (100 linhas)
```
├── Id, UserId, CategoryId
├── PatternType enum: keyword | regex | establishment | amount_range | time_based | multi_criteria
├── Pattern (texto do padrão em si)
├── Confidence (0-1, baseado em histórico)
├── MatchCount (quantas vezes foi usado)
├── LastMatchedAt (timestamp)
├── Status enum: auto | approved | rejected
├── Description (descrição humana)
├── Metadata (keywords[], establishments[], amountMin/Max, daysOfWeek[], derivedFrom)
├── Soft deletes + timestamps
└── Índices: userId, (userId, categoryId), (userId, confidence)
```

#### 2. DTOs (1 arquivo)

```
CreateMLFeedbackDto:
├── description (string)
├── expenseId (uuid, optional)
├── suggestedCategoryId (uuid, optional)
├── correctCategoryId (uuid, required)
├── originalConfidence (0-1, optional)
├── feedbackType (enum, optional)
├── notes (string, optional)
└── metadata (object, optional)

GetMLFeedbackStatsDto:
├── totalFeedback (int)
├── correctCount, incorrectCount, partialCount
├── accuracyRate (0-1)
├── mostCorrectedCategories (array com count e percentage)
└── recentFeedback (últimas feedback com detalhes)

MLPredictionDto:
├── categoryId, categoryName
├── confidence (0-1)
├── reasons (array de strings)
└── alternativeSuggestions (top 3 alternatives)
```

#### 3. Services (1 arquivo - 600+ linhas)

**MLClassifierService**

**predict(user, description, establishment?, amount?, date?)** - Predição com múltiplas estratégias:
1. Busca todos os padrões aprendidos do usuário (ordenados por confiança)
2. Score cada padrão contra a transação
3. Aplica weightings diferentes:
   - Keyword match: 0.8 strength
   - Regex match: 0.9 strength
   - Establishment: 0.85 strength
   - Amount range: 0.6 strength
   - Time-based: 0.5 strength
   - Multi-criteria: combinação
4. Fallback para ClassificationRulesService se nada encontrar
5. Retorna melhor match com alternativas

**recordFeedback(user, dto)** - Registra feedback do usuário:
1. Cria registro MLFeedback
2. Chama updatePatternsFromFeedback() para aprendizado
3. Se incorreto: cria novo padrão para categoria correta
4. Se sugestão foi errada: diminui confiança do padrão antigo

**updatePatternsFromFeedback(userId, feedback)** - Feedback loop:
- Se correto: aumenta confiança (+0.03)
- Se incorreto: cria/atualiza padrão para categoria correta
- Extrai keywords principais
- Cria múltiplos padrões (um para cada keyword)
- Atualiza matchCount e confiança

**predict() - Matching de padrões**:
```
For each pattern:
  if pattern.type == 'keyword':
    matched = description.includes(pattern)
    strength = 0.8
  
  else if pattern.type == 'regex':
    regex = new RegExp(pattern)
    matched = regex.test(description)
    strength = 0.9
  
  else if pattern.type == 'establishment':
    matched = establishment.includes(pattern)
    strength = 0.85
  
  else if pattern.type == 'amount_range':
    matched = amount >= min AND amount <= max
    strength = 0.6
  
  else if pattern.type == 'time_based':
    dayOfWeek = date.getDay()
    matched = daysOfWeek.includes(dayOfWeek)
    strength = 0.5
  
  categoryScore += pattern.confidence * strength
```

**extractKeywords(description)** - Extração de keywords:
- Normaliza (uppercase, trim)
- Remove stopwords (O, A, DE, DA, DO, etc)
- Filtra palavras > 3 caracteres
- Retorna top 3 palavras principais

**trainModel(userId)** - Treino em batch:
1. Limpa padrões antigos (status='auto')
2. Busca todo o feedback do usuário
3. Reconstrói padrões baseado em feedback
4. Calcula accuracy testando todas as transações
5. Retorna { patternCount, accuracy }

**getFeedbackStats(user)** - Estatísticas de desempenho:
- Total, correct, incorrect, partial counts
- Accuracy rate (correct / total)
- Categorias mais corrigidas (com percentual)
- Últimas feedback com detalhes

Métodos adicionais:
- getPatterns(user, limit) - Listar padrões
- deletePattern(user, patternId) - Deletar
- approvePattern(user, patternId) - Aprovar (+10% confiança)
- rejectPattern(user, patternId) - Rejeitar (confidence = 0)

#### 4. Controller (1 arquivo - 80 linhas)

8 endpoints:
```
GET  /api/v1/ml-classifier/predict
     query: description, establishment?, amount?, date?
     retorna: MLPredictionDto

POST /api/v1/ml-classifier/feedback
     body: CreateMLFeedbackDto
     retorna: MLFeedback

GET  /api/v1/ml-classifier/feedback/stats
     retorna: GetMLFeedbackStatsDto

GET  /api/v1/ml-classifier/patterns
     query: limit (default 50)
     retorna: MLPattern[]

PUT  /api/v1/ml-classifier/patterns/:id/approve
     retorna: MLPattern

PUT  /api/v1/ml-classifier/patterns/:id/reject
     retorna: MLPattern

DELETE /api/v1/ml-classifier/patterns/:id
       retorna: 204 No Content

POST /api/v1/ml-classifier/train
     retorna: { patternCount, accuracy }
```

#### 5. Module (1 arquivo)

```
Imports:
├── TypeOrmModule.forFeature([MLFeedback, MLPattern])
├── ClassificationRulesModule
├── ExpensesModule
└── CategoriesModule

Providers: MLClassifierService
Controllers: MLClassifierController
Exports: MLClassifierService
```

#### 6. Migrations (2 arquivos - 240 linhas total)

**Migration 008: ml_feedback table**
- 14 colunas
- 4 foreign keys (users, expenses, categories)
- 4 índices (userId, userId+createdAt, userId+isPositive, categoryId)
- Soft deletes

**Migration 009: ml_patterns table**
- 13 colunas
- 2 foreign keys (users, categories)
- 3 índices (userId, userId+categoryId, userId+confidence)
- Soft deletes

### Frontend - ML Classifier

#### 1. Hook (1 arquivo - 250 linhas)

**useMLClassifier**

State:
```
- prediction: MLPrediction | null
- patterns: MLPattern[]
- feedbackStats: MLFeedback | null
- isLoading: boolean
- isTraining: boolean
- error: string | null
```

Methods:
```
predict(description, establishment?, amount?, date?)
  → retorna MLPredictionDto
  → salva em prediction state

recordFeedback(description, categoryId, suggestedId?, type?, notes?, expenseId?)
  → POST /ml-classifier/feedback
  → atualiza feedbackStats

fetchFeedbackStats()
  → GET /ml-classifier/feedback/stats
  → popula feedbackStats

fetchPatterns(limit)
  → GET /ml-classifier/patterns?limit=50
  → popula patterns

approvePattern(patternId)
  → PUT /ml-classifier/patterns/:id/approve
  → recarrega patterns

rejectPattern(patternId)
  → PUT /ml-classifier/patterns/:id/reject
  → recarrega patterns

deletePattern(patternId)
  → DELETE /ml-classifier/patterns/:id
  → recarrega patterns

trainModel()
  → POST /ml-classifier/train
  → retorna { patternCount, accuracy }
  → recarrega patterns e feedbackStats
```

#### 2. Components (2 arquivos)

**ClassificationFeedback.tsx** (150 linhas)
```
Props:
├── transactionId? (uuid)
├── description (string)
├── suggestedCategoryId? (uuid)
├── suggestedCategoryName? (string)
├── actualCategoryId (uuid)
├── actualCategoryName (string)
├── onFeedbackRecorded? (callback)
└── isLoading? (boolean)

Features:
├── Botão expandível mostrando status
├── Se clicar, expande com detalhes
├── Mostra:
│  ├── Descrição original
│  ├── Categoria sugerida vs atual
│  ├── Indicador visual (✅ correto ou ❓ verificar)
│  └── Campo textarea para notas
├── Botões: Cancelar, Registrar Feedback
├── Feedback visual após envio (✓ sucesso)
└── Auto-fecha após 2 segundos

Cores:
├── Blue: formulário principal
├── Orange: sugestão do modelo
├── Green: categoria correta
└── Yellow: indicador de correção
```

**MLPatternsPanel.tsx** (300 linhas)
```
Props:
└── onPatternApproved? (callback)

Features:
├── Botão expandível: "🧠 Padrões ML Aprendidos"
├── Ao expandir mostra:
│  ├── 📊 Estatísticas do modelo:
│  │  ├── Total de feedback
│  │  ├── Taxa de acurácia
│  │  ├── Corretos vs Incorretos
│  │  └── Mais corrigidos
│  ├── 🚀 Botão "Treinar modelo com histórico"
│  ├── Lista de padrões (máx 20 com scroll):
│  │  ├── Padrão em destaque (monospace)
│  │  ├── Status badge (✓ approved, ✗ rejected, ◯ auto)
│  │  ├── Tipo com emoji (🔤 keyword, 🔍 regex, etc)
│  │  ├── Categoria
│  │  ├── Confiança (%)
│  │  ├── Match count
│  │  ├── Último uso
│  │  └── Botões: Aprovar, Rejeitar, Deletar
│  └── Botão Fechar
├── Cores:
│  ├── Purple: painel principal
│  ├── Green: aprovar
│  ├── Red: rejeitar
│  └── Gray: deletar
└── Estados:
   ├── Vazio: "Nenhum padrão aprendido"
   ├── Loading: "Carregando padrões..."
   └── Preenchido: mostra padrões com scroll
```

## 📊 Estatísticas Seção F

### Código Criado
- **Arquivos Backend:** 5 (2 entities, 1 dto file, 1 service, 1 controller, 1 module)
- **Arquivos Frontend:** 3 (1 hook, 2 components)
- **Migrations:** 2
- **Total:** 10 arquivos

### Linhas de Código
- **Backend:** ~1.400 linhas
  - Entities: 200
  - DTOs: 60
  - Service: 600+
  - Controller: 80
  - Module: 30
  - Migrations: 240
- **Frontend:** ~700 linhas
  - Hook: 250
  - Components: 450
- **Total:** ~2.100 linhas

### Endpoints Novos
- 8 endpoints de ML Classifier
- Total Fase 3: 8+ endpoints

## 🔧 Recursos Técnicos Implementados

### ML/AI Features
- Previsão com múltiplos critérios (keywords, regex, estabelecimento, valor, data)
- Feedback loop (usuário corrige → modelo aprende)
- Extração automática de keywords
- Padrão multi-tipo (6 tipos diferentes)
- Weighting de força de match (0.5-0.9)
- Confiança dinâmica (0-1 com ajustes)
- Treino em batch (treinar todo o histórico)
- Fallback automático (padrões → regras → nada)

### Machine Learning Algorithm
```
Score = Σ(pattern.confidence × matchStrength)

MatchStrength por tipo:
- Keyword: 0.8 se encontrado
- Regex: 0.9 se encontrado
- Establishment: 0.85 se encontrado
- Amount: 0.6 se dentro do range
- Time: 0.5 se dia da semana match
- Multi: combinação customizada
```

### Accuracy Improvement
- Inicial: confidence = 0.6 (baseline)
- Por match positivo: +0.03
- Por aprovação: +0.10
- Por rejeição automática: -0.05
- Máximo: 0.99 (nunca 1.0)

### User Feedback Types
- **Correct**: usuário concorda com sugestão (feedback positivo)
- **Incorrect**: usuário corrige (aprendizado ativo)
- **Partial**: parcialmente correto (para casos ambíguos)

### Pattern Types
1. **Keyword**: substring simples (ex: "IFOOD" → Alimentação)
2. **Regex**: expressão regular (ex: "^[A-Z]* (LTDA|ME|EPP)" → Empresa)
3. **Establishment**: nome do estabelecimento
4. **Amount Range**: faixa de valores (ex: 100-500 → categoria X)
5. **Time-based**: dias da semana (ex: sextas → gastos com lazer)
6. **Multi-criteria**: combinação de múltiplos critérios

## 🔐 Segurança

✅ User isolation em todas as queries
✅ JwtAuthGuard em todos endpoints
✅ Validação de DTOs
✅ Soft deletes para auditoria
✅ Feedback armazenado para compliance
✅ Sem dados sensíveis nos padrões
✅ Índices para performance

## 📈 Performance

✅ Índices em userId, confidence, matchCount
✅ Patterns cacheados em memória durante predict()
✅ Soft delete não impacta query (deletedAt IS NULL)
✅ Batch training com limite (não treina full history se >10k feedbacks)
✅ Feedback stats com agregação otimizada

## 🎯 Próximos Passos

### Seção G - Regras Customizadas Management
- [ ] UI completa para criar/editar regras
- [ ] Tester visual para regex
- [ ] Bulk apply rules
- [ ] Compartilhamento de regras

### Seção H - Testes E2E & Polish
- [ ] Testes Playwright
- [ ] Performance tests
- [ ] Integração com ImportReviewTable
- [ ] Polish de UI

### Integrações Futuras
- [ ] Integrar predict() com ImportReviewTable
- [ ] Integrar feedback com ExpenseForm
- [ ] WebSocket real-time para pattern updates
- [ ] ML avançado (TensorFlow.js, sklearn backend)

## 💡 Decisões Arquiteturais

### Abordagem de ML
- **Sem dependências pesadas**: Python ML seria ideal mas NestJS é mais prático
- **Heurístico + Histórico**: Combina regras determinísticas com padrões aprendidos
- **Incremental Learning**: Treina continuamente, não batch-only
- **Interpretável**: Usuário entende por que foi categorizado assim

### Storage de Padrões
- **Banco de Dados**: Persiste padrões com histórico completo
- **Não em-memory**: Permite recarregar/analisar histórico
- **JSON metadata**: Flexibilidade para novos tipos de padrão

### Confiança Dinâmica
- **Começa conservador** (0.6)
- **Sobe com acertos** (+0.03 por match)
- **Cai com erros** (-0.05)
- **Máximo 0.99** (nunca confiar 100%)

## 📋 Checklist de Implementação

### Backend
✅ MLFeedback entity com todas as relações
✅ MLPattern entity com types e metadata
✅ MLClassifierService com predict/train/feedback
✅ Controller com 8 endpoints
✅ Módulo com imports corretos
✅ Migrations com indices otimizados
✅ User isolation em todas queries

### Frontend
✅ useMLClassifier hook completo
✅ ClassificationFeedback component
✅ MLPatternsPanel com gerenciamento
✅ Estados de loading/error
✅ Cores e UI polida

### Integrações
⏳ Integrar com ImportReviewTable (próxima seção)
⏳ Integrar com ExpenseForm (próxima seção)
⏳ Treino automático em background (futuro)

---

## 🎓 Aprendizados Implementados

1. **Feedback Loop**: Cada correção do usuário melhora o modelo
2. **Multiple Match Types**: Um padrão não é suficiente (keywords + regex + estabelecimento)
3. **Confidence Scoring**: Calibração importante (não confiar demais cedo)
4. **Pattern Extraction**: Extração de keywords genérica funciona bem
5. **Soft Deletes**: Essencial para auditoria de ML

---

**Status:** ✅ Seção F COMPLETA (100%)
**Total Fase 3:** ~30% completo (Seções A, B, C, D, E, F de contexto histórico)
**Próxima:** Seção G (Regras Customizadas Management)

Desenvolvido com ❤️ para Casa Financeira
2026-08-25
