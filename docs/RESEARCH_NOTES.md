# Research Direction

## Candidate literature themes to search

When collecting papers, search for:

- IPC performance comparison Linux
- shared memory versus message queue latency
- Unix domain socket performance
- adaptive IPC selection
- workload-aware communication middleware
- OS communication optimization
- inter-process communication benchmarking

Use papers to establish known trade-offs. Do **not** copy numerical results from papers as if they were measured on the project machine.

## Literature-gap framing

A useful gap statement is:

> Existing work evaluates or optimizes individual IPC mechanisms under particular conditions, while application developers still commonly choose an IPC mechanism statically. SmartIPC explores a practical workload-profile-based selection layer that converts locally measured multi-objective performance into a repeatable recommendation.

This is deliberately a modest contribution claim. The final report should refine it after the actual literature review.
