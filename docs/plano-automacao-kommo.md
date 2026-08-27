# Plano vivo — Automação Maria + Kommo CRM

> Documento em construção a partir da transcrição da reunião. As regras marcadas como pendentes não devem ser implementadas até serem confirmadas pelos próximos trechos.

## 1. Objetivo

Transformar a Maria em uma agente capaz de conversar naturalmente com o lead, coletar os dados necessários, preencher os campos reais da oportunidade no Kommo e avançar o atendimento somente quando os critérios de qualificação forem atendidos.

O prompt sozinho não executa operações no CRM. As ações citadas no prompt precisam ser implementadas como ferramentas reais, ligadas à API do Kommo.

## 2. Regras já confirmadas

- A automação principal é `Atendimento Inteligente com IA`.
- O agente se apresenta como Maria, consultora virtual da CWB Fight Club.
- A regra atua no `Funil de vendas`.
- O Kommo cria a tag `Contato Inicial` nas conversas novas.
- O bot verifica a tag, mas não cria nem remove `Contato Inicial`.
- A IA pode atuar nas fases anteriores a `Lead` enquanto a tag estiver presente.
- O escopo operacional explícito da Maria é somente `Contato Inicial` e `Primeiro Contato (Prioridade)`.
- Ao chegar à fase `Lead` ou a uma fase posterior, a IA não responde, mesmo que a tag continue no lead.
- O prompt personalizado da Maria e a base de conhecimento são fontes separadas.

## 3. Evidência adicionada pela transcrição

### Trecho entre 01:35 e 02:00

> “Da gente testar ali se tá colocando os dados no card, se tá passando de fase, se tá finalizando agendamento.”
>
> “Mas só pra não ter interferência aqui no dia a dia, só essa parte do gatilho ali a gente arrumar já tá bom.”

Conclusões:

- O fluxo completo terá três critérios de aceite observáveis no Kommo:
  1. dados coletados sendo gravados no card;
  2. passagem correta de fase;
  3. agendamento finalizado.
- A validação deve ocorrer em uma conversa controlada entre as partes, sem expor inicialmente todos os leads da operação.
- A correção do gatilho é a entrega imediata e prioritária para impedir interferência nas conversas do dia a dia.
- Preenchimento de campos, passagem de fase e agenda formam a etapa seguinte de implementação e teste.

### Trecho entre 03:45 e 03:59

Trecho recebido, aproximadamente entre `03:45` e `03:59`:

> “Porque ele tem que preencher os dados ali, certo?”
>
> “E eu tenho que ver como que faz isso no Kommo pela API.”

Interpretação funcional: durante a conversa, o agente precisa preencher campos do lead no Kommo por meio da API. Ainda falta identificar, na transcrição e na conta real, quais campos são obrigatórios e em qual momento cada um deve ser atualizado.

### Caso real — qualificação e agendamento concluído

Foi recebido um histórico real completo de uma lead que entrou em `CONTATO INICIAL`, foi qualificada, agendou uma aula experimental e posteriormente virou aluna. Os dados pessoais do histórico não são reproduzidos neste documento.

#### Sequência observada

1. A nova conversa entrou em `CONTATO INICIAL`.
2. O robô preencheu o telefone, adicionou `Em Atendimento IA` e definiu o responsável.
3. A Maria se apresentou e coletou, em conversa natural:
   - nome;
   - se o interesse era para a própria pessoa;
   - modalidade;
   - experiência anterior;
   - objetivo com o treino.
4. Após a resposta sobre o objetivo, o fluxo:
   - adicionou a tag `Lead Qualificado`;
   - preencheu o campo de objetivo;
   - moveu o lead de `CONTATO INICIAL` para `Primeiro contato (prioridade)`.
5. A Maria ofereceu a aula experimental e coletou:
   - unidade;
   - dia e horário desejados;
   - e-mail.
6. O fluxo enviou o formulário da unidade e aguardou a confirmação `Preenchido`.
7. Após reconfirmar o horário, preencheu `Data e hora aula experimental` e moveu o lead para `EXPERIMENTAL AGENDADO`.
8. Um robô posterior moveu o lead para `DIA DO AGENDAMENTO` e enviou o lembrete.
9. Depois da aula, o relacionamento passou a ser de aluno/pós-venda e ficou sob atendimento humano e outras automações, fora do escopo da Maria.

