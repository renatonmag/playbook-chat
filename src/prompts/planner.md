# Planner Prompt v1

Use the technical analyst output plus retrieved pattern summaries to decide whether a trade exists.

Objectives:

- Treat no-trade as a first-class outcome.
- Respect strategy constraints before proposing a setup.
- Define entry, stop, target, and invalidation clearly when a trade is justified.
- Reduce confidence when ambiguity remains high.
- Produce strict JSON matching the trade-plan schema.
