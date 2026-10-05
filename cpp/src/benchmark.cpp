#include "benchmark.hpp"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <sstream>
#include <thread>
#include <random>
#include <stdexcept>
#include <string>
#include <sys/ipc.h>
#include <sys/msg.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/mman.h>
#include <semaphore.h>
#include <unistd.h>
#include <vector>

namespace {

using Clock = std::chrono::steady_clock;

struct UsageSnapshot {
    double user_sec = 0.0;
    double sys_sec = 0.0;
    long max_rss_kb = 0;
};

UsageSnapshot get_usage(int who) {
    struct rusage ru{};
    if (getrusage(who, &ru) != 0) throw std::runtime_error("getrusage failed");
    UsageSnapshot s;
    s.user_sec = ru.ru_utime.tv_sec + ru.ru_utime.tv_usec / 1e6;
    s.sys_sec = ru.ru_stime.tv_sec + ru.ru_stime.tv_usec / 1e6;
    s.max_rss_kb = ru.ru_maxrss;
    return s;
}

struct UsageWindowMessage {
    std::uint32_t phase = 0; // 1 = measured window ready, 2 = measured window complete
    UsageSnapshot usage{};
};

void die_errno(const char* what) {
    throw std::runtime_error(std::string(what) + ": " + std::strerror(errno));
}

ssize_t read_full(int fd, void* buf, std::size_t n) {
    std::size_t done = 0;
    while (done < n) {
        ssize_t r = ::read(fd, static_cast<char*>(buf) + done, n - done);
        if (r < 0) {
            if (errno == EINTR) continue;
            die_errno("read");
        }
        if (r == 0) return 0;
        done += static_cast<std::size_t>(r);
    }
    return static_cast<ssize_t>(done);
}

void write_full(int fd, const void* buf, std::size_t n) {
    std::size_t done = 0;
    while (done < n) {
        ssize_t w = ::write(fd, static_cast<const char*>(buf) + done, n - done);
        if (w < 0) {
            if (errno == EINTR) continue;
            die_errno("write");
        }
        if (w == 0) throw std::runtime_error("write returned zero");
        done += static_cast<std::size_t>(w);
    }
}

void send_usage_window(int fd, std::uint32_t phase) {
    UsageWindowMessage msg{};
    msg.phase = phase;
    msg.usage = get_usage(RUSAGE_SELF);
    write_full(fd, &msg, sizeof(msg));
}

UsageWindowMessage receive_usage_window(int fd) {
    UsageWindowMessage msg{};
    if (read_full(fd, &msg, sizeof(msg)) != static_cast<ssize_t>(sizeof(msg))) {
        throw std::runtime_error("usage window control pipe closed unexpectedly");
    }
    return msg;
}

void pace_if_needed(double rate, Clock::time_point start, std::size_t index) {
    if (rate <= 0.0 || index == 0) return;
    const double target_sec = static_cast<double>(index) / rate;
    const auto target = start + std::chrono::duration_cast<Clock::duration>(std::chrono::duration<double>(target_sec));
    std::this_thread::sleep_until(target);
}

std::vector<std::uint8_t> make_payload(std::size_t n) {
    std::vector<std::uint8_t> payload(n);
    for (std::size_t i = 0; i < n; ++i) payload[i] = static_cast<std::uint8_t>((i * 131u + 17u) & 0xffu);
    return payload;
}

double get_load_1m() {
    std::ifstream in("/proc/loadavg");
    double load = 0.0;
    in >> load;
    return in ? load : 0.0;
}

long get_page_size() {
    long v = sysconf(_SC_PAGESIZE);
    return v > 0 ? v : 4096;
}

void check_child_exit(pid_t child) {
    int status = 0;
    while (waitpid(child, &status, 0) < 0) {
        if (errno == EINTR) continue;
        die_errno("waitpid");
    }
    if (!WIFEXITED(status) || WEXITSTATUS(status) != 0) {
        if (WIFSIGNALED(status)) {
            throw std::runtime_error("child terminated by signal " + std::to_string(WTERMSIG(status)));
        }
        throw std::runtime_error("child benchmark failed");
    }
}

void compute_common(Result& r, const Config& cfg, const std::vector<double>& samples,
                    const Clock::time_point bench_start, const Clock::time_point bench_end,
                    const UsageSnapshot& self_before, const UsageSnapshot& self_after,
                    const UsageSnapshot& child_before, const UsageSnapshot& child_after) {
    r.ipc = cfg.ipc;
    r.bytes = cfg.bytes;
    r.messages = cfg.messages;
    r.warmup = cfg.warmup;
    r.requested_rate = cfg.rate;
    r.processes = cfg.processes;
    r.elapsed_ms = std::chrono::duration<double, std::milli>(bench_end - bench_start).count();

    if (samples.empty()) throw std::runtime_error("No latency samples collected");
    std::vector<double> sorted = samples;
    std::sort(sorted.begin(), sorted.end());
    r.avg_latency_us = std::accumulate(samples.begin(), samples.end(), 0.0) / samples.size();
    auto percentile = [&](double p) {
        if (sorted.size() == 1) return sorted[0];
        double idx = p * (sorted.size() - 1);
        std::size_t lo = static_cast<std::size_t>(std::floor(idx));
        std::size_t hi = static_cast<std::size_t>(std::ceil(idx));
        double frac = idx - lo;
        return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
    };
    r.p50_latency_us = percentile(0.50);
    r.p95_latency_us = percentile(0.95);
    r.max_latency_us = sorted.back();

    const double elapsed_sec = std::chrono::duration<double>(bench_end - bench_start).count();
    if (elapsed_sec <= 0.0) throw std::runtime_error("Non-positive elapsed time");
    r.throughput_mbps = (static_cast<double>(cfg.bytes) * static_cast<double>(cfg.messages) / elapsed_sec) / (1024.0 * 1024.0);

    const double parent_cpu = (self_after.user_sec - self_before.user_sec) + (self_after.sys_sec - self_before.sys_sec);
    const double child_cpu = (child_after.user_sec - child_before.user_sec) + (child_after.sys_sec - child_before.sys_sec);
    // Aggregate CPU utilization across the two benchmark processes. Values above
    // 100% are valid because two processes may consume two CPU cores concurrently.
    r.cpu_percent = ((parent_cpu + child_cpu) / elapsed_sec) * 100.0;
    r.peak_rss_mb = (static_cast<double>(std::max(self_after.max_rss_kb, child_after.max_rss_kb))) / 1024.0;
    r.load_1m = get_load_1m();
    r.page_size = get_page_size();
}

// ---------------- Pipes ----------------
Result run_pipe(const Config& cfg) {
    int req[2]{-1, -1};
    int resp[2]{-1, -1};
    if (pipe(req) != 0 || pipe(resp) != 0) die_errno("pipe");

    const auto payload = make_payload(cfg.bytes);
    const std::uint32_t len = static_cast<std::uint32_t>(cfg.bytes);

    int metrics[2]{-1, -1};
    if (pipe(metrics) != 0) { close(req[0]); close(req[1]); close(resp[0]); close(resp[1]); die_errno("pipe"); }
    pid_t child = fork();
    if (child < 0) die_errno("fork");

    if (child == 0) {
        close(req[1]); close(resp[0]); close(metrics[0]);
        std::vector<std::uint8_t> buf(cfg.bytes);
        try {
            for (std::size_t i = 0; i < cfg.warmup; ++i) {
                std::uint32_t got = 0;
                if (read_full(req[0], &got, sizeof(got)) != sizeof(got) || got != len) _exit(2);
                if (read_full(req[0], buf.data(), cfg.bytes) != static_cast<ssize_t>(cfg.bytes)) _exit(3);
                write_full(resp[1], &got, sizeof(got));
                write_full(resp[1], buf.data(), cfg.bytes);
            }
            send_usage_window(metrics[1], 1);
            for (std::size_t i = 0; i < cfg.messages; ++i) {
                std::uint32_t got = 0;
                if (read_full(req[0], &got, sizeof(got)) != sizeof(got) || got != len) _exit(2);
                if (read_full(req[0], buf.data(), cfg.bytes) != static_cast<ssize_t>(cfg.bytes)) _exit(3);
                write_full(resp[1], &got, sizeof(got));
                write_full(resp[1], buf.data(), cfg.bytes);
            }
        } catch (...) {
            _exit(4);
        }
        send_usage_window(metrics[1], 2);
        close(req[0]); close(resp[1]); close(metrics[1]);
        _exit(0);
    }

    close(req[0]); close(resp[1]); close(metrics[1]);
    std::vector<std::uint8_t> echoed(cfg.bytes);
    for (std::size_t i = 0; i < cfg.warmup; ++i) {
        write_full(req[1], &len, sizeof(len));
        write_full(req[1], payload.data(), cfg.bytes);
        std::uint32_t got = 0;
        if (read_full(resp[0], &got, sizeof(got)) != sizeof(got)) throw std::runtime_error("pipe warmup response failed");
        if (got != len || read_full(resp[0], echoed.data(), cfg.bytes) != static_cast<ssize_t>(cfg.bytes)) throw std::runtime_error("pipe warmup payload failed");
    }

    const auto child_ready = receive_usage_window(metrics[0]);
    if (child_ready.phase != 1) throw std::runtime_error("invalid child usage-ready message");
    const auto self_before = get_usage(RUSAGE_SELF);
    std::vector<double> samples;
    samples.reserve(cfg.messages);
    const auto bench_start = Clock::now();
    const auto pace_start = bench_start;
    for (std::size_t i = 0; i < cfg.messages; ++i) {
        pace_if_needed(cfg.rate, pace_start, i);
        auto t0 = Clock::now();
        write_full(req[1], &len, sizeof(len));
        write_full(req[1], payload.data(), cfg.bytes);
        std::uint32_t got = 0;
        if (read_full(resp[0], &got, sizeof(got)) != sizeof(got) || got != len) throw std::runtime_error("pipe response failed");
        if (read_full(resp[0], echoed.data(), cfg.bytes) != static_cast<ssize_t>(cfg.bytes)) throw std::runtime_error("pipe echo failed");
        auto t1 = Clock::now();
        samples.push_back(std::chrono::duration<double, std::micro>(t1 - t0).count());
    }
    const auto bench_end = Clock::now();
    const auto self_after = get_usage(RUSAGE_SELF);
    const auto child_done = receive_usage_window(metrics[0]);
    if (child_done.phase != 2) throw std::runtime_error("invalid child usage-complete message");
    close(req[1]); close(resp[0]); close(metrics[0]);
    check_child_exit(child);

    Result r;
    compute_common(r, cfg, samples, bench_start, bench_end, self_before, self_after, child_ready.usage, child_done.usage);
    return r;
}

// ---------------- Unix Domain Socket ----------------
Result run_unix_socket(const Config& cfg) {
    int sv[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, sv) != 0) die_errno("socketpair");