#### Campos efetivamente visíveis no histórico

| Campo | Origem | Momento observado |
| --- | --- | --- |
| `Telefone` | Robô do Kommo | Entrada da conversa |
| `Nome` | N8N/IA | Após a lead informar o nome |
| `Qual seu objetivo ao buscar essa atividade?` | N8N/IA | No fechamento da qualificação |
| `Unidade experimental` | N8N/IA | Após escolha da unidade |
| `E-mail` | N8N/IA | Antes da reserva |
| `Data e hora aula experimental` | N8N/IA | Ao finalizar o agendamento |

O histórico também contém um agrupamento recolhido de dois eventos de alteração logo após a resposta sobre experiência anterior. Portanto, `Modalidade de interesse` e `Já treinou?` podem ter sido preenchidos nesse ponto, mas isso precisa ser confirmado abrindo os eventos ou consultando o card/API. Não se deve afirmar nem implementar esse mapeamento somente por inferência.

#### Passagens de fase confirmadas pelo caso

```text
CONTATO INICIAL
  -> Primeiro contato (prioridade)   [lead qualificado]
  -> EXPERIMENTAL AGENDADO           [agenda concluída]
  -> DIA DO AGENDAMENTO              [robô de lembrete]
```

A fase `Lead` não fez parte do caminho normal de qualificação/agendamento desse caso. Ela apareceu posteriormente em uma oscilação anormal e quase instantânea entre fases.

#### Defeitos e riscos encontrados

- **Perda do horário escolhido:** depois de a lead responder `Preenchido`, a IA não conseguiu localizar o horário já confirmado e pediu a informação novamente. O ID do evento, a unidade, a data e o horário precisam ficar em estado persistente e não apenas na memória textual do modelo.
- **Movimentação duplicada de fases:** no disparo do lembrete houve a sequência `DIA DO AGENDAMENTO -> LEAD -> EXPERIMENTAL AGENDADO -> DIA DO AGENDAMENTO` no mesmo minuto.
- **Lembrete duplicado:** a mensagem de 24 horas foi enviada duas vezes, indicando concorrência ou mais de um gatilho atendendo ao mesmo evento.
- **Respostas fragmentadas:** apresentação, convite para experimental, envio do formulário e confirmação final foram enviados em dois blocos consecutivos. É necessário definir e testar se cada turno da Maria deve gerar somente uma mensagem.
- **Escopo pós-venda:** meses depois há conversas sobre saúde, cancelamento, cobrança e estorno. A Maria de captação não pode assumir esse tipo de conversa, ainda que uma tag antiga permaneça no contato.

#### Regras derivadas para a nova implementação

- A qualificação deve ser uma transição determinística, executada somente após validar os campos mínimos.
- A movimentação para `Primeiro contato (prioridade)` deve acontecer junto da marcação `Lead Qualificado`, com idempotência.
- A movimentação para `EXPERIMENTAL AGENDADO` só pode ocorrer depois de a reserva ser confirmada e de data/hora serem gravadas.
- Cada webhook do Kommo precisa ter uma chave de idempotência para impedir resposta, lembrete ou mudança de fase duplicados.
- Alterações de fase feitas pela própria integração não podem retroalimentar o mesmo fluxo de resposta.
- O estado de agenda deve guardar pelo menos `lead_id`, unidade, modalidade, data/hora, e-mail, `calendar_event_id` e status da reserva.
- A automação deve encerrar a atuação da Maria ao sair do escopo de captação, independentemente da existência de tags antigas.

## 4. Fluxo funcional preliminar

1. O Kommo cria ou recebe a nova conversa no `Funil de vendas` e adiciona a tag `Contato Inicial`.
2. O webhook recebe a mensagem e identifica o lead.
3. O sistema consulta no Kommo:
   - funil atual;
   - fase atual;
   - tags atuais;
   - campos personalizados e valores já preenchidos.
4. A regra valida se a Maria pode atender o lead.
5. A Maria responde com base em:
   - prompt personalizado;
   - histórico da conversa;
   - base de conhecimento;
   - dados já existentes no lead.
