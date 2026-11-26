# FORMOL — GDD: Terror no Necrotério-Hospício

25/11/2026 · eduuhlann
Versão online (editável): https://claude.ai/artifact/WukTTf6JkabjxbVu1pwwgE

FORMOL é um terror em primeira pessoa de 60–90 minutos: você precisa achar 5 fusíveis num necrotério-hospício abandonado e religar a porta principal enquanto uma criatura que odeia a luz caça você. A lanterna é sua única defesa — e ela acaba.

## 1. Conceito geral

**Resumo.** 1987. Elias Prado, eletricista terceirizado, é chamado de madrugada ao Instituto São Lázaro — antigo sanatório psiquiátrico cuja ala sul virou necrotério municipal. A energia cai, a porta blindada da recepção trava em modo de segurança e só reabre com o painel principal energizado. O painel precisa de 5 fusíveis de alta carga, espalhados pelo prédio por quem tentou sair antes dele.

**Proposta.** Exploração lenta e tensa, interrompida por perseguições curtas e violentas. O jogador sempre sabe o objetivo (fusíveis → painel → porta); o medo vem de *como* chegar lá.

**Diferenciais.**

- **Luz como recurso e como risco.** A lanterna repele a criatura se acertar o rosto dela, mas também denuncia sua posição, esquenta e gasta bateria. Ligar a luz é sempre uma decisão.
- **Cada fusível muda o mapa.** Instalar um fusível acende um setor (mais seguro) e enfurece a criatura (mais agressiva). Progresso = alívio + escalada.
- **Criatura adaptativa.** Cada vez que é queimada, ela leva mais tempo para recuar na próxima. Spammar luz não funciona.
- **Instalação barulhenta.** Encaixar um fusível faz o painel estalar e atrai a criatura: todo progresso termina em fuga.

## 2. Gameplay loop

O loop dura 8–15 minutos por fusível e se repete 5 vezes, cada volta mais curta e mais perigosa.

1. **Planejar** — numa zona iluminada (segura), ler o mapa da parede, ouvir o prédio e escolher o próximo setor.
2. **Infiltrar** — entrar no escuro com a lanterna desligada ou baixa, guiado por luzes de emergência e pelo som.
3. **Procurar** — vasculhar gavetas, armários e cadáveres; achar pistas (bilhetes, prontuários) que apontam o fusível.
4. **Pegar** — o fusível faz um clique metálico audível e a criatura é notificada da *área* (não da posição exata).
5. **Voltar** — backtracking até o painel com o item, usando esconderijos e a lanterna quando for visto.
6. **Instalar** — segurar 3 s no painel. O estalo atrai a criatura (ruído de 30 m). Checkpoint salvo.
7. **Consequência** — um setor acende (novo refúgio) e a criatura sobe um nível de agressividade.

**Objetivo do jogador:** 5/5 fusíveis no painel → sequência de ignição de 25 s → porta abre → correr para fora.

**Progresso:** o HUD mostra só o contador de fusíveis (0/5) e a bateria. O mapa de evacuação na recepção marca cada fusível instalado. Não há marcador de objetivo: o jogador se orienta por placas, luzes e pistas.

| Fusíveis instalados | Setores acesos | Nível da criatura | Efeito |
| --- | --- | --- | --- |
| 0 | Recepção | 1 — Faminta | Patrulha lenta, demora a investigar |
| 1–2 | + Enfermaria, Administração | 2 — Atenta | +15% velocidade, ouve 20% mais longe |
| 3–4 | + Necrotério, Laboratório | 3 — Furiosa | Patrulha mais perto do jogador, busca mais longa |
| 5 (ignição) | Todos piscam | 4 — Desesperada | Perseguição direta até a porta |

## 3. Mecânicas principais

Toda mecânica gira em torno de um dilema: luz e velocidade te protegem agora, mas te expõem depois.

### Exploração e movimento

| Ação | Velocidade | Ruído (raio) | Observação |
| --- | --- | --- | --- |
| Agachado | 1,4 m/s | 1,5 m | Mais difícil de ver |
| Andar | 2,6 m/s | 5 m | Padrão |
| Correr | 5,1 m/s | 14 m | Gasta fôlego (6 s), respiração alta depois |
| Pegar fusível | — | 10 m | Clique metálico |
| Instalar fusível | — | 30 m | Estalo elétrico, criatura sempre ouve |

### Fusíveis

- 5 fusíveis cerâmicos de 60 A, um por setor: F1 Enfermaria, F2 Segurança, F3 Isolamento (Ala de Pacientes), F4 Gaveta 7 (Necrotério), F5 Gerador (Subsolo).
- O jogador pode carregar todos, mas fusíveis não instalados são perdidos ao morrer (voltam ao lugar). Isso cria a escolha: voltar agora ou arriscar mais um.

### Painel e porta principal

