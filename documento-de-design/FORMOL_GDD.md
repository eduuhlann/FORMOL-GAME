# FORMOL — GDD (versão 1.1)

eduuhlann · terror em primeira pessoa · navegador (Three.js + Web Audio), um arquivo só

A história completa (personagens, linha do tempo, fitas, falas) está em `LORE.md`. Este documento descreve o jogo.

## 1. Conceito

1987. O eletricista Elias Prado fica preso de madrugada no Instituto São Lázaro, um antigo sanatório. Uma criatura que odeia a luz o caça pelo prédio. Em 4 capítulos, ele religa a energia, descobre o que o Dr. Varela fez com o paciente 14 e, no fim, entende que a criatura só queria ver o sol.

- **Duração:** 60–100 minutos.
- **Pilares:**
  - a luz é proteção e ameaça ao mesmo tempo;
  - o mapa cresce a cada capítulo;
  - a história é contada por fitas cassete com voz;
  - o medo vem do som e da dúvida.

## 2. Capítulos

| Capítulo | Área nova | Objetivo | Fim |
| --- | --- | --- | --- |
| I · Apagão | Prédio principal | 5 fusíveis → QG-1 → alavanca → 25 s de ignição | A porta da frente não abre; o Pavilhão Leste destrava (cutscene) |
| II · Noite Longa | Pavilhão Leste, ala norte | 3 sessões gravadas → código 1-2-0-3 → cartão da diretoria | O corpo do Varela e a carta (cutscene) |
| III · Formol | Capela, Fototerapia, Crematório | 3 lâmpadas de arco → apagar a lanterna → atraí-lo para a sala → descarga | Ele queima, sobrevive e arranca o alçapão; o QG-1 explode (cutscene) |
| IV · Amanhecer | Galerias, Ossário, Reservatório, Quarto da Celeste, Pátio | Fita 7 e manivela → portão do pátio → sobreviver 75 s | Nascer do sol; dois finais |

**Finais:** com a fita 7 ouvida até o fim, a Celeste espera no pátio e Tomás se desfaz em paz ao lado da mãe ("Já é dia"). Sem a fita, ele queima sozinho ao sol ("Noite eterna").

**Seleção de capítulos** no menu: cada capítulo é liberado ao ser alcançado.

## 3. Mecânicas do jogador

| Ação | Tecla / controle | Observação |
| --- | --- | --- |
| Mover / correr / agachar | WASD / Shift / C | Correr gasta fôlego e faz barulho (14 m) |
| Lanterna / foco | F / botão direito | O foco gasta mais bateria e queima o rosto dele |
| Interagir / ler / esconder | E | Segurar E: fusível (3 s), lâmpada (2 s), manivela do portão (5 s) |
| Sinalizador | G | Luz vermelha por 16 s; ele não chega perto e foge se estiver a menos de 6 m |
| Garrafa | Q | Quebra onde cai e o atrai para lá (ruído de 18 m) |
| Parar a fita | T | As fitas tocam no walkman enquanto você anda |
| Mapa | Tab | Desativado no modo Pesadelo |
| Controle | analógicos, A, B, X, RT, RB, LT, Y, Start | Suporte a gamepad |

- **Objetos no chão:** 70 garrafas, bandejas e latas. Andando, você chuta e faz barulho (11 m); agachado, não.
- **Esconderijos:** armários e macas. Prender a respiração (Shift); perto dele, o coração dispara e ele fareja.
- **Pilhas:** 12 de 22 pontos possíveis, sorteados a cada partida.

## 4. A criatura

Estados: patrulha → investigar → caçar → perseguir → fuga pela luz → busca.

- **Luz:** a lanterna no corpo ou no rosto por 0,3 s faz ele fugir. A lanterna falha quando ele está a menos de 11 m.
- **Comportamento por capítulo:**
  - **II:** imita a voz da Celeste para atrair o jogador.
  - **III:** faz emboscadas, esperando parado e mudo no escuro perto do jogador.
  - **IV:** rasteja de quatro nas galerias e, no final, caça direto.
- **Voz:** sussurros gravados ("Mãe…", "Apaga a luz…", "Eu tô vendo você"), rosnados e grito.
- **Morte:** ele avança no rosto do jogador, com corte seco para o preto.

## 5. Terror

- **Sustos roteirizados**, cada um com 2–3 s de silêncio antes:
  - a gaveta 7 se abre sozinha;
  - o corpo some da maca;
  - o telefone toca (linha cortada desde 1984);
  - a porta corta-fogo bate;
  - as velas da capela apagam;
  - choro nas galerias.
- **Medo:** um medidor invisível sobe no escuro e perto dele, e cai na luz. Com o medo alto:
  - sons falsos (passos, batidas, sussurros);
  - um vulto que some quando a luz encosta;
  - distorção da imagem e batimento cardíaco.

## 6. Narrativa e áudio

- 9 fitas cassete (47 falas): Varela, Tomás, Celeste, Osmar e o pai do Tomás.
- 17 falas no alto-falante, da Celeste.
- 17 pensamentos do Elias em momentos-chave.
- Trilha em laço por capítulo, tema do menu, trilha do amanhecer e camada de perseguição.
- 13 efeitos gravados e 8 sussurros (ElevenLabs), com efeitos procedurais de reserva.

## 7. Extras e rejogabilidade

- **Fotografias:** 6 colecionáveis, com galeria no menu Extras.
- **Esconderijo secreto do vigia:** atrás da autópsia, com o corpo do Osmar e a fita 9.
- **Conquistas:** 12. Entre elas, final verdadeiro, final sombrio, 9 fitas, 6 fotos, sem morrer, Pesadelo e o capítulo IV sem lanterna.
- **Modos:** Pesadelo (bateria 60% mais curta, ele mais rápido, sem mapa); Sem Lanterna, liberado ao zerar.
- **Tela final:** tempo por capítulo, vezes visto, objetos chutados e créditos rolando.

## 8. Técnico

- Mapa em grade de 66 × 50 células de 2 m, que cresce por capítulo.
- Pool de 10 luzes reais para as lâmpadas mais próximas.
- Qualidade gráfica baixa, média ou alta (resolução e sombras).
- Saves por capítulo, compatíveis com versões anteriores.
- Build: `python build.py` (ou o script equivalente em Node) embute shell, Three.js, os áudios e `game.js` num único HTML.
