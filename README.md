# Trader Immersion OS v3

SPA multipágina/PWA para AlphaForge: Dashboard, Session Room, Trader Twin, Coach, Regime AI, Capital, Marketplace e Journal.

## URLs

Preferencial para PC:

```text
http://77.237.240.245:8080
```

Alternativa:

```text
http://77.237.240.245:8126
```

## Novidade v3

Nova página `Session`:

- Trader Twin profile;
- Trading Session Mode;
- check mental;
- contexto de regime;
- budget de risco;
- checklist de entrada;
- decisão da sala: autorizar, esperar ou bloquear;
- histórico local de sessões via `localStorage`;
- integração com Journal ao fechar sessão.

## Segurança

Paper-first. Sem capital real, sem live APIs e sem execução automática sem aprovação explícita.

## Dados

- `data/alphaforge-snapshot.json` é gerado a partir de `/home/ines/workspace/alpha-forge/state`.
- `data/trader-twin.json` define o perfil comportamental inicial do trader.