    const auto payload = make_payload(cfg.bytes);
    const std::uint32_t len = static_cast<std::uint32_t>(cfg.bytes);
    int metrics[2]{-1, -1};
    if (pipe(metrics) != 0) { close(sv[0]); close(sv[1]); die_errno("pipe"); }
    pid_t child = fork();
    if (child < 0) die_errno("fork");

    if (child == 0) {
        close(sv[0]); close(metrics[0]);
        std::vector<std::uint8_t> buf(cfg.bytes);
        try {
            for (std::size_t i = 0; i < cfg.warmup; ++i) {
                std::uint32_t got = 0;
                if (read_full(sv[1], &got, sizeof(got)) != sizeof(got) || got != len) _exit(2);
                if (read_full(sv[1], buf.data(), cfg.bytes) != static_cast<ssize_t>(cfg.bytes)) _exit(3);
                write_full(sv[1], &got, sizeof(got));
                write_full(sv[1], buf.data(), cfg.bytes);
            }
            send_usage_window(metrics[1], 1);
            for (std::size_t i = 0; i < cfg.messages; ++i) {
                std::uint32_t got = 0;
                if (read_full(sv[1], &got, sizeof(got)) != sizeof(got) || got != len) _exit(2);
                if (read_full(sv[1], buf.data(), cfg.bytes) != static_cast<ssize_t>(cfg.bytes)) _exit(3);
                write_full(sv[1], &got, sizeof(got));
                write_full(sv[1], buf.data(), cfg.bytes);
            }
        } catch (...) { _exit(4); }
        send_usage_window(metrics[1], 2);
        close(sv[1]); close(metrics[1]);
        _exit(0);
    }