6. Ao obter uma informação nova, a Maria chama uma ferramenta interna específica para atualizar o Kommo.
7. Dados já preenchidos não devem ser enviados novamente, exceto quando o lead corrigir a informação.
8. Quando os critérios mínimos forem satisfeitos, uma ferramenta de qualificação atualiza o CRM e, se confirmado, move o lead para a fase definida.

## 5. Integração necessária com a API do Kommo

### Descoberta e mapeamento

- Buscar os campos personalizados de leads na conta.
- Registrar para cada campo:
  - ID imutável do Kommo;
  - nome exibido;
  - tipo do campo;
  - obrigatoriedade para qualificação;
  - opções e IDs de enumeração, quando for um campo de seleção.
- Buscar os funis e suas fases para mapear os IDs de:
  - `Funil de vendas`;
  - `Contato Inicial`;
  - `Primeiro Contato (Prioridade)`;
  - `Lead`;
  - demais fases relevantes.

### Escrita no lead

- Atualizar os campos usando os IDs oficiais, nunca apenas o texto do rótulo.
- Para campos de seleção, enviar o ID da opção cadastrada no Kommo.
- Preservar campos e tags que não fazem parte da alteração atual.
- Registrar sucesso ou erro de cada atualização.
- Não mover a fase se uma atualização obrigatória falhar.

## 6. Ferramentas candidatas para a Maria

Os nomes abaixo vêm do prompt e ainda precisam ser ligados a implementações reais:

- `atualiza_nome_contato`
- `atualiza_nome_lead`
- `preenche_modalidade`
- `preenche_jatreinou`
- `preenche_objetivo`
- `preenche_unidade`
- `atualiza_email`
- `lead_qualificado`
- `transfere_atendimento`
- `data_hora_agendamento`
- `GET_ALL_CALENDAR`
- `UPDATE_CALENDAR`
- `REMOVE_CALENDAR_GUEST`

Cada ferramenta deverá ter:

- parâmetros validados;
- mapeamento para o campo ou operação real;
- resposta estruturada para a IA;
- idempotência;
- logs sem exposição de tokens ou dados sensíveis;
- tratamento de indisponibilidade da API.

## 7. Qualificação — parcialmente confirmada

O caso real mostra que a conversa coletou estes dados antes de marcar o lead como qualificado:

- nome informado diretamente pelo lead;
- confirmação de que o interesse era para a própria pessoa;
- modalidade;
- experiência anterior com Muay Thai;
- objetivo;

Logo após a resposta sobre o objetivo, foram adicionados `Lead Qualificado` e a passagem para `Primeiro contato (prioridade)`. A unidade foi coletada depois da qualificação, durante o agendamento, portanto não parece ser requisito para qualificar nesse fluxo.

Ainda é necessário confirmar:

- se todos os cinco dados acima são obrigatórios ou se algum é apenas conversacional;
- os IDs e valores exatos dos campos de modalidade e experiência;
- por que a fase `Lead` apareceu durante o lembrete e qual automação causou a oscilação;
- quem ou qual automação faz cada passagem de fase;
- se a tag `Contato Inicial` deve permanecer ou ser removida após a qualificação.

## 8. Regras técnicas e de segurança

- Falhar de forma fechada: sem confirmação do funil, fase ou tag, a IA não responde.
- Não substituir a lista inteira de tags ao adicionar ou remover uma tag.
- Não sobrescrever um campo já preenchido sem dado novo ou correção explícita.
- Não executar duas automações de resposta para o mesmo evento.
- Separar ferramentas de CRM das ferramentas de agenda conforme as regras do prompt.
- Persistir o estado conversacional necessário para retomadas e agendamentos.
- Persistir o ID do evento e a seleção de horário antes de enviar o formulário.
- Deduplicar webhooks e ignorar eventos produzidos pela própria automação quando aplicável.
- Validar todos os valores antes de enviá-los ao Kommo.
- Registrar auditoria de ferramenta, lead, campo alterado, resultado e horário.

## 9. Plano de implementação

### Etapa 0 — Contenção operacional e gatilho

