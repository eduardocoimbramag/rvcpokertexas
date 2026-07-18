# Bac Bo Arena --- Product & Frontend Technical Specification

**Version:** 1.0

**Date:** 2026-07-11

> Documento de especificação para implementação do frontend e da lógica
> local do jogo. O objetivo é servir como guia completo para o Claude
> Code.

## 1. Objetivo

Desenvolver um jogo mobile first em React + TypeScript, com experiência
premium, lógica completa local, arquitetura escalável e preparada para
integração futura.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 2. Escopo

Inclui frontend, lógica do jogo, engine local, créditos virtuais,
animações, áudio, histórico, persistência, testes e documentação. Não
inclui backend.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 3. Stack

React, TypeScript strict, Vite, Tailwind, Framer Motion, Zustand, Zod,
Howler.js, Vitest, RTL, Playwright, ESLint, Prettier.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 4. Princípios

Código limpo, SOLID, separação de responsabilidades, componentes
pequenos, funções puras para regras do jogo.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 5. UX

Interface extremamente intuitiva, botões grandes, feedback imediato,
poucos textos, contraste alto, foco em toque.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 6. Mobile First

Projetar primeiro para 360x640, depois expandir para tablets e desktop.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 7. Game Feel

Transições rápidas, suspense antes do resultado, áudio sincronizado,
partículas discretas, vibração opcional.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 8. Fluxo

Home → Tutorial → Stake → Matchmaking → Confirmação → Countdown → Roll →
Reveal → Resultado → Histórico.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 9. Engine

Toda a lógica deve viver em LocalBacBoGameEngine. A UI nunca calcula
resultados.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 10. Regras

4 dados, 2 vermelhos e 2 azuis. Soma maior vence. Empate devolve
créditos.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 11. Créditos

Saldo inicial configurável. Regras isoladas em funções puras.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 12. Máquina de estados

Idle, Stake, Search, Found, Confirm, Countdown, Rolling, Reveal,
Completed, Error.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 13. Componentes

Home, Arena, Dice, ScoreBoard, StakeSelector, AudioControls, History,
Tutorial, Settings.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 14. Arquitetura

Estrutura por domínio em features/bac-bo com engine, store, hooks,
services, components, animations e tests.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 15. Persistência

localStorage encapsulado em GameStorageService com versionamento.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 16. Áudio

AudioManager centralizado com música, SFX, mute, volumes e persistência.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 17. Dados

Dados 3D usando CSS e Motion. Resultado visual sempre deriva da engine.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 18. Acessibilidade

ARIA, foco, prefers-reduced-motion, contraste adequado.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 19. Performance

Lazy loading, memoização consciente, animações com transform/opacity.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 20. Testes

Unitários, componentes e E2E cobrindo vitória, derrota, empate e
persistência.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 21. DevTools

Painel oculto por variável de ambiente para forçar resultados e limpar
estado.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 22. Integração futura

Factory createGameEngine() permitindo troca por ApiBacBoGameEngine.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 23. Critérios de aceite

Build limpo, lint, TS, testes, mobile responsivo, experiência fluida.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

## 24. Roadmap

Backend, multiplayer, replay, ranking, espectador, estatísticas.

### Requisitos

-   Implementação modular.
-   Código documentado.
-   Tipagem forte.
-   Sem `any` desnecessário.
-   Tratamento de erros.
-   Fácil manutenção.

### Checklist

-   [ ] Implementado
-   [ ] Testado
-   [ ] Documentado

# Prompt Final para Claude Code

Antes de alterar qualquer arquivo:

1.  Analise completamente o repositório.
2.  Identifique a stack existente.
3.  Identifique padrões de código.
4.  Monte um plano de implementação.
5.  Execute o plano continuamente.
6.  Após cada etapa execute lint, typecheck e testes.
7.  Não deixe TODOs críticos.
8.  Entregue um projeto funcional, organizado e preparado para
    integração futura.

O foco desta entrega é um frontend de nível profissional com toda a
lógica do jogo executando localmente, arquitetura limpa e experiência
premium para dispositivos móveis.