    close(sv[1]); close(metrics[1]);
    std::vector<std::uint8_t> echoed(cfg.bytes);
    for (std::size_t i = 0; i < cfg.warmup; ++i) {
        write_full(sv[0], &len, sizeof(len));
        write_full(sv[0], payload.data(), cfg.bytes);
        std::uint32_t got = 0;
        if (read_full(sv[0], &got, sizeof(got)) != sizeof(got) || got != len) throw std::runtime_error("socket warmup response failed");
        if (read_full(sv[0], echoed.data(), cfg.bytes) != static_cast<ssize_t>(cfg.bytes)) throw std::runtime_error("socket warmup payload failed");
    }

    const auto child_ready = receive_usage_window(metrics[0]);
    if (child_ready.phase != 1) throw std::runtime_error("invalid child usage-ready message");
    const auto self_before = get_usage(RUSAGE_SELF);
    std::vector<double> samples;
    samples.reserve(cfg.messages);
    const auto bench_start = Clock::now();
    const auto pace_start = bench_start;
    for (std::size_t i = 0; i < cfg.messages; ++i) {
        pace_if_needed(cfg.rate, pace_start, i);
        auto t0 = Clock::now();
        write_full(sv[0], &len, sizeof(len));
        write_full(sv[0], payload.data(), cfg.bytes);
        std::uint32_t got = 0;
        if (read_full(sv[0], &got, sizeof(got)) != sizeof(got) || got != len) throw std::runtime_error("socket response failed");
        if (read_full(sv[0], echoed.data(), cfg.bytes) != static_cast<ssize_t>(cfg.bytes)) throw std::runtime_error("socket echo failed");
        auto t1 = Clock::now();
        samples.push_back(std::chrono::duration<double, std::micro>(t1 - t0).count());
    }
    const auto bench_end = Clock::now();
    const auto self_after = get_usage(RUSAGE_SELF);
    const auto child_done = receive_usage_window(metrics[0]);
    if (child_done.phase != 2) throw std::runtime_error("invalid child usage-complete message");
    close(sv[0]); close(metrics[0]);
    check_child_exit(child);

