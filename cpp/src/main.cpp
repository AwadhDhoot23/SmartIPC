#include "benchmark.hpp"

#include <cerrno>
#include <cstdlib>
#include <exception>
#include <iostream>
#include <string>

namespace {

void usage() {
    std::cerr <<
        "Usage: smartipc_bench --ipc <pipe|shared_memory|message_queue|unix_socket> "
        "[--bytes N] [--messages N] [--warmup N] [--rate R]\n";
}

std::size_t parse_size(const std::string& value, const char* flag) {
    try {
        std::size_t pos = 0;
        unsigned long long v = std::stoull(value, &pos);
        if (pos != value.size() || v == 0) throw std::invalid_argument("invalid");
        return static_cast<std::size_t>(v);
    } catch (...) {
        throw std::invalid_argument(std::string("Invalid value for ") + flag + ": " + value);
    }
}

double parse_double(const std::string& value, const char* flag) {
    try {
        std::size_t pos = 0;
        double v = std::stod(value, &pos);
        if (pos != value.size() || v < 0.0) throw std::invalid_argument("invalid");
        return v;
    } catch (...) {
        throw std::invalid_argument(std::string("Invalid value for ") + flag + ": " + value);
    }
}

} // namespace

int main(int argc, char** argv) {
    try {
        if (argc == 1) {
            usage();
            return 2;
        }

        Config cfg;
        for (int i = 1; i < argc; ++i) {
            std::string arg = argv[i];
            auto need_value = [&](const char* flag) -> std::string {
                if (i + 1 >= argc) throw std::invalid_argument(std::string("Missing value for ") + flag);
                return argv[++i];
            };

            if (arg == "--ipc") cfg.ipc = need_value("--ipc");
            else if (arg == "--bytes") cfg.bytes = parse_size(need_value("--bytes"), "--bytes");
            else if (arg == "--messages") cfg.messages = parse_size(need_value("--messages"), "--messages");
            else if (arg == "--warmup") cfg.warmup = parse_size(need_value("--warmup"), "--warmup");
            else if (arg == "--rate") cfg.rate = parse_double(need_value("--rate"), "--rate");
            else if (arg == "--help" || arg == "-h") {
                usage();
                return 0;
            } else {
                throw std::invalid_argument("Unknown argument: " + arg);
            }
        }

        const std::string allowed[] = {"pipe", "shared_memory", "message_queue", "unix_socket"};
        bool ok = false;
        for (const auto& x : allowed) if (cfg.ipc == x) ok = true;
        if (!ok) throw std::invalid_argument("Unsupported IPC mechanism: " + cfg.ipc);
        if (cfg.messages == 0) throw std::invalid_argument("--messages must be > 0");
        if (cfg.bytes > 16 * 1024 * 1024) throw std::invalid_argument("--bytes is capped at 16 MiB for this prototype");

        Result result = run_benchmark(cfg);
        std::cout << result_to_json(result) << '\n';
        return 0;
    } catch (const std::exception& ex) {
        std::cerr << "smartipc_bench: " << ex.what() << '\n';
        return 1;
    }
}
