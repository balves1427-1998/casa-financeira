#!/bin/bash
# O caso real: despesa recorrente cadastrada no mês corrente. A ocorrência do
# próprio mês fica só em `expenses`, e antes desta correção não gerava aviso
# nenhum — a projeção do Planejado começa no mês SEGUINTE.
set -u
API=http://localhost:3999
J='Content-Type: application/json'
ok=0; falhou=0

conf() {
  if [ "$2" = "$3" ]; then echo "  OK   $1 = $3"; ok=$((ok+1));
  else echo "  FALHA $1 -> esperado $2, obtido $3"; falhou=$((falhou+1)); fi
}

# Vence daqui a 2 dias: dentro da janela de 3 dias de antecedência.
VENC=$(date -d "+2 days" +%Y-%m-%d)
HOJE=$(date +%Y-%m-%d)
ONTEM=$(date -d "-1 day" +%Y-%m-%d)

EMAIL="lembrete$RANDOM@casa.test"
TOKEN=$(curl -s -X POST $API/auth/register -H "$J" \
  -d "{\"name\":\"Giovanna Teste\",\"email\":\"$EMAIL\",\"password\":\"Senha@12345\",\"confirmPassword\":\"Senha@12345\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
[ -z "$TOKEN" ] && { echo "não consegui autenticar"; exit 1; }
A="Authorization: Bearer $TOKEN"

CONTA=$(curl -s -X POST $API/accounts -H "$J" -H "$A" \
  -d '{"name":"Corrente","type":"checking","institution":"Nubank","initialBalance":3000}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

echo "== 1. despesa recorrente cadastrada com vencimento neste mes =="
LUZ=$(curl -s -X POST $API/expenses -H "$J" -H "$A" -d "{
  \"description\":\"Luz\",\"amount\":415.94,\"date\":\"$VENC\",
  \"category\":\"Moradia\",\"responsible\":\"giovanna\",
  \"paymentMethod\":\"debit\",\"accountId\":\"$CONTA\",
  \"isRecurring\":true,\"frequency\":\"monthly\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
PAGA=$(curl -s $API/expenses/$LUZ -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["isPaid"])')
conf "nasce nao paga (data futura)" "False" "$PAGA"

echo "== 2. o Planejado NAO tem essa ocorrencia — so as seguintes =="
NOMES=$(curl -s $API/planned-accounts -H "$A" | python3 -c "
import sys,json
d=json.load(sys.stdin); l=d if isinstance(d,list) else d.get('data',[])
print(sum(1 for p in l if str(p['dueDate'])[:10]=='$VENC'))")
conf "ocorrencia do mes no planejado" "0" "$NOMES"

echo "== 3. o saldo NAO desconta o que ainda nao foi pago =="
SALDO=$(curl -s $API/accounts/balance/total -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totalBalance"])')
conf "saldo intacto" "3000" "$SALDO"

echo "== 4. o disparo AVISA sobre a despesa =="
DISP=$(curl -s -X POST $API/reminders/dispatch -H "$J" -H "x-reminder-token: token-de-teste-local" -d '{"window":"morning"}')
AVAL=$(echo "$DISP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("contasAvaliadas","?"))')
conf "compromissos avaliados" "1" "$AVAL"

echo "== 5. o registro aponta para a despesa =="
ORIG=$(curl -s $API/reminders/status -H "$A" | python3 -c '
import sys,json
d=json.load(sys.stdin); e=d["ultimosEnvios"]
print(e[0]["origem"] if e else "nenhum", e[0]["conta"] if e else "")')
conf "origem do aviso" "despesa" "$(echo $ORIG | cut -d" " -f1)"
conf "id avisado" "$LUZ" "$(echo $ORIG | cut -d" " -f2)"

echo "== 6. rodar de novo na mesma janela nao duplica =="
# Sem e-mail configurado neste ambiente o envio falha, entao `jaEnviados` nao
# serve de prova: uma tentativa falha deve mesmo ser repetida. Quem garante a
# nao-duplicacao e o indice unico parcial — conferido na fonte.
curl -s -X POST $API/reminders/dispatch -H "$J" -H "x-reminder-token: token-de-teste-local" -d '{"window":"morning"}' > /dev/null
LINHAS=$(su postgres -c "psql -d casa_e2e -tAc \"SELECT count(*) FROM payment_reminders WHERE \\\"expenseId\\\"='$LUZ'\"")
conf "uma linha de lembrete apos dois disparos" "1" "$LINHAS"

echo "== 7. compra no cartao NAO gera aviso — quem vence e a fatura =="
CARD=$(curl -s -X POST $API/credit-cards -H "$J" -H "$A" \
  -d '{"name":"Nubank","bank":"Nubank","cardNumber":"1234","limit":5000,"closingDay":25,"dueDay":5}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))')
curl -s -X POST $API/expenses -H "$J" -H "$A" -d "{
  \"description\":\"Compra no cartao\",\"amount\":300,\"date\":\"$VENC\",
  \"category\":\"Compras\",\"responsible\":\"giovanna\",
  \"paymentMethod\":\"credit\",\"creditCardId\":\"$CARD\"}" > /dev/null
AVAL=$(curl -s -X POST $API/reminders/dispatch -H "$J" -H "x-reminder-token: token-de-teste-local" -d '{"window":"evening"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("contasAvaliadas","?"))')
conf "cartao nao entrou na conta" "1" "$AVAL"

echo "== 8. marcar como paga ENCERRA o aviso e move o caixa =="
curl -s -X PATCH $API/expenses/$LUZ/pay -H "$J" -H "$A" -d '{"isPaid":true}' > /dev/null
AVAL=$(curl -s -X POST $API/reminders/dispatch -H "$J" -H "x-reminder-token: token-de-teste-local" -d '{"window":"morning"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("contasAvaliadas","?"))')
conf "nada mais a avisar" "0" "$AVAL"
SALDO=$(curl -s $API/accounts/balance/total -H "$A" | python3 -c 'import sys,json;print(json.load(sys.stdin)["totalBalance"])')
conf "saldo apos pagar" "2584.06" "$SALDO"

echo
echo "RESULTADO: $ok OK, $falhou falha(s)"
[ $falhou -eq 0 ]