    Result r;
    compute_common(r, cfg, samples, bench_start, bench_end, self_before, self_after, child_ready.usage, child_done.usage);
    return r;
}

// ---------------- System V Message Queue ----------------
constexpr std::size_t MQ_CHUNK = 3968; // leave room for chunk header below common Linux MSGMAX defaults

struct MQFrame {
    long mtype;
    std::uint32_t message_id;
    std::uint32_t chunk_index;
    std::uint32_t chunk_count;
    std::uint32_t length;
    char data[MQ_CHUNK];
};

void mq_send_payload(int qid, long mtype, std::uint32_t message_id, const std::vector<std::uint8_t>& data) {
    const std::size_t count = (data.size() + MQ_CHUNK - 1) / MQ_CHUNK;
    for (std::size_t i = 0; i < count; ++i) {
        MQFrame frame{};
        frame.mtype = mtype;
        frame.message_id = message_id;
        frame.chunk_index = static_cast<std::uint32_t>(i);
        frame.chunk_count = static_cast<std::uint32_t>(count);
        const std::size_t off = i * MQ_CHUNK;
        frame.length = static_cast<std::uint32_t>(std::min(MQ_CHUNK, data.size() - off));
        std::memcpy(frame.data, data.data() + off, frame.length);
        const std::size_t msgsz = sizeof(frame) - MQ_CHUNK + frame.length - sizeof(long);
        if (msgsnd(qid, &frame, msgsz, 0) != 0) die_errno("msgsnd");
    }
}

