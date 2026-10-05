#pragma once

#include <cstdint>
#include <string>
#include <vector>

struct Config {
    std::string ipc = "pipe";
    std::size_t bytes = 1024;
    std::size_t messages = 1000;
    std::size_t warmup = 100;
    double rate = 0.0;          // logical messages/sec; 0 = as fast as possible
    int processes = 2;          // current prototype uses one parent + one child
};

struct Result {
    std::string ipc;
    std::size_t bytes = 0;
    std::size_t messages = 0;
    std::size_t warmup = 0;
    double requested_rate = 0.0;
    int processes = 2;
    double elapsed_ms = 0.0;
    double avg_latency_us = 0.0;
    double p50_latency_us = 0.0;
    double p95_latency_us = 0.0;
    double max_latency_us = 0.0;
    double throughput_mbps = 0.0;
    double cpu_percent = 0.0;
    double peak_rss_mb = 0.0;
    double load_1m = 0.0;
    long page_size = 0;
};

Result run_benchmark(const Config& cfg);
std::string result_to_json(const Result& result);
