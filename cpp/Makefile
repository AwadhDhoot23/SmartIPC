CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic -pthread
LDFLAGS ?= -pthread -lrt

BUILD := build
TARGET := $(BUILD)/smartipc_bench
SRC := src/main.cpp src/benchmark.cpp
INC := -Iinclude

all: $(TARGET)

$(BUILD):
	mkdir -p $(BUILD)

$(TARGET): $(BUILD) $(SRC) include/benchmark.hpp
	$(CXX) $(CXXFLAGS) $(INC) $(SRC) -o $(TARGET) $(LDFLAGS)

clean:
	rm -rf $(BUILD)

.PHONY: all clean