void mq_receive_payload(int qid, long mtype, std::uint32_t expected_id, std::size_t expected_bytes, std::vector<std::uint8_t>& out) {
    MQFrame frame{};
    std::size_t received = 0;
    std::uint32_t expected_chunks = 0;
    while (received < expected_bytes) {
        ssize_t n = msgrcv(qid, &frame, sizeof(frame) - sizeof(long), mtype, 0);
        if (n < 0) die_errno("msgrcv");
        if (frame.message_id != expected_id) throw std::runtime_error("message queue frame id mismatch");
        if (expected_chunks == 0) expected_chunks = frame.chunk_count;
        if (frame.chunk_count != expected_chunks || frame.chunk_index >= expected_chunks) throw std::runtime_error("message queue chunk metadata invalid");
        if (received + frame.length > expected_bytes) throw std::runtime_error("message queue payload overrun");
        std::memcpy(out.data() + received, frame.data, frame.length);
        received += frame.length;
    }
    if (received != expected_bytes) throw std::runtime_error("message queue payload underflow");
}

Result run_message_queue(const Config& cfg) {
    int req = msgget(IPC_PRIVATE, 0600 | IPC_CREAT);
    int resp = msgget(IPC_PRIVATE, 0600 | IPC_CREAT);
    if (req < 0 || resp < 0) die_errno("msgget");

    const auto cleanup = [&]() {
        if (req >= 0) msgctl(req, IPC_RMID, nullptr);
        if (resp >= 0) msgctl(resp, IPC_RMID, nullptr);
    };

    const auto payload = make_payload(cfg.bytes);
    int metrics[2]{-1, -1};
    if (pipe(metrics) != 0) { cleanup(); die_errno("pipe"); }
    pid_t child = fork();
    if (child < 0) { cleanup(); die_errno("fork"); }

    if (child == 0) {
        close(metrics[0]);
        std::vector<std::uint8_t> buf(cfg.bytes);
        std::vector<std::uint8_t> echo(cfg.bytes);
        try {
            for (std::size_t i = 0; i < cfg.warmup; ++i) {
                mq_receive_payload(req, 1, static_cast<std::uint32_t>(i), cfg.bytes, buf);
                std::copy(buf.begin(), buf.end(), echo.begin());
                mq_send_payload(resp, 1, static_cast<std::uint32_t>(i), echo);
            }
            send_usage_window(metrics[1], 1);
            for (std::size_t i = 0; i < cfg.messages; ++i) {
                const std::uint32_t message_id = static_cast<std::uint32_t>(cfg.warmup + i);
                mq_receive_payload(req, 1, message_id, cfg.bytes, buf);
                std::copy(buf.begin(), buf.end(), echo.begin());
                mq_send_payload(resp, 1, message_id, echo);
            }
        } catch (...) { _exit(4); }
        send_usage_window(metrics[1], 2);
        close(metrics[1]);
        _exit(0);
    }

    close(metrics[1]);
    std::vector<std::uint8_t> echoed(cfg.bytes);
    for (std::size_t i = 0; i < cfg.warmup; ++i) {
        mq_send_payload(req, 1, static_cast<std::uint32_t>(i), payload);
        mq_receive_payload(resp, 1, static_cast<std::uint32_t>(i), cfg.bytes, echoed);
    }

    const auto child_ready = receive_usage_window(metrics[0]);
    if (child_ready.phase != 1) throw std::runtime_error("invalid child usage-ready message");
    const auto self_before = get_usage(RUSAGE_SELF);
    std::vector<double> samples;
    samples.reserve(cfg.messages);
    const auto bench_start = Clock::now();
    const auto pace_start = bench_start;
    for (std::size_t i = 0; i < cfg.messages; ++i) {
        pace_if_needed(cfg.rate, pace_start, i);
        const std::uint32_t message_id = static_cast<std::uint32_t>(cfg.warmup + i);
        auto t0 = Clock::now();
        mq_send_payload(req, 1, message_id, payload);
        mq_receive_payload(resp, 1, message_id, cfg.bytes, echoed);
        auto t1 = Clock::now();
        samples.push_back(std::chrono::duration<double, std::micro>(t1 - t0).count());
    }
    const auto bench_end = Clock::now();
    const auto self_after = get_usage(RUSAGE_SELF);
    const auto child_done = receive_usage_window(metrics[0]);
    if (child_done.phase != 2) throw std::runtime_error("invalid child usage-complete message");
    close(metrics[0]);
    cleanup();
    check_child_exit(child);

    Result r;
    compute_common(r, cfg, samples, bench_start, bench_end, self_before, self_after, child_ready.usage, child_done.usage);
    return r;
}

