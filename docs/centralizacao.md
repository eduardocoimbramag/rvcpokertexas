# Centralização do conteúdo na mesa

Como o título **"Escolha sua aposta"** e as **3 fichas** ficam centrados
no couro livre da mesa (`StakeSelector`), e como repetir esse padrão em
outras fases. Cobre os dois eixos: vertical (no couro) e horizontal.

## 1. O que "centralizar na mesa" significa

A cena tem uma geometria **fixa** (não muda entre as fases). Duas faixas
importam:

```
┌─────────────────────────┐
│  cabeçalho (saldo, ←)    │
├─────────────────────────┤
│                         │  ← .dealer-spacer: reserva a altura da
│      (dealer + trilho)  │     dealer. Nada de conteúdo entra aqui.
│                         │
├─────────────────────────┤  ← início do "couro livre"
│                         │
│   CONTEÚDO CENTRADO     │  ← é aqui que title + cards são centrados
│                         │
├─────────────────────────┤
│      [ CTA no rodapé ]  │  ← botão fixo na base
└─────────────────────────┘
```

A altura da faixa da dealer vem de um único token, em
[`src/index.css`](../src/index.css):

```css
.scene-stage {
  --dealer-h: clamp(160px, 28dvh, 260px);
}
.dealer-spacer {
  height: calc(var(--dealer-h) * 0.95); /* reserva o espaço da dealer */
  flex-shrink: 1;                        /* cede se a tela for baixa   */
}
```

O `.dealer-spacer` é renderizado **antes** do conteúdo da fase (dentro da
`TableScene`), empurrando o conteúdo para o couro livre. Ou seja: o
conteúdo da fase já nasce abaixo do trilho — só falta centrá-lo nesse
espaço restante.

## 2. Centralização VERTICAL (no couro)

O truque é dividir a fase em **duas zonas**: uma que estica e centra o
conteúdo, e o CTA fixo no rodapé. Estrutura em
[`StakeSelector.tsx`](../src/features/bac-bo/components/StakeSelector.tsx):

```tsx
<div className="flex flex-1 flex-col">
  {/* ZONA 1 — cresce e centraliza o conteúdo no espaço livre */}
  <div className="flex flex-1 flex-col justify-center gap-7">
    <h2 className="text-center …">Escolha sua aposta</h2>
    <div className="… grid grid-cols-3 …">{/* fichas */}</div>
  </div>

  {/* ZONA 2 — CTA ancorado na base (fluxo normal) */}
  <div className="action-stack pb-4">
    <Button …>⚔️ BUSCAR OPONENTE</Button>
  </div>
</div>
```

### Por que funciona

| Classe                          | Efeito                                                              |
| ------------------------------- | ------------------------------------------------------------------ |
| `flex flex-1 flex-col` (raiz)   | A fase ocupa toda a altura disponível abaixo do `.dealer-spacer`.  |
| `flex-1` na **Zona 1**          | A zona do conteúdo absorve todo o espaço que sobra acima do CTA.   |
| `justify-center` na Zona 1      | Centraliza `title + cards` verticalmente **dentro** dessa zona.    |
| `gap-7`                         | Distância fixa entre o título e a grade (1.75rem).                 |
| CTA fora da Zona 1              | Fica no rodapé por fluxo normal — não entra na conta da centragem. |

> **A regra de ouro:** o que deve centralizar vai numa `div flex-1
> justify-center`; o que é fixo (CTA) fica como irmão, fora dela.

## 3. Centralização HORIZONTAL

Dois alvos, duas técnicas:

- **Texto** (título): `text-center`.
- **Bloco** (grade de fichas): mesma faixa dos CTAs —
  `mx-auto w-[min(100%,80vw)] max-w-96` (ver
  [`margemdeseguranca.md`](./margemdeseguranca.md)):

```tsx
<div className="mx-auto grid w-[min(100%,80vw)] max-w-96 grid-cols-3 gap-2">
```

Assim a grade fica centralizada **e** alinhada com a margem de segurança
do botão — título, fichas e CTA compartilham o mesmo eixo central e os
mesmos limites laterais.

## 4. Receita para replicar em outra fase

```tsx
export function MinhaFase() {
  return (
    <div className="flex flex-1 flex-col">
      {/* conteúdo centrado no couro */}
      <div className="flex flex-1 flex-col justify-center gap-6">
        <h2 className="text-center text-2xl font-extrabold text-[#201608]">
          Meu título
        </h2>
        <div className="mx-auto w-[min(100%,80vw)] max-w-96">
          {/* painel, grade, lista… */}
        </div>
      </div>

      {/* CTA ancorado no rodapé (opcional) */}
      <div className="action-stack pb-4">
        <Button size="md" fullWidth>MEU CTA</Button>
      </div>
    </div>
  );
}
```

### Checklist

- [ ] Raiz da fase: `flex flex-1 flex-col`.
- [ ] Bloco a centrar: `flex flex-1 flex-col justify-center` (+ `gap-*`).
- [ ] Texto centrado com `text-center`; blocos com `mx-auto`.
- [ ] Blocos usam a faixa canônica `w-[min(100%,80vw)] max-w-96` para
      alinhar com os CTAs.
- [ ] CTA (se houver) é **irmão** do bloco centrado, com `action-stack pb-4`.
- [ ] **Não** adicionar altura fixa nem `mt`/`mb` grandes para "empurrar"
      o conteúdo — deixe o `justify-center` fazer o trabalho, assim a
      centragem se adapta sozinha a qualquer tela.

## 5. Sobre tinta e contraste (nota rápida)

O conteúdo centrado fica sobre o **couro claro** da mesa. Por isso usa
tinta escura gravada (`text-engraved` + `#201608`/`#33261a`), não o
marfim padrão da UI. Ao replicar, lembre de manter texto escuro sobre o
couro — texto claro some no fundo bege.
