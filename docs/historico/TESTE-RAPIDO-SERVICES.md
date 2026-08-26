# ⚡ TESTE RÁPIDO DOS SERVICES

## 1️⃣ Verificar Estrutura

```bash
# Ir para diretório do projeto
cd /tmp/casa-financeira/backend

# Verificar se todos os services foram criados
ls -lh src/modules/ai/services/

# Resultado esperado:
# -rw-r--r-- ai-assistant.service.ts
# -rw-r--r-- anomaly-detector.service.ts
# -rw-r--r-- behavior-analyzer.service.ts
# -rw-r--r-- forecast.service.ts
# -rw-r--r-- intent-detector.service.ts
# -rw-r--r-- recommendations.service.ts
```

## 2️⃣ Validar Sintaxe TypeScript

```bash
# Compilar TypeScript para verificar erros
npx tsc --noEmit

# Ou rodar o linter
npm run lint
```

## 3️⃣ Executar Migration

```bash
# Criar conexão com BD (se necessário)
# Configurar .env com DATABASE_URL

# Rodar a migration
npm run typeorm migration:run

# Verificar tabelas criadas
psql $DATABASE_URL -c "\dt ai_*"
```

## 4️⃣ Iniciar Servidor

```bash
# Desenvolvimento
npm run start:dev

# Ou produção
npm run build
npm run start:prod
```

## 5️⃣ Testar Endpoints

### Test 1: Chat - Enviar mensagem
```bash
curl -X POST http://localhost:3000/api/v1/families/test-family/ai/chat \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Quanto gastei com alimentação este mês?"
  }'
```

**Response Esperado**:
```json
{
  "id": "uuid",
  "question": "Quanto gastei com alimentação este mês?",
  "answer": "Os gastos com alimentação estão categorizados...",
  "intent": "QUERY",
  "confidence": 90,
  "followUpQuestions": [
    "Como isso se compara ao mês anterior?",
    "Qual foi meu maior gasto?",
    "Posso economizar nesta categoria?"
  ],
  "sources": [],
  "generatedAt": "2026-08-25T10:00:00Z"
}
```

---

### Test 2: Recomendações - Listar
```bash
curl -X GET "http://localhost:3000/api/v1/families/test-family/recommendations?priority=HIGH&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response Esperado**:
```json
{
  "recommendations": [
    {
      "id": "rec-123",
      "type": "CATEGORY_HIGH",
      "title": "Reduzir gastos com alimentação",
      "description": "Seu gasto com alimentação cresceu 25% vs mês anterior",
      "potentialSavings": 450,
      "relevance": 95,
      "impact": 85,
      "ease": 70,
      "priority": "HIGH",
      "score": 83.75,
      "isDismissed": false
    }
  ],
  "total": 5,
  "hasMore": false
}
```

---

### Test 3: Análise - Comportamento
```bash
curl -X GET "http://localhost:3000/api/v1/families/test-family/analysis/behavior?period=LAST_6_MONTHS" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response Esperado**:
```json
{
  "period": "LAST_6_MONTHS",
  "summary": {
    "totalTransactions": 127,
    "totalExpenses": 25400,
    "averageTransaction": 200,
    "standardDeviation": 150
  },
  "patterns": [
    {
      "name": "Café Diário",
      "frequency": "daily",
      "occurrences": 22,
      "category": "Alimentação",
      "averageValue": 12.5,
      "confidence": 95
    }
  ],
  "anomalies": [],
  "insights": [
    "Padrão detectado: gastos maiores no início do mês",
    "Correlação forte entre combustível e lazer"
  ],
  "generatedAt": "2026-08-25T10:00:00Z"
}
```

---

### Test 4: Previsões - 90 dias
```bash
curl -X GET "http://localhost:3000/api/v1/families/test-family/forecasts/next-90-days" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response Esperado**:
```json
{
  "id": "forecast-uuid",
  "forecastType": "TOTAL",
  "period": "90_DAYS",
  "predictions": [
    {
      "date": "2026-08-26",
      "predictedValue": 165.50,
      "lowerBound": 120,
      "upperBound": 180,
      "confidence": 0.9
    },
    // ... mais 89 dias
  ],
  "summary": {
    "averagePredicted": 165,
    "minPredicted": 120,
    "maxPredicted": 180,
    "trend": "STABLE",
    "modelUsed": "ENSEMBLE",
    "accuracy": 87,
    "confidence": 0.85
  },
  "scenarios": {
    "bestCase": 120,
    "expectedCase": 165,
    "worstCase": 200
  },
  "generatedAt": "2026-08-25T10:00:00Z"
}
```

---

### Test 5: Anomalias - Listar
```bash
curl -X GET "http://localhost:3000/api/v1/families/test-family/analysis/anomalies?severity=HIGH&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response Esperado**:
```json
{
  "anomalies": [
    {
      "id": "anom-123",
      "transactionId": "tx-456",
      "type": "SPIKE",
      "severity": "HIGH",
      "anomalyScore": 0.95,
      "reason": "Valor (R$ 1500) está 250% acima da média",
      "suggestedAction": "Revisar esta transação e confirmar se é legítima",
      "isConfirmed": false,
      "confirmationStatus": null,
      "detectedAt": "2026-08-25T10:00:00Z"
    }
  ],
  "total": 3,
  "hasMore": false
}
```

---

## ✅ Checklist de Validação

- [ ] Todos os 6 services compilam sem erros
- [ ] Migration executa sem erros
- [ ] Tabelas são criadas no BD
- [ ] Índices são criados corretamente
- [ ] Endpoints respondem com status 200
- [ ] Responses têm estrutura esperada
- [ ] User isolation funciona (não retorna dados de outro usuário)
- [ ] Soft delete funciona (deletados não aparecem nas queries)

## 📝 Notas Importantes

1. **JWT Token**: Certifique-se de que o token JWT é válido
2. **Family ID**: Use um ID de família real ou crie uma para teste
3. **Database**: PostgreSQL deve estar rodando
4. **Timezone**: Todas as datas estão em UTC

## 🔍 Troubleshooting

### Erro: "Cannot find module"
```bash
# Certifique-se que está importando corretamente
cd src/modules/ai/services
ls *.service.ts  # Deve listar todos os 6 services
```

### Erro: "Service not provided"
```bash
# Verifiquer ai.module.ts
cat src/modules/ai/ai.module.ts
# Deve ter todos os 6 services em 'providers' e 'exports'
```

### Erro: Migration não encontrada
```bash
# Verificar se o arquivo de migration existe
ls -lh src/database/migrations/015-*.ts
```

---

**Status**: Pronto para teste! 🚀