// ---------------- POSIX Shared Memory ----------------
struct ShmHeader {
    std::size_t request_len;
    std::size_t response_len;
    std::uint32_t ready;
};

std::string unique_name(const char* prefix, pid_t pid) {
    return std::string("/") + prefix + "_" + std::to_string(static_cast<long long>(pid));
}

Result run_shared_memory(const Config& cfg) {
    const pid_t owner = getpid();
    const std::string shm_name = unique_name("smartipc_shm", owner);
    const std::string req_name = unique_name("smartipc_req", owner);
    const std::string resp_name = unique_name("smartipc_resp", owner);

    const std::size_t region = sizeof(ShmHeader) + cfg.bytes * 2;
    int fd = shm_open(shm_name.c_str(), O_CREAT | O_EXCL | O_RDWR, 0600);
    if (fd < 0) die_errno("shm_open");
    auto cleanup = [&]() {
        if (fd >= 0) close(fd);
        shm_unlink(shm_name.c_str());
        sem_unlink(req_name.c_str());
        sem_unlink(resp_name.c_str());
    };
    if (ftruncate(fd, static_cast<off_t>(region)) != 0) { cleanup(); die_errno("ftruncate"); }

    void* map = mmap(nullptr, region, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (map == MAP_FAILED) { cleanup(); die_errno("mmap"); }
    auto* header = static_cast<ShmHeader*>(map);
    auto* request_buf = reinterpret_cast<std::uint8_t*>(header + 1);
    auto* response_buf = request_buf + cfg.bytes;
    header->request_len = cfg.bytes;
    header->response_len = 0;
    header->ready = 0;

    sem_t* req_sem = sem_open(req_name.c_str(), O_CREAT | O_EXCL, 0600, 0);
    sem_t* resp_sem = sem_open(resp_name.c_str(), O_CREAT | O_EXCL, 0600, 0);
    if (req_sem == SEM_FAILED || resp_sem == SEM_FAILED) { munmap(map, region); cleanup(); die_errno("sem_open"); }

    int metrics[2]{-1, -1};
    if (pipe(metrics) != 0) { sem_close(req_sem); sem_close(resp_sem); munmap(map, region); cleanup(); die_errno("pipe"); }
    pid_t child = fork();
    if (child < 0) { sem_close(req_sem); sem_close(resp_sem); munmap(map, region); cleanup(); die_errno("fork"); }

    if (child == 0) {
        close(metrics[0]);
        try {
            std::vector<std::uint8_t> tmp(cfg.bytes);
            for (std::size_t i = 0; i < cfg.warmup; ++i) {
                while (sem_wait(req_sem) != 0) {
                    if (errno == EINTR) continue;
                    _exit(2);
                }
                if (header->request_len != cfg.bytes) _exit(3);
                std::memcpy(tmp.data(), request_buf, cfg.bytes);
                std::memcpy(response_buf, tmp.data(), cfg.bytes);
                header->response_len = cfg.bytes;
                header->ready = 1;
                if (sem_post(resp_sem) != 0) _exit(4);
            }
            send_usage_window(metrics[1], 1);
            for (std::size_t i = 0; i < cfg.messages; ++i) {
                while (sem_wait(req_sem) != 0) {
                    if (errno == EINTR) continue;
                    _exit(2);
                }
                if (header->request_len != cfg.bytes) _exit(3);
                std::memcpy(tmp.data(), request_buf, cfg.bytes);
                std::memcpy(response_buf, tmp.data(), cfg.bytes);
                header->response_len = cfg.bytes;
                header->ready = 1;
                if (sem_post(resp_sem) != 0) _exit(4);
            }
        } catch (...) { _exit(5); }
        send_usage_window(metrics[1], 2);
        sem_close(req_sem); sem_close(resp_sem); munmap(map, region); close(metrics[1]); _exit(0);
    }

    const auto payload = make_payload(cfg.bytes);
    close(metrics[1]);
    std::vector<std::uint8_t> echoed(cfg.bytes);
    for (std::size_t i = 0; i < cfg.warmup; ++i) {
        std::memcpy(request_buf, payload.data(), cfg.bytes);
        header->request_len = cfg.bytes;
        header->ready = 0;
        if (sem_post(req_sem) != 0) die_errno("sem_post request");
        while (sem_wait(resp_sem) != 0) {
            if (errno == EINTR) continue;
            die_errno("sem_wait response");
        }
        if (header->response_len != cfg.bytes || header->ready != 1) throw std::runtime_error("shared memory warmup response failed");
        std::memcpy(echoed.data(), response_buf, cfg.bytes);
    }

    const auto child_ready = receive_usage_window(metrics[0]);
    if (child_ready.phase != 1) throw std::runtime_error("invalid child usage-ready message");
    const auto self_before = get_usage(RUSAGE_SELF);
    std::vector<double> samples;
    samples.reserve(cfg.messages);
    const auto bench_start = Clock::now();
    const auto pace_start = bench_start;
    for (std::size_t i = 0; i < cfg.messages; ++i) {
        pace_if_needed(cfg.rate, pace_start, i);
        auto t0 = Clock::now();
        std::memcpy(request_buf, payload.data(), cfg.bytes);
        header->request_len = cfg.bytes;
        header->ready = 0;
        if (sem_post(req_sem) != 0) die_errno("sem_post request");
        while (sem_wait(resp_sem) != 0) {
            if (errno == EINTR) continue;
            die_errno("sem_wait response");
        }
        if (header->response_len != cfg.bytes || header->ready != 1) throw std::runtime_error("shared memory response failed");
        std::memcpy(echoed.data(), response_buf, cfg.bytes);
        auto t1 = Clock::now();
        samples.push_back(std::chrono::duration<double, std::micro>(t1 - t0).count());
    }
    const auto bench_end = Clock::now();
    const auto self_after = get_usage(RUSAGE_SELF);
    const auto child_done = receive_usage_window(metrics[0]);
    if (child_done.phase != 2) throw std::runtime_error("invalid child usage-complete message");

    sem_close(req_sem); sem_close(resp_sem);
    munmap(map, region);
    close(metrics[0]);
    cleanup();
    check_child_exit(child);

    Result r;
    compute_common(r, cfg, samples, bench_start, bench_end, self_before, self_after, child_ready.usage, child_done.usage);
    return r;
}

} // namespace