- Quadro Geral QG-1 na recepção: 5 bases de porcelana, lâmpadas-piloto, voltímetro e chave-faca de ignição.
- Instalar = segurar E por 3 s. Cada instalação salva checkpoint.
- Com 5/5: alavanca de ignição → 25 s de carga (sirene, luzes piscando) → a criatura vem direto. Sobreviver e cruzar a porta = vitória.

### Lanterna

| Parâmetro | Modo normal | Modo foco (botão direito) |
| --- | --- | --- |
| Cone | ~50° | ~18° |
| Bateria | 1% a cada 3 s | 1% a cada 0,7 s |
| Repele a criatura? | Não, só desacelera (20%) | Sim, se o centro do cone ficar no rosto |
| Calor | — | Superaquece em 4 s contínuos → 3 s sem foco |

- **Queimar:** manter o foco na cabeça por 0,8 s (+0,3 s a cada queimadura anterior, máx. 2 s; −0,3 s por fusível instalado).
- **Recuo:** a criatura grita, cobre o rosto e foge por 6 s para a sombra; volta procurando.
- **Erro tem preço:** foco sem acertar o rosto continua esquentando e drenando. Luz acesa deixa o jogador visível a 25 m.
- **Baterias:** 7 no mapa, cada uma recarrega 35%. Com bateria baixa a luz fica alaranjada e fraca.

### Esconderijos

- Armários e debaixo de macas. Dentro, a visão fica restrita.
- **Prender a respiração** (Shift) quando a criatura está perto: fôlego de 5 s; soltar perto dela gera um suspiro audível.
- Se a criatura **viu você entrar**, ela te arranca de lá (morte). Em busca, ela inspeciona o esconderijo mais provável perto da última posição.

### Perseguição

- Ao ser visto: grito, música de perseguição, vinheta e batimento cardíaco.
- Fugas: quebrar a linha de visão + esconder; queimar o rosto; entrar numa zona iluminada (ela não entra em luz forte, só espreita na borda).

### Morte e reinício

- Reinício no último checkpoint: fusíveis instalados ficam, carregados voltam ao lugar, bateria mínima de 40%.
- A criatura reaparece longe do jogador.

## 4. IA da criatura

Máquina de 6 estados guiada por visão, audição e luz do ambiente; de qualquer estado, ver o jogador leva a Perseguir. (Diagrama: `diagrama_ia_criatura.png`.)

Estados: **Patrulha → Investigar → Caçar → Perseguir → Recuo por luz → Busca → (desiste) Patrulha**.

| Sentido | No escuro | Em luz | Regra |
| --- | --- | --- | --- |
| Visão (cone 110°) | 9 m (16 m com luz no jogador) | 6–20 m | Raycast até a cabeça do jogador |
| Jogador com lanterna acesa | 25 m | 25 m | A luz denuncia em qualquer ambiente |
| Jogador agachado no escuro | 4,5 m | — | Silhueta quase invisível |
| Audição | raio do ruído | raio do ruído | Perde 40% por parede |

**Medidor de suspeita (0–100).** Ver o jogador soma até 140/s (perto) ou 25/s (longe). 30 → Investigar, 100 ou menos de 5 m → Perseguir. Cai 8/s sem estímulo.

**Escuro = força.** Abaixo de 0,3 de luz: +15% de velocidade. Acima de 0,7: −30% e ela evita entrar; em luz forte só espreita da borda. Com 3+ fusíveis, blackouts curtos na recepção.

**Perda de alvo.** "Intuição" de 1,5 s após perder a visão; depois vai à última posição e entra em Busca (3–5 pontos num raio de 10 m + 1 esconderijo). **Diretor de tensão:** se o jogador passa muito tempo longe, ela recebe uma dica da região dele; após uma perseguição, é mandada para longe por 40 s.

## 5. Level design

Mapa em "H" deitado: a Recepção com o painel no centro; cada fusível exige ir e voltar pelo corredor central exposto. Quanto mais longe do centro, mais escuro e perigoso. (Planta: `mapa_niveis.png`.)

| Fase | Fusível | Setor | O que ensina | Tensão |
| --- | --- | --- | --- | --- |
| Começo | F1 | Enfermaria | Interagir, esconder | Baixa |
| Começo | F2 | Administração | Ruído, ler o padrão da criatura | Média |
| Meio | F3 | Ala de Pacientes | Primeira perseguição, queimar o rosto | Alta |
| Meio | F4 | Necrotério | Gavetas de corpos, névoa fria | Alta |
| Fim | F5 | Subsolo | Breu total, água que faz barulho | Máxima |
| Final | — | Recepção | Ignição de 25 s e corrida pela porta | Máxima |

Guiar o jogador: luzes que ainda funcionam apontam portas importantes; luz de emergência vermelha marca o corredor; zumbido do painel perto da recepção.

## 6. Direção de arte

Realismo clínico decadente: um lugar real fechado às pressas em 1987. O medo vem do banal (azulejo, inox, papelada) em estado de abandono.