- [x] Restringir a regra ao `Funil de vendas`.
- [x] Exigir a tag `Contato Inicial`, criada pelo Kommo.
- [x] Bloquear a IA em `Lead` e nas fases posteriores.
- [x] Aplicar uma lista explícita que permite somente `Contato Inicial` e `Primeiro Contato (Prioridade)`.
- [x] Impedir substituição acidental das demais tags do lead.
- [ ] Confirmar em produção, com um lead de teste, que nenhuma conversa fora do escopo é assumida.
- [ ] Manter o teste controlado antes de habilitar o fluxo completo para a operação diária.

### Etapa A — Levantamento

- [ ] Receber e analisar a transcrição completa.
- [ ] Confirmar a passagem correta entre as fases.
- [ ] Consultar campos personalizados e enumerações reais da conta Kommo.
- [ ] Abrir ou consultar via API os dois eventos de campo recolhidos após a resposta sobre experiência.
- [ ] Identificar qual robô provocou a oscilação entre `DIA DO AGENDAMENTO`, `LEAD` e `EXPERIMENTAL AGENDADO`.
- [ ] Montar uma tabela de mapeamento campo → ID → tipo → valores permitidos.

### Etapa B — Camada Kommo

- [ ] Implementar leitura dos valores atuais do lead.
- [ ] Implementar atualização segura de campos personalizados.
- [ ] Implementar movimentação controlada de fase.
- [ ] Implementar transferência para atendimento humano.
- [ ] Adicionar logs e respostas estruturadas de erro.
- [ ] Implementar idempotência por evento/webhook e proteção contra retroalimentação.

### Etapa C — Ferramentas da IA

- [ ] Expor somente as ferramentas realmente implementadas ao modelo.
- [ ] Definir schemas de entrada estritos.
- [ ] Executar as chamadas solicitadas pelo modelo.
- [ ] Retornar o resultado ao modelo antes da resposta ao lead.
- [ ] Limitar ferramentas por etapa do fluxo.

### Etapa D — Qualificação

- [ ] Definir os campos mínimos.
- [ ] Detectar quando todos foram preenchidos.
- [ ] Marcar o lead como qualificado.
- [ ] Executar a passagem de fase confirmada na transcrição.

### Etapa E — Agenda

- [ ] Mapear as ferramentas reais de calendário.
- [ ] Implementar consulta de disponibilidade.
- [ ] Implementar reserva, reagendamento e cancelamento.
- [ ] Persistir o ID do evento confirmado.
- [ ] Permitir a retomada após `Preenchido` sem solicitar novamente um horário já confirmado.
- [ ] Sincronizar data e hora no Kommo somente após confirmação do calendário.

### Etapa F — Testes

- [ ] Executar os testes funcionais em uma conversa controlada, identificada como teste.
- [ ] Confirmar visualmente no card que cada dado coletado foi persistido.
- [ ] Confirmar a passagem de fase apenas quando o critério definido for atendido.
- [ ] Confirmar o agendamento no calendário e a sincronização final no Kommo.
- [ ] Verificar que o teste não afeta outras conversas da operação.
- [ ] Lead novo com tag correta e fase anterior a `Lead`.
- [ ] Lead sem a tag `Contato Inicial`.
- [ ] Lead em outro funil.
- [ ] Lead em `Lead` ou fase posterior mesmo com a tag.
- [ ] Atualização de cada tipo de campo.
- [ ] Campo já preenchido e correção explícita.
- [ ] Falha parcial da API sem avanço indevido de fase.
- [ ] Transferência humana interrompendo respostas da IA.
- [ ] Qualificação completa e incompleta.
- [ ] Agendamento, reagendamento e cancelamento.
- [ ] Resposta `Preenchido` recuperando corretamente a seleção e o ID do evento.
- [ ] Reentrega do mesmo webhook sem mensagem ou movimentação duplicada.
- [ ] Um único lembrete de 24 horas por agendamento.
- [ ] Nenhuma atuação da Maria em conversas de aluno, cancelamento, cobrança ou pós-venda.

## 10. Pendências para os próximos trechos

- Lista exata dos campos que aparecem no lead.
- Critério oficial de “Lead Qualificado”.
- Fase de destino após qualificação.
- Responsável por mover cada fase.
- Regra de manutenção ou remoção das tags.
- Integração real usada para calendário.
- Comportamento desejado quando o lead abandona e retorna à conversa.
- Origem exata das mudanças de fase e do lembrete duplicado no caso real.
- Política de uma mensagem por turno versus mensagens divididas.
