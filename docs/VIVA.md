# SmartIPC Viva Preparation

## Why four IPC mechanisms?

They represent different Unix IPC designs: byte-stream pipes, memory sharing, kernel-mediated message passing, and local socket communication.

## Why not claim transparent runtime IPC switching?

An arbitrary running application is compiled against specific IPC handles/protocols. Swapping primitives transparently would require an interposition layer plus state/protocol migration. The semester prototype therefore makes an adaptive selection for controlled workloads before execution.

## Why benchmark locally instead of quoting one paper?

IPC performance depends strongly on kernel version, CPU, memory hierarchy, scheduler behavior, message size, and workload. SmartIPC measures these mechanisms on the actual evaluation machine and uses those observations as its evidence.

## Why weighted scoring?

There is no universally best IPC mechanism across all objectives. The scoring model explicitly captures the project's priorities and can be changed for another workload class.

## What is novel?

The novelty claim should be kept modest and precise: a transparent workload-profile-driven selection layer that combines locally measured multi-objective IPC behavior with an adaptive recommendation algorithm. Do not claim to have invented IPC itself or a new kernel primitive.

## Main demo

1. Enter a small payload and low rate.
2. Run all four benchmarks.
3. Show that their measured metrics differ.
4. Change to a larger/high-rate workload.
5. Run again and show that the evidence changes.
6. Ask SmartIPC for a recommendation and show the score/evidence behind it.