- **Paleta:** fluorescente verde-ciano pálido, sombras azul-petróleo, emergência vermelha, lanterna branco-quente. A primeira cor quente do mundo é a madrugada laranja vista pela porta aberta.
- **Materiais:** azulejo com rejunte sujo e infiltração, tinta verde-hospital descascando, inox arranhado, concreto molhado no subsolo, ferrugem.
- **Iluminação:** quase nenhuma luz global, névoa, fluorescentes piscando, lanterna com "cookie" de lente suja, pós-processamento (granulação, vinheta, aberração cromática, adaptação do olho ao escuro).

## 7. Lista de assets (resumo)

Cenário modular (paredes, pisos, forros, portas), props clínicos (macas, cadeiras de rodas, suportes de soro, mesas de autópsia), parede de gavetas do necrotério, administração (arquivos, mesas, CRT), subsolo (caldeiras, canos), elétrica (QG-1 com bases de porcelana, voltímetro, chave-faca), itens (fusível, bateria, bilhetes), esconderijos (armário, maca), decals (sangue, arrastos, infiltração, mofo, marcas de mão), jogador (mão + lanterna + relógio) e a criatura.

## 8. A criatura: "O Residente"

Um paciente que nunca saiu: 2,6 m, pálido de formol, sem pálpebras — olhos enormes adaptados ao escuro que a luz literalmente cozinha.

**Lore.** Em 1983, o Dr. Antônio Varela conduziu a "terapia de privação luminosa": pacientes mantidos meses no escuro total. O paciente 14 morreu, foi embalsamado — e saiu da gaveta 7 três dias depois. Os fusíveis foram arrancados por ele: ele apaga o lugar para poder existir.

**Visual.** Silhueta altíssima e estreita, braços até abaixo dos joelhos, costelas aparentes, incisão de autópsia em Y costurada, bandagem na cabeça, mandíbula longa, correias de camisa de força arrastando.

**Comportamento.** Patrulha curvado e lento; persegue inclinado e rápido; ao ser queimado cobre o rosto, solta vapor dos olhos, grita e foge; procura abrindo armários.

**Sons.** Passos descalços molhados, correias arrastando, respiração/rosnado, grito rasgado, chiado ao queimar.

## 9. Áudio

O som é o radar do jogador: todo som da criatura é 3D (HRTF), com abafamento por paredes.

- **Narração da intro:** 9 falas, voz masculina "Carlos" (ElevenLabs), pasta `audio/narracao`.
- **Passos:** gravações ElevenLabs separadas em passos individuais — azulejo (10), correndo (8), água do subsolo (10), criatura (8), pasta `audio/passos`. Sem repetição, com variação de tom/volume, pé esquerdo/direito no estéreo e eco por sala.
- **Procedurais (Web Audio):** ambiência, zumbido de lâmpadas, batidas metálicas distantes, coração, música adaptativa, sirene, faíscas, chuva e trovão da intro.

## 10. Implementação técnica

O protótipo jogável (`JOGAR - FORMOL.html`) é um único arquivo HTML: Three.js r158, texturas e modelos gerados em código, áudio embutido. O código-fonte está em `codigo-fonte/`.

| Módulo | O que faz | Equivalente em engine |
| --- | --- | --- |
| `CFG` | Todos os números de balanceamento | ScriptableObject / DataAsset |
| Mapa em grade | 44×34 células de 2 m | Level modular + volumes de setor |
| `lightGrid` | Luz de cada célula, recalculada ao acender setores | Light probes consultados pela IA |
| A* em grade | Caminhos com custo extra em células iluminadas | NavMesh + áreas com custo |
| `AI` | 6 estados, suspeita, audição | Behavior Tree + AIPerception |
| Lanterna | 2 modos, bateria, calor, queimadura | Componente `Flashlight` |
| Esconderijos | Armário e maca, prender respiração | Componente `HideSpot` |
| Painel / porta | QG-1, ignição, porta | `MainPanel` + `ExitDoor` |
| Áudio | Web Audio HRTF + MP3 ElevenLabs | FMOD / Wwise |
| Save | Progresso salvo a cada fusível | SaveGame |

## 11. Roteiro de produção (estimativa para 1–2 pessoas, ~6 meses)

1. Protótipo de sistemas (semanas 1–3)
2. Blockout do mapa completo (4–6)
3. Vertical slice com arte final (7–12)
4. Produção de arte (13–18)
5. Som (15–20, em paralelo)
6. Polimento (19–22)
7. Balanceamento com métricas (21–24)

Metas: zerar em 60–90 min, 3–8 mortes na 1ª partida, 1–2 perseguições por fusível, 20–50% de bateria no final, 6–12 queimaduras por partida.

## 12. Versão mínima jogável

O protótipo já cobre o MVP: movimento com ruído, lanterna com foco/bateria/calor, criatura com 6 estados, escuro fortalece a criatura, 5 fusíveis + painel + ignição + vitória, esconderijos com respiração, morte e checkpoint, áudio, mapa com 7 setores, menu, intro narrada e save.

Para depois: modelo e animações finais da criatura, posições aleatórias de fusíveis, itens arremessáveis, CCTV, atalhos, versão em Unity/Unreal.
