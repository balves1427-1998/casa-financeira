#!/bin/bash
# Verificação ponta a ponta do saldo derivado e da confirmação de recebimento,
# contra a API compilada e um Postgres de verdade.
set -u
API=http://localhost:3999
J='Content-Type: application/json'
ok=0; falhou=0

conf() { # nome | esperado | obtido
  if [ "$2" = "$3" ]; then echo "  OK   $1 = $3"; ok=$((ok+1));
  else echo "  FALHA $1 -> esperado $2, obtido $3"; falhou=$((falhou+1)); fi
}

EMAIL="saldo$RANDOM@casa.test"
TOKEN=$(curl -s -X POST $API/auth/register -H "$J" \
  -d "{\"name\":\"Bruno Teste\",\"email\":\"$EMAIL\",\"password\":\"Senha@12345\",\"confirmPassword\":\"Senha@12345\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
[ -z "$TOKEN" ] && { echo "não consegui autenticar"; exit 1; }
A="Authorization: Bearer $TOKEN"

echo "== 1. conta cadastrada com saldo inicial de R\$ 1.000 =="
CONTA=$(curl -s -X POST $API/accounts -H "$J" -H "$A" \
  -d '{"name":"Corrente","type":"checking","institution":"Nubank","initialBalance":1000}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
SALDO=$(curl -s $API/accounts/balance/total -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totalBalance"])')
conf "saldo inicial" "1000" "$SALDO"

echo "== 2. despesa paga desconta do saldo (antes, nada mudava) =="
curl -s -X POST $API/expenses -H "$J" -H "$A" -d "{
  \"description\":\"Mercado\",\"amount\":200,\"date\":\"2026-08-10\",
  \"category\":\"Supermercado\",\"responsible\":\"bruno\",
  \"paymentMethod\":\"debit\",\"accountId\":\"$CONTA\"}" > /dev/null
SALDO=$(curl -s $API/accounts/balance/total -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totalBalance"])')
conf "saldo apos despesa" "800" "$SALDO"

echo "== 3. compra no cartao NAO desconta =="
CARD=$(curl -s -X POST $API/credit-cards -H "$J" -H "$A" \
  -d '{"name":"Nubank","bank":"Nubank","cardNumber":"1234","limit":5000,"closingDay":25,"dueDay":5}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
curl -s -X POST $API/expenses -H "$J" -H "$A" -d "{
  \"description\":\"Compra no cartao\",\"amount\":900,\"date\":\"2026-08-11\",
  \"category\":\"Compras\",\"responsible\":\"bruno\",
  \"paymentMethod\":\"credit\",\"creditCardId\":\"$CARD\"}" > /dev/null
SALDO=$(curl -s $API/accounts/balance/total -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totalBalance"])')
conf "saldo apos compra no cartao" "800" "$SALDO"

echo "== 4. entrada prevista: confirmar RECEBIMENTO soma nas receitas =="
PLAN=$(curl -s -X POST $API/planned-accounts -H "$J" -H "$A" -d "{
  \"description\":\"Salario Bruno\",\"type\":\"income\",\"category\":\"salary\",
  \"amount\":8500,\"dueDate\":\"2026-09-05\",\"responsible\":\"bruno\",
  \"accountId\":\"$CONTA\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X PATCH $API/planned-accounts/$PLAN/mark-as-paid -H "$J" -H "$A" \
  -d '{"paymentDate":"2026-09-05"}' > /dev/null
RECEITAS=$(curl -s $API/incomes -H "$A" | python3 -c '
import sys,json
d=json.load(sys.stdin); l=d if isinstance(d,list) else d.get("data",[])
print(len(l), sum(float(i["amount"]) for i in l), l[0]["date"][:10] if l else "")')
conf "receitas criadas" "1" "$(echo $RECEITAS | cut -d' ' -f1)"
conf "valor recebido" "8500.0" "$(echo $RECEITAS | cut -d' ' -f2)"
conf "data do recebimento" "2026-09-05" "$(echo $RECEITAS | cut -d' ' -f3)"

SALDO=$(curl -s $API/accounts/balance/total -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totalBalance"])')
conf "saldo apos receber" "9300" "$SALDO"

echo "== 5. o realizado do mes enxerga a receita =="
REAL=$(curl -s $API/planned-accounts/summary/9/2026 -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["receitasRealizadas"])')
conf "receitas realizadas em setembro" "8500" "$REAL"

echo "== 6. cada mes abre onde o anterior fechou =="
AGO=$(curl -s $API/cash-flow/statement/8/2026 -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["openingBalance"])')
SET=$(curl -s $API/cash-flow/statement/9/2026 -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["openingBalance"])')
conf "abertura de agosto" "1000" "$AGO"
conf "abertura de setembro" "800" "$SET"

echo "== 7. extrato bate com o saldo em caixa =="
FIM=$(curl -s $API/cash-flow/statement/9/2026 -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["closingBalance"])')
conf "fechamento de setembro = saldo atual" "9300" "$FIM"

echo "== 8. fatura paga sai do caixa na data do pagamento =="
FAT=$(curl -s -X POST $API/planned-accounts -H "$J" -H "$A" -d "{
  \"description\":\"Fatura Nubank\",\"type\":\"expense\",\"category\":\"Cartao\",
  \"amount\":900,\"dueDate\":\"2026-09-05\",\"responsible\":\"bruno\",
  \"creditCardId\":\"$CARD\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
# `invoiceCompetencia` nao e aceito pelo DTO de proposito: quem grava e a
# importacao da fatura. Aqui simulamos o que ela faz.
su postgres -c "psql -d casa_e2e -q -c \"UPDATE planned_accounts SET \\\"invoiceCompetencia\\\"='2026-08' WHERE id='$FAT';\"" > /dev/null
SALDO=$(curl -s $API/accounts/balance/total -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totalBalance"])')
conf "fatura prevista nao mexe no saldo" "9300" "$SALDO"
curl -s -X PATCH $API/planned-accounts/$FAT/mark-as-paid -H "$J" -H "$A" \
  -d '{"paymentDate":"2026-09-04"}' > /dev/null
SALDO=$(curl -s $API/accounts/balance/total -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totalBalance"])')
conf "saldo apos pagar a fatura" "8400" "$SALDO"

echo "== 9. a conta mostra o saldo derivado, nao o cadastrado =="
BAL=$(curl -s $API/accounts -H "$A" | python3 -c "
import sys,json
d=json.load(sys.stdin); l=d if isinstance(d,list) else d.get('data',[])
print(next(float(c['balance']) for c in l if c['id']=='$CONTA'))")
# A fatura foi paga sem conta de origem definida: entra no total da casa, mas
# nao pode ser debitada de uma conta que ela nao aponta.
conf "balance da conta (sem a fatura sem conta)" "9300.0" "$BAL"

echo "== 10. o total abre em saldo inicial + movimento, e denuncia o sem conta =="
DET=$(curl -s $API/accounts/balance/total -H "$A" | python3 -c '
import sys,json
d=json.load(sys.stdin)
print(d["saldoInicial"], d["movimento"], d["semConta"], d["totalBalance"])')
conf "saldo inicial cadastrado" "1000" "$(echo $DET | cut -d" " -f1)"
conf "movimento dos lancamentos" "7400" "$(echo $DET | cut -d" " -f2)"
conf "lancamentos sem conta" "-900" "$(echo $DET | cut -d" " -f3)"
conf "total = inicial + movimento" "8400" "$(echo $DET | cut -d" " -f4)"

echo
echo "RESULTADO: $ok OK, $falhou falha(s)"
[ $falhou -eq 0 ]
