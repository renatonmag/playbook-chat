export const PATTERN_DOCS: Record<string, string> = {
  "3-pushes": `O movimento finalizou 3 puxadas com climaxes consecutivos ou até um suporte ou resitência?`,
  "breakout-mode": `O breakout mode está no tempo atual ou no tempo maior (1h)?`,
  "broad-channel": `As retrações estão indo até que profundidade?
Está em novo topo ou fundo?`,
  climaxes: `Possui climaxes consecutivos?
Maior ou segunda maior barra da perna depois de 15+ barras, com barra na direção contraria confirmando o climax?
Atingiu alvo importante e formou reversão?`,
  contexts: `Breakout
Channel
Trading range
Pullback
Reversal`,
  cycles: `Em qual ciclo está: rompimento, canal estreito, canal amplo ou lateralidade?`,
  "double-confirmation": `Alguma barra especial formando uma nova confirmação da região?`,
  "late-in-trend": `A tendência é forte e persistente, possui 15+ barras, canal estreito longo, muitas barras sem tocar a média?
A tendência possui muitas barras porém climática, um microcanal por exemplo?`,
  lines: `Alguma região importante de suporte ou resitencia?
Alguma linha de tendência ou de canal relevante?`,
  "moving-average": `O preço ou os pullbacks estão surfando acima ou abaixo da média respeitando ela?
As pernas estão fazendo zig zag na mádia sem respeita-la?`,
  "possible-pattern-transitions": `reversão para ttr
reversão para pullback
climaxes consecutivos para bandeira final
climaxes consecutivos para reversão
reversão para reversão
breakout mode para breakout
breakout para canal
canal estreito para canal amplo
canal para reversão
breakout para pullback
pullback para breakout`,
  pullbacks: `O pullback é raso ou profundo?
O pullback é curto (até 3 barras) ou longo (3+ barras)?
O pullback é uma wedge ou alcansou um nivel de retração importante?
O pullback forma gap com o ultimo fundo ou topo recente?`,
  retracements: `As retrações tem menos de 50%, 50%, ou mais de 50%?`,
  "special-bars": `A barra especial possui tamanho, forma, localização, propriedade relativas boas?
A favor ou contra a tendência?
Existem linhas importantes na região da barra?
A perna em que a barra parece já é uma perna desenvolvida ou nova?`,
  "support-resitance": `É uma região, marcada por algum gap ou varias barras especiais acumuladas?
É a primeira barra da perna de um movimento anterior?
Minimas ou maximas de dias anteriores?
Há suporte ou resitência em pontos de rompimento de canal amplo ou estreito, na media movel??`,
  swings: `perna grande concluindo em um ponto importante?
Alguma barra especial proxima de alvos importantes?`,
  targets: `O movimento atingiu algum alvo?`,
  "tight-channel": `Pode ser small pullback trend ou stairs?
Os pontos de rompimento estão sendo respeitados?`,
  "timeframe-1h": `Qual ciclo está este timeframe?  
Há linhas importantes?  
Tocou na ma?  
Outros pontos importantes?`,
  "trading-range": `Cuidado com FOMO!
O trading range possui muito ou pouco deslocamento?
Está em qual região do range, baixo, meio ou alto?
Limpou liquidez em algum fundo ou topo importante?
O range é grande ou pequeno?
Algum canal fomando dentro do range, antecipando uma pressão?
Algum ttr, breakout mode ou compressão dos preços?
Second leg trap?
Possui viés de baixa, alta ou indefinido?`,
  "wicks-shadows": `Ha regeição de preços acima ou abaixo de barras consecutivas na região? `,
};

export const AVAILABLE_PATTERNS: string[] = [
  "3-pushes",
  "breakout-mode",
  "broad-channel",
  "climaxes",
  "contexts",
  "cycles",
  "double-confirmation",
  "late-in-trend",
  "lines",
  "moving-average",
  "possible-pattern-transitions",
  "pullbacks",
  "retracements",
  "special-bars",
  "support-resitance",
  "swings",
  "targets",
  "tight-channel",
  "timeframe-1h",
  "trading-range",
  "wicks-shadows",
];
