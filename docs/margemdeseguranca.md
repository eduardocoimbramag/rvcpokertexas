# Margem de segurança — lateral e inferior

Padrão de espaçamento de borda usado na tela de aposta (`StakeSelector`)
para o botão **Buscar oponente** e para a grade de fichas. Este documento
descreve os valores exatos e como replicá-los em qualquer outra tela.

## 1. Margem lateral (esquerda/direita)

A margem lateral de segurança é de **~10% da largura da tela em cada
lado**, com um teto para não esticar demais na web.

A regra vive na classe `.action-stack` em [`src/index.css`](../src/index.css):

```css
.action-stack {
  display: flex;
  width: min(100%, 80vw);
  max-width: 24rem;
  flex-direction: column;
  gap: 0.75rem;
  margin-inline: auto;
}
```

### Por que funciona

| Peça                  | Papel                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| `width: min(100%, 80vw)` | No mobile o `80vw` vence: o elemento ocupa 80% da largura da tela.  |
| `margin-inline: auto` | Centraliza o bloco → sobra `(100vw − 80vw) / 2 = 10vw` de cada lado.   |
| `max-width: 24rem`    | No desktop trava a largura em 384px; a margem passa a crescer sozinha. |

> **Cálculo (iPhone SE, 375px):** `80vw = 300px`, centralizado → sobram
> `37,5px` de cada lado = **10% da tela**. No desktop (>480px de área
> útil) o bloco fica preso a 384px e centralizado, com margens maiores.

### Contexto: o padding-base da tela

O `<main>` do jogo já aplica um padding próprio em
[`GameScreen.tsx`](../src/features/bac-bo/components/GameScreen.tsx):

```tsx
<main className="flex flex-1 flex-col px-6 py-4">
```

- `px-6` = **24px** de padding horizontal (base, vale para todo o conteúdo).
- A `.action-stack` (80vw) fica **por dentro** desse padding e centraliza,
  resultando nos 10% finais — os dois efeitos se somam de forma limpa
  porque ambos são simétricos.

## 2. Margem inferior (bottom)

A margem de segurança inferior do botão é de **`pb-4` = 1rem = 16px**,
aplicada no wrapper `.action-stack`:

```tsx
<div className="action-stack pb-4">
  <Button …>⚔️ BUSCAR OPONENTE</Button>
</div>
```

Isso empilha com o respiro já existente da casca do app:

| Camada                         | Valor      | Onde                             |
| ------------------------------ | ---------- | -------------------------------- |
| `pb-4` no wrapper do botão     | 16px       | componente da fase               |
| `py-4` (bottom) do `<main>`    | 16px       | `GameScreen`                     |
| `env(safe-area-inset-bottom)`  | do device  | `.app-shell` (notch/gesture bar) |

> O `pb-4` é a folga **do componente** — foi o valor dobrado (de `pb-2`
> para `pb-4`). É ele que se ajusta por tela; as outras camadas são
> globais e não devem mudar por fase.

## 3. Como replicar em outra tela

### Botões / CTAs (caminho pronto)

Use a classe utilitária já existente — nenhum CSS novo é necessário:

```tsx
<div className="action-stack pb-4">
  <Button size="md" fullWidth>MEU CTA</Button>
</div>
```

Isso entrega automaticamente: 10% lateral, teto de 24rem no desktop,
centralização e o bottom de 16px.

### Conteúdo que não é botão (ex.: grade, painel)

Reaplique os **mesmos limites** em Tailwind, para alinhar pixel a pixel
com os CTAs:

```tsx
<div className="mx-auto w-[min(100%,80vw)] max-w-96">
  {/* … conteúdo … */}
</div>
```

`w-[min(100%,80vw)]` + `max-w-96` (24rem) + `mx-auto` = exatamente a
mesma faixa da `.action-stack`. Foi assim que a grade de fichas passou a
alinhar com o botão na tela de aposta (ver [`centralizacao.md`](./centralizacao.md)).

## 4. Tabela-resumo dos valores canônicos

| Margem            | Valor                              | Token/classe                          |
| ----------------- | ---------------------------------- | ------------------------------------- |
| Lateral (mobile)  | 10% da tela por lado               | `width: min(100%, 80vw)` + `mx-auto`  |
| Lateral (desktop) | trava em 384px, centralizado       | `max-width: 24rem`                    |
| Inferior (botão)  | 16px (do componente)               | `pb-4`                                |
| Padding-base tela | 24px lateral / 16px vertical       | `px-6 py-4` no `<main>`               |

Manter esses valores idênticos entre as telas é o que dá a sensação de
um app coeso — qualquer nova fase deve reusar `.action-stack` (botões) ou
`w-[min(100%,80vw)] max-w-96 mx-auto` (demais conteúdos).
