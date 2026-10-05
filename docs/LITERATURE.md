# SmartIPC Literature Starting Set

This is a **starting set**, not the final literature review. The final report should expand the search and format references in the citation style required by the course.

## 1. Modern IPC optimization

Misun Park et al., “Rethinking Inter-Process Communication with Memory Operation Offloading,” 2026.

Relevance: motivates why modern IPC can require balancing throughput, latency, CPU efficiency, memory-copy overhead, synchronization, and concurrency rather than optimizing only one metric.

## 2. Pipes vs. sockets performance

A. H. Bell-Thomas, “Interprocess Communication in FreeBSD 11: Performance Analysis,” 2020.

Relevance: demonstrates experimentally that IPC performance can change with buffer/message configuration and system-level effects, supporting the need for controlled benchmarking rather than assuming one universal winner.

## 3. Linux primitive documentation

Use the Linux man-pages documentation as the implementation reference for `pipe(2)`, `shm_open(3)`, `msgget(2)`, and `socketpair(2)`.

## 4. Search expansion for the final report

Search academic databases for:

- adaptive IPC selection
- workload-aware IPC
- IPC performance Linux shared memory pipe socket message queue
- inter-process communication benchmark latency throughput
- zero-copy IPC shared memory
- communication-aware systems optimization

For each paper, record: problem, mechanism, workload, metrics, limitations, and how SmartIPC differs.