Result run_benchmark(const Config& cfg) {
    if (cfg.ipc == "pipe") return run_pipe(cfg);
    if (cfg.ipc == "shared_memory") return run_shared_memory(cfg);
    if (cfg.ipc == "message_queue") return run_message_queue(cfg);
    if (cfg.ipc == "unix_socket") return run_unix_socket(cfg);
    throw std::invalid_argument("Unsupported IPC mechanism: " + cfg.ipc);
}

std::string result_to_json(const Result& r) {
    std::ostringstream out;
    out << std::fixed << std::setprecision(6)
        << "{"
        << "\"ipc\":\"" << r.ipc << "\","
        << "\"bytes\":" << r.bytes << ","
        << "\"messages\":" << r.messages << ","
        << "\"warmup\":" << r.warmup << ","
        << "\"requested_rate\":" << r.requested_rate << ","
        << "\"processes\":" << r.processes << ","
        << "\"elapsed_ms\":" << r.elapsed_ms << ","
        << "\"avg_latency_us\":" << r.avg_latency_us << ","
        << "\"p50_latency_us\":" << r.p50_latency_us << ","
        << "\"p95_latency_us\":" << r.p95_latency_us << ","
        << "\"max_latency_us\":" << r.max_latency_us << ","
        << "\"throughput_mbps\":" << r.throughput_mbps << ","
        << "\"cpu_percent\":" << r.cpu_percent << ","
        << "\"cpu_scope\":\"parent+child during measured interval\","
        << "\"peak_rss_mb\":" << r.peak_rss_mb << ","
        << "\"load_1m\":" << r.load_1m << ","
        << "\"page_size\":" << r.page_size
        << "}";
    return out.str();
}
