# Refa do menu: de 13 rotas para categorias
## Mapeamento proposto
- Operações -> Connect + Session + GPS + Copilot + Marketplace
- Mercado -> Regime + Capital + Engine resumido + Regime detalhe
- Estatística -> QuantFund + Profits equity + Plan diário
- Diário -> Journal + Psychology + Análises anteriores
- Conta -> Perfil + MT5 + Sessões

## Implementação
- Reutilizar conteúdo atual, mover para categorias sem apagar paginas antigas
- Manter SEO hash atual por compatibilidade: redirecionar antigas para páginas novas via route() fallback
