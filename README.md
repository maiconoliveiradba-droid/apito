# Apito, o app para organizar a pelada (PWA)

Aplicativo web instalável (PWA) para organizar peladas de futebol: presença com fila de espera, sorteio equilibrado,
placar e cronômetro ao vivo, rodízio de times, avaliações, rankings, caixa do grupo e churrasco.
Funciona offline e guarda os dados no próprio aparelho. Não tem servidor, conta ou anúncios.

## Como rodar

Qualquer servidor de arquivos estáticos serve. O service worker exige **HTTPS** (localhost também vale).

```bash
cd apito
python3 -m http.server 8080      # ou: npx serve .
# abra http://localhost:8080
```

## Como publicar (grátis)

Envie a pasta inteira, sem alterar a estrutura, para um destes serviços. Todos entregam HTTPS:

- **Netlify**: arraste a pasta em app.netlify.com/drop.
- **Cloudflare Pages**, **Vercel**, **GitHub Pages** ou **Firebase Hosting**: aponte para a pasta, sem etapa de build.

Depois de publicar, abra o endereço no celular. No Android (Chrome) use o menu e “Instalar app”; no iPhone (Safari), Compartilhar e “Adicionar à Tela de Início”.

## Fluxo da pelada

1. **Presença**: confirmados separados em goleiros e jogadores, limites independentes, fila de espera automática e prioridade de mensalistas.
2. **Chegada**: ordem de chegada (define quem joga primeiro e quem fica de reserva).
3. **Times**: sorteio equilibrado por nota e posição, aleatório ou por chegada.
4. **Partida**: placar, cronômetro com aviso de fim de tempo, gols com assistência, desarmes, defesas difíceis e falhas. O rodízio decide os próximos times.
5. **Pós-jogo**: notas, destaques do dia (craque, artilheiro, garçom, paredão, xerife, pereba), imagem para compartilhar.

Além disso: rankings por semana, mês, semestre, ano e geral; caixa com lançamentos, cobranças e carteira; churrasco com divisão da conta.

## Limites desta versão

Como não há servidor, estas coisas são diferentes de um app com conta na nuvem:

- Cada aparelho tem os próprios dados. Use **Mais, Exportar este grupo** para backup ou para levar para outro aparelho.
- Os jogadores não confirmam presença sozinhos dentro do app. Eles abrem o link de convite, escolhem o nome e enviam a resposta pelo WhatsApp; quem organiza toca em “Vai”.
- Os lembretes aparecem quando o app é aberto perto do horário. Notificação push com o app fechado exige um servidor de push.
- Não há integração com relógios (Apple Watch, Health Connect) nem clube de vantagens.

## Estrutura

```
index.html  manifest.webmanifest  sw.js  styles.css
js/util.js   js/store.js   js/logic.js        regras puras (testáveis em Node)
js/app.js    js/ui/*.js                        telas e ações
icons/                                         ícones do app
tests/                                         testes das regras (node tests/logic.test.mjs)
```

Para trocar o nome, edite `index.html`, `manifest.webmanifest` e o título em `js/app.js`. As cores ficam no início de `styles.css`.
Ao alterar qualquer arquivo, mude `VERSION` em `sw.js` para os aparelhos receberem a atualização.
